/**
 * B2a/B2b helpers (pure). Visitor key is cookie `cc_vid`, never `cc_signals_v1`.
 */
import { createHash } from 'crypto';
import { signalTarget, type Signal, type SignalKind } from '@/lib/signals';
import { isValidVid } from '@/lib/guestId';

export {
  COHORT_COOKIE,
  VID_COOKIE,
  VID_TTL_SEC,
  generateVid,
  isValidVid,
  vidCookieOptions,
} from '@/lib/guestId';
export const GUEST_SIGNAL_FIFO_CAP = 200;
export const GUEST_RATE_LIMIT_PER_HOUR = 60;
export const IP_RATE_LIMIT_PER_HOUR = 120;
export const SIGNAL_PAYLOAD_MAX_BYTES = 8 * 1024;
export const ITEM_ID_MAX_LEN = 128;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

export type GuestAppendLine = {
  ts: string;
  vid: string;
  kind: SignalKind;
  itemKey: string;
  cohort: string;
  authed: false;
};

export type AuthedAppendLine = {
  ts: string;
  emailHash: string;
  kind: SignalKind;
  itemKey: string;
  cohort: string;
  authed: true;
};

export function readCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function sanitizeCohort(raw?: string | null): string | null {
  const v = (raw || '').trim();
  if (!v || v.length > 32) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(v)) return null;
  return v;
}

/**
 * Env `CC_BETA_COHORT` (beta hardcode) wins, then cookie `cc_cohort`, else `public`.
 */
export function resolveCohort(
  cookieValue?: string | null,
  envValue: string | undefined = process.env['CC_BETA_COHORT'],
): string {
  const fromEnv = sanitizeCohort(envValue);
  if (fromEnv) return fromEnv;
  const fromCookie = sanitizeCohort(cookieValue);
  if (fromCookie) return fromCookie;
  return 'public';
}

export function itemKeyFromSignal(
  s: Pick<Signal, 'film_id' | 'event_id' | 'programme_id' | 'chip' | 'query'>,
): string {
  return signalTarget(s);
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export function itemIdsOutOfBounds(s: Signal): boolean {
  for (const key of ['event_id', 'programme_id', 'film_id', 'lieu_id'] as const) {
    const v = s[key];
    if (typeof v === 'string' && v.length > ITEM_ID_MAX_LEN) return true;
  }
  return false;
}

export function payloadExceedsLimit(rawText: string): boolean {
  return new TextEncoder().encode(rawText).length > SIGNAL_PAYLOAD_MAX_BYTES;
}

export function isAllowedSignalOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (
    originHost === 'localhost' ||
    originHost.startsWith('localhost:') ||
    originHost === '127.0.0.1' ||
    originHost.startsWith('127.0.0.1:')
  ) {
    return true;
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(req.url).host);
  } catch {
    /* ignore */
  }
  for (const envKey of ['AUTH_URL', 'NEXTAUTH_URL', 'VERCEL_URL'] as const) {
    const raw = (process.env[envKey] || '').trim();
    if (!raw) continue;
    try {
      allowed.add(new URL(raw.includes('://') ? raw : `https://${raw}`).host);
    } catch {
      /* ignore */
    }
  }
  return allowed.has(originHost);
}

export function clientIpFromRequest(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function resolveVidFromCookie(raw?: string | null): string | null {
  return isValidVid(raw) ? raw : null;
}

export function fifoAppend<T>(list: readonly T[], item: T, cap: number): T[] {
  const next = [...list, item];
  if (next.length <= cap) return next;
  return next.slice(next.length - cap);
}

/** RGPD hard lock: never persist email / Neon key alongside `cc_vid`. */
const ACCOUNT_JOIN_KEYS = ['email', 'emailHash', 'user_key', 'userKey'] as const;

export function recordHasVid(record: object): boolean {
  const rec = record as Record<string, unknown>;
  return (
    (typeof rec.vid === 'string' && rec.vid.length > 0) ||
    (typeof rec.guestId === 'string' && rec.guestId.length > 0)
  );
}

export function assertNoVidAccountJoin(record: object): void {
  if (!recordHasVid(record)) return;
  const rec = record as Record<string, unknown>;
  for (const key of ACCOUNT_JOIN_KEYS) {
    if (rec[key] != null && rec[key] !== '') {
      throw new Error('RGPD: cc_vid must not be joined with account identity');
    }
  }
}

export function buildGuestAppendLine(opts: {
  signal: Signal;
  vid: string;
  cohort: string;
  now?: Date;
}): GuestAppendLine {
  const line: GuestAppendLine = {
    ts: opts.signal.ts || (opts.now ?? new Date()).toISOString(),
    vid: opts.vid,
    kind: opts.signal.kind,
    itemKey: itemKeyFromSignal(opts.signal),
    cohort: opts.cohort,
    authed: false,
  };
  assertNoVidAccountJoin(line);
  return line;
}

export function buildAuthedAppendLine(opts: {
  signal: Signal;
  email: string;
  cohort: string;
  now?: Date;
}): AuthedAppendLine {
  const line: AuthedAppendLine = {
    ts: opts.signal.ts || (opts.now ?? new Date()).toISOString(),
    emailHash: hashEmail(opts.email),
    kind: opts.signal.kind,
    itemKey: itemKeyFromSignal(opts.signal),
    cohort: opts.cohort,
    authed: true,
  };
  assertNoVidAccountJoin(line);
  return line;
}

export function formatAppendLogLine(
  line: GuestAppendLine | AuthedAppendLine,
): string {
  return JSON.stringify(line);
}
