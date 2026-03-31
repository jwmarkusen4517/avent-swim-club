import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { streamConversation } from '../services/ai/conversation.js';
import { authenticate } from '../middleware/authenticate.js';
import { chatLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// ── POST /chat/message ────────────────────────────────────────────────
// Stream an AI response via SSE.
// Body: { message: string }
router.post('/message', authenticate, chatLimiter, async (req, res, next) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (message.length > 4000) {
    return res.status(400).json({ error: 'Message is too long.' });
  }

  try {
    await streamConversation({
      sessionId: req.user.sessionId,
      memberId: req.user.memberId,
      userMessage: message.trim(),
      res,
    });
  } catch (err) {
    // If headers not yet sent, delegate to error handler
    if (!res.headersSent) next(err);
    else console.error('[chat/message] Stream error after headers sent:', err.message);
  }
});

// ── GET /chat/history ─────────────────────────────────────────────────
// Returns recent chat history for the current session.
// Query: ?limit=20&before=<message_id>
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const before = req.query.before;

    let query = supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('session_id', req.user.sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      const { data: ref } = await supabase
        .from('chat_messages')
        .select('created_at')
        .eq('id', before)
        .single();
      if (ref) query = query.lt('created_at', ref.created_at);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ messages: (data || []).reverse() });
  } catch (err) {
    next(err);
  }
});

export default router;
