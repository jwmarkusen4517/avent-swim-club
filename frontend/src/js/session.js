import { storage } from './storage.js';
import { randomUUID } from './utils.js';
import { createGuestSession } from './api.js';

// Session states
export const STATE = {
  COLD: 'COLD',     // No storage at all
  GUEST: 'GUEST',   // Guest session active
  MEMBER: 'MEMBER', // Member logged in
};

/**
 * Determine current session state from localStorage.
 */
export function getSessionState() {
  const token = storage.getAccessToken();
  const type = storage.getSessionType();
  if (!token) return STATE.COLD;
  if (type === 'member') return STATE.MEMBER;
  if (type === 'guest') return STATE.GUEST;
  return STATE.COLD;
}

/**
 * Initialize a guest session if none exists.
 * Returns the session state after initialization.
 */
export async function initSession() {
  const state = getSessionState();
  if (state !== STATE.COLD) return state;

  // Create guest session
  let guestId = storage.getGuestId();
  if (!guestId) {
    guestId = randomUUID();
    storage.setGuestId(guestId);
  }

  try {
    const data = await createGuestSession(guestId);
    storage.setAccessToken(data.access_token);
    storage.setSessionType('guest');
    return STATE.GUEST;
  } catch (err) {
    console.error('[session] Failed to create guest session:', err.message);
    return STATE.COLD;
  }
}

/**
 * Update local state after USMS login.
 */
export function upgradeTOMember(accessToken, memberId) {
  storage.setAccessToken(accessToken);
  storage.setSessionType('member');
  if (memberId) storage.setMemberId(memberId);
}
