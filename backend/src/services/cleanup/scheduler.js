import cron from 'node-cron';
import { supabase } from '../../config/supabase.js';
import { processMemberDay } from '../ai/background.js';
import { getTodayWorkout } from '../workout/generator.js';

/**
 * Run the midnight cleanup and background processing job.
 * Idempotent — safe to run twice.
 */
export async function runMidnightJob() {
  const jobId = await startJobRecord();
  const todayDate = new Date().toISOString().split('T')[0];
  const result = {};

  try {
    // 1. Clean up expired group_window rows
    const { data: gwClean } = await supabase.rpc('cleanup_expired_group_window');
    result.group_window_deleted = gwClean;

    // 2. Clean up old chat messages (older than 48h)
    const { data: msgClean } = await supabase.rpc('cleanup_old_messages');
    result.messages_deleted = msgClean;

    // 3. Clean up stale guest sessions
    const { data: sessClean } = await supabase.rpc('cleanup_stale_guest_sessions');
    result.guest_sessions_deleted = sessClean;

    // 4. Run background AI processing for all active members today
    const { data: activeMembers } = await supabase
      .from('chat_messages')
      .select('member_id')
      .not('member_id', 'is', null)
      .gte('created_at', `${todayDate}T00:00:00Z`)
      .then(res => ({
        data: [...new Set((res.data || []).map(r => r.member_id))],
      }));

    result.members_processed = 0;
    for (const memberId of activeMembers || []) {
      try {
        await processMemberDay(memberId, todayDate);
        result.members_processed++;
      } catch (err) {
        console.error(`Background processing failed for member ${memberId}:`, err.message);
      }
    }

    // 5. Pre-generate tomorrow's workout
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    try {
      await getTodayWorkout(); // Will use cache if today's already there
      result.workout_pregenerated = true;
    } catch (err) {
      result.workout_pregenerated = false;
      console.error('Failed to pre-generate workout:', err.message);
    }

    await completeJobRecord(jobId, result);
    console.log('[midnight-job] Complete:', result);
  } catch (err) {
    await failJobRecord(jobId, err.message);
    console.error('[midnight-job] Failed:', err.message);
    throw err;
  }
}

async function startJobRecord() {
  const { data } = await supabase
    .from('background_jobs')
    .insert({ job_type: 'midnight', status: 'running', started_at: new Date().toISOString() })
    .select('id')
    .single();
  return data?.id;
}

async function completeJobRecord(jobId, result) {
  if (!jobId) return;
  await supabase
    .from('background_jobs')
    .update({ status: 'complete', result, completed_at: new Date().toISOString() })
    .eq('id', jobId);
}

async function failJobRecord(jobId, error) {
  if (!jobId) return;
  await supabase
    .from('background_jobs')
    .update({ status: 'failed', error, completed_at: new Date().toISOString() })
    .eq('id', jobId);
}

/**
 * Start the cron scheduler. Runs at 00:05 UTC every day.
 */
export function startScheduler() {
  cron.schedule('5 0 * * *', () => {
    console.log('[midnight-job] Starting...');
    runMidnightJob().catch(err => console.error('[midnight-job] Unhandled error:', err));
  }, {
    timezone: 'UTC',
  });

  console.log('[scheduler] Midnight job scheduled for 00:05 UTC daily.');
}
