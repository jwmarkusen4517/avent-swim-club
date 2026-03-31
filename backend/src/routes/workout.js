import { Router } from 'express';
import { getTodayWorkout } from '../services/workout/generator.js';
import { authenticate } from '../middleware/authenticate.js';
import { workoutLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// ── GET /workout/today ────────────────────────────────────────────────
// Returns today's workout. Cached after first generation.
router.get('/today', authenticate, workoutLimiter, async (req, res, next) => {
  try {
    const workout = await getTodayWorkout();
    res.json({ workout });
  } catch (err) {
    next(err);
  }
});

export default router;
