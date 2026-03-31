import { anthropic, MODEL } from '../../config/anthropic.js';
import { supabase } from '../../config/supabase.js';

const SYSTEM_PROMPT = `You are processing today's chat history for Avent Swim Club to extract meaningful information and update structured records.

Role: Precise and conservative. Only update what was clearly stated or clearly implied. Do not infer beyond what was said.

Review the chat history and return a JSON object with any of these keys — only include keys where there are actual updates:

{
  "swimmer_profile": {
    "background": "...",
    "training_goals": "...",
    "preferences": "...",
    "key_learnings": "...",
    "note": { "date": "YYYY-MM-DD", "entry": "...", "type": "progress|flag|pattern|notable" }
  },
  "calendar": [
    { "title": "...", "description": "...", "event_date": "YYYY-MM-DD", "is_reminder": false }
  ],
  "contacts": [
    { "name": "...", "relationship": "...", "context": "..." }
  ],
  "feedback": [
    { "category": "general|workout|ai|app|bug", "content": "...", "sentiment": "positive|neutral|negative" }
  ],
  "community_bulletin": [
    { "title": "...", "body": "...", "url": "...", "event_date": "YYYY-MM-DD", "bulletin_type": "article|event|meet|announcement" }
  ],
  "group_window": [
    { "content": "..." }
  ]
}

Rules:
- Return {} if nothing notable happened today.
- No records included if no changes.
- Output JSON only. No commentary.`;

/**
 * Run end-of-day background processing for a member.
 * Extracts structured updates from today's chat history.
 *
 * @param {string} memberId
 * @param {string} todayDate - ISO date string YYYY-MM-DD
 */
export async function processMemberDay(memberId, todayDate) {
  // Fetch today's chat messages for this member
  const { data: messages } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('member_id', memberId)
    .gte('created_at', `${todayDate}T00:00:00Z`)
    .lt('created_at', `${todayDate}T23:59:59Z`)
    .order('created_at', { ascending: true });

  if (!messages?.length) return null;

  const transcript = messages
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Today is ${todayDate}. Here is today's conversation:\n\n${transcript}`,
      },
    ],
  });

  const raw = response.content[0]?.text || '{}';
  let updates;
  try {
    updates = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    updates = match ? JSON.parse(match[0]) : {};
  }

  await applyUpdates(memberId, updates);
  return updates;
}

/**
 * Write extracted updates back to the database.
 */
async function applyUpdates(memberId, updates) {
  const ops = [];

  // Swimmer profile
  if (updates.swimmer_profile) {
    const patch = {};
    const sp = updates.swimmer_profile;
    if (sp.background) patch.background = sp.background;
    if (sp.training_goals) patch.training_goals = sp.training_goals;
    if (sp.preferences) patch.preferences = sp.preferences;
    if (sp.key_learnings) patch.key_learnings = sp.key_learnings;

    if (Object.keys(patch).length) {
      ops.push(
        supabase
          .from('swimmer_profiles')
          .upsert({ member_id: memberId, ...patch }, { onConflict: 'member_id' })
      );
    }

    if (sp.note) {
      // Append note to notes array
      ops.push(
        supabase.rpc('append_profile_note', { p_member_id: memberId, p_note: sp.note })
          .then(() => {}) // best-effort
          .catch(() => {})
      );
    }
  }

  // Calendar entries
  if (updates.calendar?.length) {
    ops.push(
      supabase.from('calendars').insert(
        updates.calendar.map(e => ({ member_id: memberId, ...e }))
      )
    );
  }

  // Contacts
  if (updates.contacts?.length) {
    ops.push(
      supabase.from('contacts').upsert(
        updates.contacts.map(c => ({ member_id: memberId, ...c })),
        { onConflict: 'member_id,name', ignoreDuplicates: false }
      )
    );
  }

  // Feedback
  if (updates.feedback?.length) {
    ops.push(
      supabase.from('feedback').insert(
        updates.feedback.map(f => ({ member_id: memberId, source_date: new Date().toISOString().split('T')[0], ...f }))
      )
    );
  }

  // Community bulletin
  if (updates.community_bulletin?.length) {
    ops.push(
      supabase.from('community_bulletin').insert(
        updates.community_bulletin.map(b => ({ member_id: memberId, ...b }))
      )
    );
  }

  // Group window
  if (updates.group_window?.length) {
    ops.push(
      supabase.from('group_window').insert(
        updates.group_window.map(g => ({ member_id: memberId, ...g }))
      )
    );
  }

  await Promise.allSettled(ops);
}
