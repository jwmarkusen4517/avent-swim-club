import { env } from '../config/env.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  console.error(`[${status}] ${req.method} ${req.path}:`, err.message);

  res.status(status).json({
    error: status < 500 ? err.message : 'Something went wrong. Please try again.',
    ...(env.nodeEnv === 'development' && { stack: err.stack }),
  });
}
