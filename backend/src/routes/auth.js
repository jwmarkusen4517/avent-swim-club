import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../services/auth/jwt.js';
import { validateUSMS } from '../services/auth/usms.js';
import { migrateGuestToMember } from '../services/auth/migration.js';
import { authenticate } from '../middleware/authenticate.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// ── POST /auth/guest ─────────────────────────────────────────────────
// Create a guest session. Returns access JWT.
// Body: none required (guest_id optional — client can pre-generate)
router.post('/guest', async (req, res, next) => {
  try {
    const guestId = req.body?.guest_id || crypto.randomUUID();

    // Check if this guest already has a session
    const { data: existing } = await supabase
      .from('sessions')
      .select('id, session_type')
      .eq('guest_id', guestId)
      .single();

    let sessionId;

    if (existing) {
      sessionId = existing.id;
      await supabase
        .from('sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', sessionId);
    } else {
      const { data, error } = await supabase
        .from('sessions')
        .insert({ session_type: 'guest', guest_id: guestId })
        .select('id')
        .single();
      if (error) throw error;
      sessionId = data.id;
    }

    const accessToken = signAccessToken({
      session_id: sessionId,
      session_type: 'guest',
      guest_id: guestId,
    });

    res.json({ access_token: accessToken, session_type: 'guest', guest_id: guestId });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/usms ───────────────────────────────────────────────────
// Validate USMS number. Creates or fetches member record.
// Migrates guest session to member session if guest JWT present.
// Body: { usms_number: string }
router.post('/usms', authLimiter, authenticate, async (req, res, next) => {
  try {
    const { usms_number } = req.body;
    const validation = validateUSMS(usms_number);

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const canonical = validation.canonical;

    // Upsert member record
    const { data: member, error: memberError } = await supabase
      .from('members')
      .upsert(
        { usms_number: canonical },
        { onConflict: 'usms_number', ignoreDuplicates: false }
      )
      .select('id, usms_number, display_name, preferences')
      .single();

    if (memberError) throw memberError;

    // Ensure swimmer_profile exists
    await supabase
      .from('swimmer_profiles')
      .upsert({ member_id: member.id }, { onConflict: 'member_id', ignoreDuplicates: true });

    // Migrate guest → member session
    const { sessionId, sessionType } = req.user;
    if (sessionType === 'guest') {
      await migrateGuestToMember(sessionId, member.id);
    }

    // Generate tokens
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from('sessions')
      .update({
        session_type: 'member',
        member_id: member.id,
        refresh_token_hash: refreshHash,
        refresh_token_expires_at: refreshExpiry,
        last_active_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    const accessToken = signAccessToken({
      session_id: sessionId,
      session_type: 'member',
      member_id: member.id,
    });

    // Refresh token in httpOnly cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth/refresh',
    });

    res.json({
      access_token: accessToken,
      session_type: 'member',
      member: {
        id: member.id,
        usms_number: member.usms_number,
        display_name: member.display_name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/refresh ────────────────────────────────────────────────
// Rotate refresh token. Issues new access JWT.
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token.' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Refresh token invalid or expired.' });
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('id, session_type, member_id, refresh_token_hash, refresh_token_expires_at')
      .eq('id', payload.session_id)
      .single();

    if (!session) return res.status(401).json({ error: 'Session not found.' });
    if (new Date(session.refresh_token_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Refresh token expired.' });
    }

    const valid = await bcrypt.compare(refreshToken, session.refresh_token_hash);
    if (!valid) return res.status(401).json({ error: 'Refresh token mismatch.' });

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);
    const newRefreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from('sessions')
      .update({
        refresh_token_hash: newRefreshHash,
        refresh_token_expires_at: newRefreshExpiry,
        last_active_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    const accessToken = signAccessToken({
      session_id: session.id,
      session_type: session.session_type,
      member_id: session.member_id || undefined,
    });

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth/refresh',
    });

    res.json({ access_token: accessToken });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await supabase
      .from('sessions')
      .update({ refresh_token_hash: null, refresh_token_expires_at: null })
      .eq('id', req.user.sessionId);

    res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
