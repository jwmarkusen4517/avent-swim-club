import { anthropic, MODEL } from '../../config/anthropic.js';

const SYSTEM_PROMPT = `You are generating today's daily workout for Avent Swim Club, a USMS masters swimming group.

Role: Generate a structured daily workout. Output structured JSON only. No conversational language.

News Hook: Weave in a brief one-sentence reference to a current swimming news item from the last 30 days. Be specific — name a real swimmer, meet, or record if possible. If uncertain, reference a timeless aspect of the sport.

Purpose Statement: One sentence at the top — what this workout trains and why it matters today.

Workout Structure:
- Total yardage: 2,000–3,500 yards
- Required sections: warmup, at least one drill set, a main set, and a cooldown
- Optional: fun set, threshold set, race pace set

Set object fields (exact names):
- sets: number of repetitions
- distance: yards per repetition
- type: one of "warmup" | "drill" | "threshold" | "distance" | "race_pace" | "cool_down" | "fun"
- interval: rest/send-off interval in seconds (interval-based sets only)
- pace: target pace description (pace-based sets only)
- description: brief coaching note for this set

Output format (JSON only, no markdown):
{
  "news_hook": "...",
  "purpose": "...",
  "sets": [
    { "sets": 4, "distance": 100, "type": "warmup", "description": "..." },
    { "sets": 6, "distance": 50, "type": "drill", "interval": 60, "description": "..." },
    ...
  ],
  "total_yardage": 2800
}`;

/**
 * Generate today's workout via AI.
 * @returns {{ content: object, news_hook: string, generation_ms: number }}
 */
export async function generateWorkout() {
  const start = Date.now();

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Generate today's workout. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`,
      },
    ],
  });

  const generation_ms = Date.now() - start;
  const raw = message.content[0]?.text || '';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to extract JSON from response if wrapped in text
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI returned invalid JSON for workout generation');
    parsed = JSON.parse(match[0]);
  }

  return {
    content: parsed,
    news_hook: parsed.news_hook || null,
    generation_ms,
  };
}
