import { verifyAccessToken } from '../services/auth/jwt.js';

/**
 * Middleware: verify JWT and attach req.user.
 * Attaches: { sessionId, sessionType: 'guest'|'member', memberId? }
 */
export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      sessionId: payload.session_id,
      sessionType: payload.session_type,
      memberId: payload.member_id || null,
      guestId: payload.guest_id || null,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Middleware: require a logged-in member (not a guest).
 */
export function requireMember(req, res, next) {
  if (req.user?.sessionType !== 'member') {
    return res.status(403).json({ error: 'This action requires a member account. Please log in with your USMS number.' });
  }
  next();
}
