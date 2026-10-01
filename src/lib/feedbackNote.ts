/**
 * Avis / idées — pure rules.
 * Identity is an account fingerprint OR `cc_vid`, never both, never an e-mail,
 * never NextAuth `user.id` / `token.sub`.
 * IP is a memory rate-limit key only. It is not a column.
 */
import { createHash } from 'crypto';
import { isValidVid } from '@/lib/guestId';
import { assertNoVidAccountJoin } from '@/lib/guestSignals';

export const FEEDBACK_BODY_MAX = 400;
export const FEEDBACK_REPLY_MAX = 180;
export const FEEDBACK_BODY_MIN = 2;
export const FEEDBACK_RATE_PER_HOUR = 10;
export const FEEDBACK_IP_RATE_PER_HOUR = 20;
export const FEEDBACK_RATE_WINDOW_MS = 60 * 60 * 1000;
export const FEEDBACK_RETENTION_DAYS = 90;
export const FEEDBACK_ADMIN_CAP = 80;
export const FEEDBACK_ACK = 'Bien reçu. On lit ça.';

export const FEEDBACK_KINDS = ['avis', 'idee', 'bug', 'autre'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

const FEEDBACK_KIND_SET = new Set<string>(FEEDBACK_KINDS);

export type FeedbackActor = {
  userKey: string | null;
  ccVid: string | null;
};

/**
 * French-centric on purpose, not a full PII filter.
 * E-mails in Latin script, and French phone shapes (+33 / 0X XX XX XX XX).
 * Another country's number can remain in the stored text.
 */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
const LONG_DIGITS_RE = /\d{8,}/g;
const TRAINING_RE = /entraîn|training|fine-?tun/i;
const LINK_RE = /https?:|www\.|@/i;

const hits = new Map<string, number[]>();

/** Same 16-hex fingerprint as admin `hashEmailKey`. Not the address. */
export function feedbackUserKey(email?: string | null): string | null {
  const raw = (email || '').trim().toLowerCase();
  if (!raw || raw.length > 200 || !raw.includes('@') || /\s/.test(raw)) return null;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function feedbackActor(opts: {
  email?: string | null;
  cookieVid?: string | null;
}): FeedbackActor {
  const userKey = feedbackUserKey(opts.email);
  if (userKey) return { userKey, ccVid: null };
  const vid = isValidVid(opts.cookieVid) ? opts.cookieVid : null;
  return { userKey: null, ccVid: vid };
}

export function assertFeedbackActorExclusive(actor: FeedbackActor): void {
  assertNoVidAccountJoin({
    vid: actor.ccVid,
    user_key: actor.userKey,
  });
}

export function redactFeedbackPii(raw: string): string {
  return raw
    .replace(EMAIL_RE, '[courriel]')
    .replace(PHONE_RE, '[téléphone]')
    .replace(LONG_DIGITS_RE, '[nombre]');
}

export function sanitizeFeedbackBody(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = redactFeedbackPii(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FEEDBACK_BODY_MAX);
  if (cleaned.length < FEEDBACK_BODY_MIN) return null;
  return cleaned;
}

export function sanitizeFeedbackReply(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, FEEDBACK_REPLY_MAX);
  if (cleaned.length < FEEDBACK_BODY_MIN) return null;
  if (LINK_RE.test(cleaned) || TRAINING_RE.test(cleaned)) return null;
  return cleaned;
}

export function feedbackKind(raw: unknown): FeedbackKind | null {
  if (typeof raw !== 'string') return null;
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/é/g, 'e');
  return FEEDBACK_KIND_SET.has(v) ? (v as FeedbackKind) : null;
}

export function parseFeedbackAiContent(
  content: string,
): { kind: FeedbackKind; reply: string | null } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const kind = feedbackKind(o.kind);
  if (!kind) return null;
  return { kind, reply: sanitizeFeedbackReply(o.reply) };
}

export function feedbackActorBucket(actor: FeedbackActor, ip: string): string {
  if (actor.userKey) return `user:${actor.userKey}`;
  if (actor.ccVid) return `vid:${actor.ccVid}`;
  return `anon:${ip.slice(0, 64) || 'unknown'}`;
}

export function feedbackIpBucket(ip: string): string {
  return `net:${ip.slice(0, 64) || 'unknown'}`;
}

/** In-process window. Returns true when this hit must be refused. */
export function feedbackRateLimited(
  key: string,
  limit: number,
  now: number,
  windowMs = FEEDBACK_RATE_WINDOW_MS,
): boolean {
  const times = (hits.get(key) || []).filter((t) => now - t < windowMs && now - t >= 0);
  if (times.length >= limit) {
    hits.set(key, times);
    return true;
  }
  times.push(now);
  hits.set(key, times);
  return false;
}

export function resetFeedbackRateForTests(): void {
  hits.clear();
}

export function feedbackRetentionCutoff(now = Date.now()): string {
  return new Date(now - FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export type StoredFeedback = {
  id: string;
  kind: FeedbackKind;
  body: string;
  userKey: string | null;
  ccVid: string | null;
  reply: string | null;
  createdAt: string;
};

export type AdminFeedbackNote = {
  id: string;
  kind: FeedbackKind;
  body: string;
  reply: string | null;
  createdAt: string;
  actor: 'compte' | 'visiteur' | 'anonyme';
  ref: string | null;
};

export function toAdminFeedbackNote(row: StoredFeedback): AdminFeedbackNote {
  assertFeedbackActorExclusive({ userKey: row.userKey, ccVid: row.ccVid });
  if (row.userKey && row.userKey.includes('@')) {
    throw new Error('RGPD: feedback must not store an e-mail');
  }
  const base = {
    id: row.id,
    kind: row.kind,
    body: row.body,
    reply: row.reply,
    createdAt: row.createdAt,
  };
  if (row.userKey) return { ...base, actor: 'compte', ref: row.userKey };
  if (row.ccVid) return { ...base, actor: 'visiteur', ref: row.ccVid };
  return { ...base, actor: 'anonyme', ref: null };
}
