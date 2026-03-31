import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { startScheduler } from './services/cleanup/scheduler.js';

import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';
import workoutRouter from './routes/workout.js';
import healthRouter from './routes/health.js';

const app = express();

// ── Middleware ────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl) in dev
    if (!origin || env.corsAllowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed.`));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/workout', workoutRouter);
app.use('/health', healthRouter);
app.use('/api/v1', healthRouter);

// ── Error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────
app.listen(env.port, () => {
  console.log(`[server] Running on port ${env.port} (${env.nodeEnv})`);
  startScheduler();
});

export default app;
