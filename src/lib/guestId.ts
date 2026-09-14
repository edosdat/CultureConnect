/** Anonymous guest key for B2 signal append. No PII. */

export const GUEST_ID_COOKIE = 'cc_guest_id';
export const COHORT_COOKIE = 'cc_cohort';
export const GUEST_ID_PREFIX = 'g_';
export const GUEST_ID_TTL_SEC = 14 * 24 * 60 * 60;
export const GUEST_ID_RE = /^g_[a-zA-Z0-9]{8,12}$/;

function randomAlphanumeric(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** `g_` + 8–12 alphanumeric, e.g. `g_8f3e2a1b`. */
export function generateGuestId(): string {
  return `${GUEST_ID_PREFIX}${randomAlphanumeric(8)}`;
}

export function isValidGuestId(value: unknown): value is string {
  return typeof value === 'string' && GUEST_ID_RE.test(value);
}

export function guestIdCookieOptions(): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
  path: '/';
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production',
    maxAge: GUEST_ID_TTL_SEC,
    path: '/',
  };
}
