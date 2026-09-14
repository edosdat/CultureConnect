/**
 * B2b visitor identity. Dedicated cookie `cc_vid` only.
 * NEVER persist this id inside `cc_signals_v1` — that JSON is compacted
 * (~3500 chars) and drops oldest events, so an embedded id would vanish.
 */

export const VID_COOKIE = 'cc_vid';
export const COHORT_COOKIE = 'cc_cohort';
export const VID_PREFIX = 'v_';
export const VID_TTL_SEC = 14 * 24 * 60 * 60;
export const VID_RE = /^v_[a-zA-Z0-9]{8,12}$/;

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

/** `v_` + 8–12 alphanumeric, e.g. `v_8f3e2a1b`. */
export function generateVid(): string {
  return `${VID_PREFIX}${randomAlphanumeric(8)}`;
}

export function isValidVid(value: unknown): value is string {
  return typeof value === 'string' && VID_RE.test(value);
}

export function vidCookieOptions(): {
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
    maxAge: VID_TTL_SEC,
    path: '/',
  };
}
