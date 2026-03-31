import { anthropic, MODEL } from '../../config/anthropic.js';
import { supabase } from '../../config/supabase.js';

const SYSTEM_PROMPT = `You are the AI coach for Avent Swim Club, a USMS virtual workout group.

Personality: Warm, direct, genuinely funny — occasionally poetic about the sport. You use context naturally and never ask for information already on hand.

Workout design: Tailor the daily workout to the swimmer. Stay true to the spirit but make it personal. Focus drills on something specific. Build the main set around their goals. Shorten warm-up and cool-down if they're on a tight schedule. Add an optional fun set referencing what you know about them.

Logging and analysis: Log every workout with yardage, sets, intervals, and actual times.

Coaching judgment: If a swimmer seems frustrated, discouraged, or mentions quitting — slow down. Listen first. Coach second. If something sounds medical, step back from coach mode and say so clearly.

Terminology: Freestyle assumed unless specified. Yardage pool (25 yards) assumed unless otherwise noted. Use real swimming terminology.

Style: Respond like a real coach who knows this swimmer — not a chatbot. Short responses are fine. Not every reply needs to be comprehensive.`;

/**
 * Build the message array from recent chat history + new user message.
 */
async function buildMessages(sessionId, userMessage, limit = 20) {
  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const messages = (history || []).reverse().map(row => ({
    role: row.role,
    content: row.content,
  }));

  messages.push({ role: 'user', content: userMessage });
  return messages;
}

/**
 * Build swimmer context block from member profile.
 * Injected as the first user message if the member has a profile.
 */
async function buildSwimmerContext(memberId) {
  if (!memberId) return null;

  const [profileRes, calendarRes, contactsRes] = await Promise.all([
    supabase
      .from('swimmer_profiles')
      .select('background, training_goals, preferences, key_learnings, notes')
      .eq('member_id', memberId)
      .single(),
    supabase
      .from('calendars')
      .select('title, event_date, reminder_at, description')
      .eq('member_id', memberId)
      .eq('completed', false)
      .gte('event_date', new Date().toISOString())
      .order('event_date', { ascending: true })
      .limit(10),
    supabase
      .from('contacts')
      .select('name, relationship, context')
      .eq('member_id', memberId)
      .limit(20),
  ]);

  const profile = profileRes.data;
  if (!profile) return null;

  const lines = ['<swimmer_context>'];
  if (profile.background) lines.push(`Background: ${profile.background}`);
  if (profile.training_goals) lines.push(`Goals: ${profile.training_goals}`);
  if (profile.preferences) lines.push(`Preferences: ${profile.preferences}`);
  if (profile.key_learnings) lines.push(`Key learnings: ${profile.key_learnings}`);

  if (calendarRes.data?.length) {
    lines.push(`\nUpcoming: ${calendarRes.data.map(e => `${e.title} (${e.event_date})`).join(', ')}`);
  }

  if (contactsRes.data?.length) {
    lines.push(`\nKnown contacts: ${contactsRes.data.map(c => `${c.name} (${c.relationship})`).join(', ')}`);
  }

  if (profile.notes?.length) {
    const recent = profile.notes.slice(-3);
    lines.push(`\nRecent notes:\n${recent.map(n => `- [${n.date}] ${n.entry}`).join('\n')}`);
  }

  lines.push('</swimmer_context>');
  return lines.join('\n');
}

/**
 * Stream a chat response to the Express response object via SSE.
 * Saves both user and assistant messages to the database.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string|null} params.memberId
 * @param {string} params.userMessage
 * @param {import('express').Response} params.res
 */
export async function streamConversation({ sessionId, memberId, userMessage, res }) {
  // Save user message first
  await supabase.from('chat_messages').insert({
    session_id: sessionId,
    member_id: memberId || null,
    role: 'user',
    content: userMessage,
  });

  const [messages, swimmerContext] = await Promise.all([
    buildMessages(sessionId, userMessage),
    buildSwimmerContext(memberId),
  ]);

  let systemPrompt = SYSTEM_PROMPT;
  if (swimmerContext) {
    systemPrompt += `\n\n${swimmerContext}`;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let assistantContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    stream.on('text', (text) => {
      assistantContent += text;
      res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
    });

    const finalMessage = await stream.finalMessage();
    inputTokens = finalMessage.usage?.input_tokens || 0;
    outputTokens = finalMessage.usage?.output_tokens || 0;

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong. Please try again.' })}\n\n`);
    res.end();
    throw err;
  } finally {
    // Save assistant message regardless of success/failure
    if (assistantContent) {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        member_id: memberId || null,
        role: 'assistant',
        content: assistantContent,
        metadata: {
          model: MODEL,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      });
    }
  }
}
