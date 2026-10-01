/**
 * Relance digest recipients + one-click unsubscribe tokens.
 * No SMTP.
 *
 * Until 2026-12-01 00:00 Europe/Paris, every stored Google email is a
 * recipient. `mail_consent.opted_in` is not a gate. `unsubscribed_at` excludes.
 * From that instant, the same list requires `opted_in = true`.
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { parseTasteState, type TasteEntry } from '@/lib/signals';

export const DIGEST_UNSUB_PURPOSE = 'digest-unsub';

/** Moods / genres / themes only — same shape as the digest POST `profile`. */
export type DigestRecoProfile = {
  moods: Record<string, TasteEntry>;
  genres: Record<string, TasteEntry>;
  themes: Record<string, TasteEntry>;
};

export function emptyDigestRecoProfile(): DigestRecoProfile {
  return { moods: {}, genres: {}, themes: {} };
}

/**
 * « Pas pour moi » keys the agenda POST already accepts (`f:` / `e:` / `p:`).
 * Same membership as `notInterestedBlockKeys`.
 */
function notInterestedExcludeIds(
  signals: readonly {
    kind: string;
    film_id?: string;
    event_id?: string;
    programme_id?: string;
  }[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const signal of signals) {
    if (signal.kind !== 'not_interested') continue;
    const film = (signal.film_id || '').trim();
    if (film) push(`f:${film}`);
    const ev = (signal.event_id || '').trim();
    if (ev) push(`e:${ev}`);
    const prog = (signal.programme_id || '').trim();
    if (prog) push(`p:${prog}`);
  }
  return out;
}

/**
 * Account taste row → body Relance can POST as `digest=relance`.
 * Missing or unreadable state → empty profile, no excluded works.
 * No email, no raw signals, no `tastesText`.
 */
export function digestRecoFieldsFromTaste(raw: unknown): {
  profile: DigestRecoProfile;
  excludeWorkIds: string[];
} {
  const state = parseTasteState(raw);
  if (!state) {
    return { profile: emptyDigestRecoProfile(), excludeWorkIds: [] };
  }
  return {
    profile: {
      moods: state.profile.moods,
      genres: state.profile.genres,
      themes: state.profile.themes,
    },
    excludeWorkIds: notInterestedExcludeIds(state.signalsRecent),
  };
}

/** Secrets Relance may present as `Authorization: Bearer`. Order is preference for signing. */
export function mailDigestSecrets(): string[] {
  const env = process.env;
  const out: string[] = [];
  for (const key of ['RELANCE_DIGEST_SECRET', 'CRON_SECRET'] as const) {
    const value = (env[key] || '').trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

export function bearerAuthorizesDigest(
  header: string | null | undefined,
  secrets: readonly string[],
): boolean {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header || '');
  if (!match) return false;
  const token = match[1] || '';
  const live = secrets.map((s) => s.trim()).filter(Boolean);
  if (!token || live.length === 0) return false;
  const got = createHash('sha256').update(token).digest();
  return live.some((secret) =>
    timingSafeEqual(got, createHash('sha256').update(secret).digest()),
  );
}

/** Google session email stored as `mail_consent.user_key`. */
export function isGoogleMailKey(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320) return false;
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (/\s/.test(email)) return false;
  return true;
}

/** 1 Dec 2026 00:00 Europe/Paris. Opt-in gate starts at this instant. */
export const DIGEST_OPT_IN_GATE_AT = Date.parse('2026-12-01T00:00:00+01:00');

export function digestOptInGateActive(now = new Date()): boolean {
  return now.getTime() >= DIGEST_OPT_IN_GATE_AT;
}

/**
 * Google email, not unsubscribed.
 * Before the gate, a missing or false opt-in still receives the digest.
 */
export function isDigestRecipient(
  row: {
    email: string;
    opted: boolean;
    unsubscribedAt?: string | null;
  },
  now = new Date(),
): boolean {
  if (!isGoogleMailKey(row.email)) return false;
  if (row.unsubscribedAt) return false;
  if (digestOptInGateActive(now) && row.opted !== true) return false;
  return true;
}

/** Canonical UTF-8 payload. Key order is part of the signature. */
export function mailUnsubPayloadJson(email: string): string {
  return JSON.stringify({
    v: 1,
    e: email.trim().toLowerCase(),
    p: DIGEST_UNSUB_PURPOSE,
  });
}

export function signMailUnsubToken(email: string, secret: string): string | null {
  const key = email.trim().toLowerCase();
  const signingSecret = secret.trim();
  if (!isGoogleMailKey(key) || !signingSecret) return null;
  const payload = Buffer.from(mailUnsubPayloadJson(key), 'utf8').toString('base64url');
  const sig = createHmac('sha256', signingSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyMailUnsubToken(
  token: string,
  secret: string,
): string | null {
  const signingSecret = secret.trim();
  if (!signingSecret) return null;
  const raw = token.trim();
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot !== raw.lastIndexOf('.')) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', signingSecret).update(payload).digest('base64url');
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const body = parsed as { v?: unknown; e?: unknown; p?: unknown };
  if (body.v !== 1 || body.p !== DIGEST_UNSUB_PURPOSE) return null;
  if (typeof body.e !== 'string' || !isGoogleMailKey(body.e)) return null;
  const email = body.e.trim().toLowerCase();
  if (mailUnsubPayloadJson(email) !== JSON.stringify(body)) return null;
  return email;
}

export function mailUnsubPath(token: string): string {
  return `/mail/unsub?t=${token}`;
}
