/**
 * B3b RSVP — Envie / J’y vais + cercle Option A (this token only).
 * Pure helpers: no Matching A ingest, no cc_vid on RSVP records.
 */
import { recordHasVid } from '@/lib/guestSignals';

export const RSVP_KINDS = ['envie', 'going'] as const;
export type RsvpKind = (typeof RSVP_KINDS)[number];

export const RSVP_LOGIN_ERROR = 'Connecte-toi pour dire Envie ou J’y vais.';
export const DAUGHTER_NOTICE = 'Visibles par ceux qui ont ce lien.';
export const RSVP_RATE_PER_HOUR = 60;

export type ShareRsvpRecord = {
  token: string;
  itemKey: string;
  workId: string;
  emailHash: string;
  firstName: string;
  kind: RsvpKind;
  ts: string;
};

export type TokenSocialAnonymous = {
  inCircle: false;
  envie: number;
  going: number;
};

export type TokenSocialCircle = {
  inCircle: true;
  envie: number;
  going: number;
  goingNames: string[];
  envieNames: string[];
  mine: RsvpKind;
};

export type TokenSocialPayload = TokenSocialAnonymous | TokenSocialCircle;

export type MotherStats = {
  envie: number;
  going: number;
};

export function isRsvpKind(value: unknown): value is RsvpKind {
  return value === 'envie' || value === 'going';
}

/** Google `user.name` → prénom only. Never email local-part. */
export function firstNameFromDisplayName(name?: string | null): string {
  const raw = (name || '').trim();
  if (!raw || raw.includes('@')) return 'Quelqu’un';
  const first = raw.split(/\s+/)[0] || '';
  const cleaned = first.replace(/[^\p{L}\p{N}'’-]/gu, '');
  return cleaned || 'Quelqu’un';
}

export function assertRsvpRgpd(record: object): void {
  if (recordHasVid(record)) {
    throw new Error('RGPD: RSVP must not store cc_vid');
  }
  const rec = record as Record<string, unknown>;
  if (rec.vid != null && rec.vid !== '') {
    throw new Error('RGPD: RSVP must not store cc_vid');
  }
  if (typeof rec.email === 'string' && rec.email.includes('@')) {
    throw new Error('RGPD: RSVP must not store raw email');
  }
}

/** Same kind again → off. Other kind → replace. No 3rd state. */
export function applyRsvpToggle(
  current: RsvpKind | null,
  next: RsvpKind,
): RsvpKind | null {
  if (current === next) return null;
  return next;
}

export function viewerInCircle(
  rsvps: readonly ShareRsvpRecord[],
  emailHash: string | null | undefined,
): boolean {
  if (!emailHash) return false;
  return rsvps.some((r) => r.emailHash === emailHash);
}

function sortNames(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

export function countKinds(rsvps: readonly ShareRsvpRecord[]): MotherStats {
  let envie = 0;
  let going = 0;
  for (const r of rsvps) {
    if (r.kind === 'going') going += 1;
    else envie += 1;
  }
  return { envie, going };
}

/**
 * Mother: unique account per work. `going` wins if the same email
 * RSVP’d both kinds on different tokens.
 */
export function motherStatsFromRsvps(
  rsvps: readonly ShareRsvpRecord[],
): MotherStats {
  const byEmail = new Map<string, RsvpKind>();
  for (const r of rsvps) {
    const prev = byEmail.get(r.emailHash);
    if (r.kind === 'going' || !prev) {
      byEmail.set(r.emailHash, r.kind);
    }
  }
  let envie = 0;
  let going = 0;
  for (const kind of byEmail.values()) {
    if (kind === 'going') going += 1;
    else envie += 1;
  }
  return { envie, going };
}

export function rsvpsForEventStats(
  rsvps: readonly ShareRsvpRecord[],
  opts: { itemKey: string; workId: string },
): ShareRsvpRecord[] {
  return rsvps.filter(
    (r) => r.workId === opts.workId || r.itemKey === opts.itemKey,
  );
}

export function buildTokenSocial(opts: {
  rsvps: readonly ShareRsvpRecord[];
  viewerEmailHash: string | null | undefined;
}): TokenSocialPayload {
  const counts = countKinds(opts.rsvps);
  if (!viewerInCircle(opts.rsvps, opts.viewerEmailHash)) {
    return { inCircle: false, envie: counts.envie, going: counts.going };
  }
  const mine = opts.rsvps.find((r) => r.emailHash === opts.viewerEmailHash);
  return {
    inCircle: true,
    envie: counts.envie,
    going: counts.going,
    goingNames: sortNames(
      opts.rsvps.filter((r) => r.kind === 'going').map((r) => r.firstName),
    ),
    envieNames: sortNames(
      opts.rsvps.filter((r) => r.kind === 'envie').map((r) => r.firstName),
    ),
    mine: mine?.kind ?? 'envie',
  };
}

export function envieLabel(n: number): string {
  return n === 1 ? '1 envie' : `${n} envies`;
}

export function goingLabel(n: number): string {
  return n === 1 ? '1 y va' : `${n} y vont`;
}

/** Mother copy: `N envies · M y vont` from the first envie / going. */
export function motherCountersLabel(envie: number, going: number): string {
  const parts: string[] = [];
  if (envie >= 1) parts.push(envieLabel(envie));
  if (going >= 1) parts.push(goingLabel(going));
  return parts.join(' · ');
}

/** Cercle copy: « y vont » first, then envie. All prénoms, no 3+K cap. */
export function circleNamesCopy(
  goingNames: readonly string[],
  envieNames: readonly string[],
): string {
  const parts: string[] = [];
  if (goingNames.length === 1) {
    parts.push(`${goingNames[0]} y va`);
  } else if (goingNames.length > 1) {
    parts.push(`${goingNames.join(', ')} y vont`);
  }
  if (envieNames.length === 1) {
    parts.push(`${envieNames[0]} a envie`);
  } else if (envieNames.length > 1) {
    parts.push(`${envieNames.join(', ')} ont envie`);
  }
  return parts.join(' · ');
}

export function parseRsvpRecord(raw: unknown): ShareRsvpRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<ShareRsvpRecord>;
  if (!isRsvpKind(o.kind)) return null;
  if (typeof o.token !== 'string' || typeof o.emailHash !== 'string') return null;
  if (typeof o.itemKey !== 'string' || typeof o.workId !== 'string') return null;
  if (typeof o.firstName !== 'string' || !o.firstName.trim()) return null;
  if (recordHasVid(o)) return null;
  if ('email' in o && typeof (o as { email?: unknown }).email === 'string') {
    return null;
  }
  return {
    token: o.token,
    itemKey: o.itemKey,
    workId: o.workId,
    emailHash: o.emailHash,
    firstName: o.firstName.trim(),
    kind: o.kind,
    ts: typeof o.ts === 'string' ? o.ts : new Date().toISOString(),
  };
}
