const KEYS = {
  GUEST_ID: 'avent_guest_id',
  ACCESS_TOKEN: 'avent_access_token',
  SESSION_TYPE: 'avent_session_type',
  MEMBER_ID: 'avent_member_id',
};

export const storage = {
  getGuestId: () => localStorage.getItem(KEYS.GUEST_ID),
  setGuestId: (id) => localStorage.setItem(KEYS.GUEST_ID, id),

  getAccessToken: () => localStorage.getItem(KEYS.ACCESS_TOKEN),
  setAccessToken: (token) => localStorage.setItem(KEYS.ACCESS_TOKEN, token),

  getSessionType: () => localStorage.getItem(KEYS.SESSION_TYPE),
  setSessionType: (type) => localStorage.setItem(KEYS.SESSION_TYPE, type),

  getMemberId: () => localStorage.getItem(KEYS.MEMBER_ID),
  setMemberId: (id) => localStorage.setItem(KEYS.MEMBER_ID, id),

  clearAll: () => Object.values(KEYS).forEach(k => localStorage.removeItem(k)),
};
