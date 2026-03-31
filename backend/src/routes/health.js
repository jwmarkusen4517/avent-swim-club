import { Router } from 'express';
import { runMidnightJob } from '../services/cleanup/scheduler.js';
import { env } from '../config/env.js';

const router = Router();

// ── GET /health ───────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── POST /internal/midnight ───────────────────────────────────────────
// Triggered by Render cron. Requires shared secret header.
router.post('/internal/midnight', async (req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== env.internalJobSecret) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    // Run async, return 202 immediately
    res.status(202).json({ ok: true, message: 'Midnight job started.' });
    await runMidnightJob();
  } catch (err) {
    console.error('[internal/midnight] Error:', err.message);
  }
});

export default router;
