import { fetchTodayWorkout } from './api.js';
import { formatInterval } from './utils.js';

/**
 * Render a workout data object as a DOM card.
 */
export function renderWorkoutCard(data) {
  const card = document.createElement('div');
  card.className = 'workout-card';

  const sets = (data.sets || [])
    .map(set => {
      const detail = `${set.sets} × ${set.distance}y`;
      const interval = set.interval ? `on ${formatInterval(set.interval)}` : '';
      const pace = set.pace ? `@ ${set.pace}` : '';
      const timing = [interval, pace].filter(Boolean).join(' ');

      return `
        <div class="workout-set">
          <span class="workout-set-badge">${formatSetType(set.type)}</span>
          <div class="workout-set-detail">
            <div>${detail} ${timing}</div>
            ${set.description ? `<div class="workout-set-interval">${set.description}</div>` : ''}
          </div>
        </div>
      `;
    })
    .join('');

  card.innerHTML = `
    <div class="workout-card-header">Today's Workout</div>
    ${data.news_hook ? `<div class="workout-card-news">${data.news_hook}</div>` : ''}
    ${data.purpose ? `<div class="workout-card-purpose">${data.purpose}</div>` : ''}
    ${sets}
    <div class="workout-total">Total: <strong>${(data.total_yardage || 0).toLocaleString()} yards</strong></div>
  `;

  return card;
}

function formatSetType(type) {
  const labels = {
    warmup: 'Warm-up',
    drill: 'Drill',
    threshold: 'Threshold',
    distance: 'Distance',
    race_pace: 'Race Pace',
    cool_down: 'Cool-down',
    fun: 'Fun',
  };
  return labels[type] || type;
}

/**
 * Fetch today's workout and return the rendered card element.
 * Returns null if fetch fails.
 */
export async function loadTodayWorkout() {
  try {
    const data = await fetchTodayWorkout();
    return renderWorkoutCard(data.workout?.content || data.workout);
  } catch (err) {
    console.error('[workout] Failed to load workout:', err.message);
    return null;
  }
}
