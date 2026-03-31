import rateLimit from 'express-rate-limit';

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please slow down.' },
  keyGenerator: (req) => req.user?.sessionId || req.ip,
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  keyGenerator: (req) => req.ip,
});

export const workoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
  keyGenerator: (req) => req.user?.sessionId || req.ip,
});
