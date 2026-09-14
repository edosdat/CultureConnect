/**
 * B3 share tokens. Opaque 8-char `[a-z0-9]{8}` (crypto random).
 * `seanceKey` is the same DayItem.key the cine horaire picker uses (`p:…` / `e:…`).
 */
import { normalizeDeepLinkId } from '@/lib/deepLink';

export const SHARE_TOKEN_LEN = 8;
export const SHARE_TOKEN_RE = /^[a-z0-9]{8}$/;
export const SHARE_VISIT_STORAGE_PREFIX = 'cc_share_visit:';
export const SHARE_CREATE_RATE_PER_HOUR = 30;
export const SHARE_VISITS_CAP = 500;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateShareToken(): string {
  const bytes = new Uint8Array(SHARE_TOKEN_LEN);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < SHARE_TOKEN_LEN; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < SHARE_TOKEN_LEN; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && SHARE_TOKEN_RE.test(value);
}

export function normalizeShareToken(raw: string | null | undefined): string | null {
  const s = (raw || '').trim().toLowerCase();
  return isShareToken(s) ? s : null;
}

/** Same key space as B1 `?e=` / cine `DayItem.key` (`p:P1847`, `e:E496`). */
export function normalizeSeanceKey(raw: string | null | undefined): string | null {
  return normalizeDeepLinkId((raw || '').trim());
}

/**
 * `?e=` must open the same séance the picker stored.
 * Never pair a Wilson morning `itemKey` with a Blagnac `seanceKey`.
 */
export function shareCreateItemKey(
  itemKey?: string | null,
  seanceKey?: string | null,
): string | null {
  const seance = normalizeSeanceKey(seanceKey);
  if (seance) return seance;
  return normalizeDeepLinkId((itemKey || '').trim());
}

export function shareVisitStorageKey(token: string): string {
  return `${SHARE_VISIT_STORAGE_PREFIX}${token}`;
}

/** Authed create already emits Matching A `share` — do not trackItem again. */
export function shouldClientTrackShare(opts: {
  created: boolean;
  authed: boolean;
}): boolean {
  return !(opts.created && opts.authed);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Lowercase Google email only. Never NextAuth UUID / user.id. */
export function sessionSharerEmail(user?: {
  email?: string | null;
  id?: string | null;
} | null): string | null {
  const email = (user?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  if (UUID_RE.test(email)) return null;
  return email;
}

export function requestOrigin(req: Request): string {
  const env = process.env;
  for (const key of ['AUTH_URL', 'NEXTAUTH_URL'] as const) {
    const raw = (env[key] || '').trim();
    if (!raw) continue;
    try {
      return new URL(raw.includes('://') ? raw : `https://${raw}`).origin;
    } catch {
      /* ignore */
    }
  }
  const vercel = (env['VERCEL_URL'] || '').trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, '')}`;
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}
