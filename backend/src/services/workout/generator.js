import { supabase } from '../../config/supabase.js';
import { generateWorkout } from '../ai/workoutGen.js';
import { MODEL } from '../../config/anthropic.js';
import { env } from '../../config/env.js';

/**
 * Get today's workout date string in the club timezone.
 */
function getTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: env.clubTimezone });
}

/**
 * Get today's cached workout, or generate and cache it if it doesn't exist.
 * Safe for concurrent requests — uses DB unique constraint as the lock.
 */
export async function getTodayWorkout() {
  const workoutDate = getTodayDate();

  // Check cache first
  const { data: cached } = await supabase
    .from('daily_workouts')
    .select('*')
    .eq('workout_date', workoutDate)
    .single();

  if (cached) return cached;

  // Generate new workout
  const { content, news_hook, generation_ms } = await generateWorkout();

  // Upsert — safe if another request beat us to it
  const { data, error } = await supabase
    .from('daily_workouts')
    .upsert(
      {
        workout_date: workoutDate,
        content,
        news_hook,
        model_version: MODEL,
        generation_ms,
      },
      { onConflict: 'workout_date', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}
