import 'dotenv/config';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'INTERNAL_JOB_SECRET',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  internalJobSecret: process.env.INTERNAL_JOB_SECRET,
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  clubTimezone: process.env.CLUB_TIMEZONE || 'America/Chicago',
};
