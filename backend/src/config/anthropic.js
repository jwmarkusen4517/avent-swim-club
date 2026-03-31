import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';

export const anthropic = new Anthropic({
  apiKey: env.anthropicApiKey,
});

export const MODEL = 'claude-sonnet-4-6';
