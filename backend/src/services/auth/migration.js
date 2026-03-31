import { supabase } from '../../config/supabase.js';

/**
 * Migrate a guest session to a member session.
 * The chat_messages written under the guest session_id are automatically
 * queryable by the member via session_id FK — no row moves needed.
 * @param {string} sessionId - The existing guest session row id
 * @param {string} memberId  - The new or existing member's id
 */
export async function migrateGuestToMember(sessionId, memberId) {
  const { error } = await supabase
    .from('sessions')
    .update({
      session_type: 'member',
      member_id: memberId,
      guest_id: null,
      migrated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('session_type', 'guest');

  if (error) throw error;
}
