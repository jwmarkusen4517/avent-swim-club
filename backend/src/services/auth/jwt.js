import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: REFRESH_TOKEN_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

export function decodeToken(token) {
  return jwt.decode(token);
}
