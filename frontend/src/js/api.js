import { storage } from './storage.js';
import { isTokenExpired } from './utils.js';

const BASE_URL = window.AVENT_API_URL || 'http://localhost:3001/api/v1';

let refreshPromise = null;

async function refreshToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (res) => {
      if (!res.ok) throw new Error('Refresh failed');
      const data = await res.json();
      storage.setAccessToken(data.access_token);
      return data.access_token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function getValidToken() {
  let token = storage.getAccessToken();
  if (!token) return null;
  if (isTokenExpired(token)) {
    token = await refreshToken().catch(() => null);
  }
  return token;
}

export async function apiFetch(path, options = {}) {
  const token = await getValidToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
  }

  return res;
}

// ── Auth ────────────────────────────────────────────────
export async function createGuestSession(guestId) {
  const res = await apiFetch('/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ guest_id: guestId }),
  });
  return res.json();
}

export async function loginWithUSMS(usmsNumber) {
  const res = await apiFetch('/auth/usms', {
    method: 'POST',
    body: JSON.stringify({ usms_number: usmsNumber }),
  });
  return res.json();
}

export async function logout() {
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
  storage.clearAll();
}

// ── Chat ────────────────────────────────────────────────
// Returns the fetch Response (caller reads SSE stream)
export async function sendMessage(message) {
  const token = await getValidToken();
  return fetch(`${BASE_URL}/chat/message`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ message }),
  });
}

export async function fetchHistory(limit = 20, before = null) {
  const params = new URLSearchParams({ limit });
  if (before) params.set('before', before);
  const res = await apiFetch(`/chat/history?${params}`);
  return res.json();
}

// ── Workout ─────────────────────────────────────────────
export async function fetchTodayWorkout() {
  const res = await apiFetch('/workout/today');
  return res.json();
}
