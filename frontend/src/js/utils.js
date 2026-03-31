export function randomUUID() {
  return crypto.randomUUID();
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Parse a JWT payload without verification (client-side only)
export function parseJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

// Check if a JWT access token is expired (or within 60s of expiry)
export function isTokenExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 < Date.now() + 60_000;
}

export function formatInterval(seconds) {
  if (seconds < 60) return `:${String(seconds).padStart(2, '0')}`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, '0')}`;
}
