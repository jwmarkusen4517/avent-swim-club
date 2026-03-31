// USMS number validation.
//
// MVP: format-only validation. USMS does not provide a public API.
// The number is canonicalized and stored with usms_verified = false.
// Admin can bulk-verify later or upgrade to scrape-based verification.
//
// USMS number format: 4 digits, optional hyphen, 4 digits.
// Some clubs prefix with a letter code. We accept both.
// Examples: 1234-5678, 12345678, A1234-5678

const USMS_REGEX = /^[A-Z]?\d{4}-?\d{4}$/i;

/**
 * Validate and canonicalize a USMS membership number.
 * @param {string} raw
 * @returns {{ valid: boolean, canonical?: string, error?: string }}
 */
export function validateUSMS(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'USMS number is required.' };
  }

  const trimmed = raw.trim().toUpperCase().replace(/\s/g, '');

  if (!USMS_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'That doesn\'t look like a valid USMS number. It should be 8 digits, like 1234-5678.',
    };
  }

  // Normalize: insert hyphen if missing
  const canonical = trimmed.includes('-')
    ? trimmed
    : trimmed.length === 8
      ? `${trimmed.slice(0, 4)}-${trimmed.slice(4)}`
      : trimmed; // club-prefixed: leave as-is

  return { valid: true, canonical };
}
