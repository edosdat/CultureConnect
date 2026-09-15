/**
 * B3b activity inbox — Mes partages deltas + mother sand copy.
 * Payload-only helpers. 0 Matching A, 0 « intéressés », 0 fake RSVPs.
 */
import { deepLinkUrl } from '@/lib/displayHome';
import {
  circleEnvieLine,
  circleGoingLine,
  motherStatsFromRsvps,
  type RsvpKind,
  type ShareRsvpRecord,
} from '@/lib/shareRsvp';
export type ActivityTokenRef = {
  token: string;
  itemKey: string;
  seanceKey?: string;
  createdAt: string;
};

export const ACTIVITY_NOTICE = 'Depuis ton lien.';
export const ACTIVITY_EMPTY = 'Tu n’as pas encore partagé.';
export const ACTIVITY_SHEET_TITLE = 'Mes partages';
export const ACTIVITY_SHEET_SUB = 'Réactions sur tes liens';
export const ACTIVITY_LAST_SEEN_KEY = 'cc_share_activity_last_seen';
export const SHARE_SHARER_INDEX_CAP = 200;

export type ActivityEvent = {
  firstName: string;
  kind: RsvpKind;
  ts: string;
  token: string;
};

export type ActivityListItem = {
  itemKey: string;
  token: string;
  seanceKey: string | null;
  createdAt: string;
  envie: number;
  going: number;
  events: ActivityEvent[];
};

export type ActivityListPayload = {
  items: ActivityListItem[];
  lastSeen?: string;
};

export type ActivityItemPayload = {
  itemKey: string;
  goingNames?: string[];
  envieNames?: string[];
};

function isNamed(name: string): boolean {
  const n = (name || '').trim();
  if (!n) return false;
  return !/^quelqu[’']un$/i.test(n);
}

function uniqueNames(events: readonly ActivityEvent[], kind: RsvpKind): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ev of events) {
    if (ev.kind !== kind) continue;
    const name = ev.firstName.trim();
    const key = isNamed(name)
      ? name.toLowerCase()
      : `anon:${ev.token}:${ev.ts}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function deltaKindLine(names: readonly string[], kind: RsvpKind): string {
  const named = names.filter(isNamed);
  const anon = names.length - named.length;
  if (named.length === 0 && anon === 0) return '';
  if (named.length === 0) {
    if (kind === 'going') {
      return anon === 1 ? '+1 y va' : 'Une personne de plus y va';
    }
    return anon === 1 ? '+1 envie' : `+${anon} envie`;
  }
  if (anon === 0 && named.length <= 2) {
    return kind === 'going' ? circleGoingLine(named) : circleEnvieLine(named);
  }
  if (anon === 0 && named.length > 2) {
    return kind === 'going'
      ? `${named[0]} y va · +${named.length - 1} y va`
      : `${named[0]} a envie · +${named.length - 1} envie`;
  }
  const extra = named.length - 1 + anon;
  if (kind === 'going') {
    return extra === 1
      ? `${named[0]} y va · +1 y va`
      : `${named[0]} y va · Une personne de plus y va`;
  }
  return extra === 1
    ? `${named[0]} a envie · +1 envie`
    : `${named[0]} a envie · +${extra} envie`;
}

/** Inbox / delta line. Going before envie. Never « intéressés ». */
export function activityDeltaCopy(events: readonly ActivityEvent[]): string {
  const going = uniqueNames(events, 'going');
  const envie = uniqueNames(events, 'envie');
  return [deltaKindLine(going, 'going'), deltaKindLine(envie, 'envie')]
    .filter(Boolean)
    .join(' · ');
}

export function activitySandLines(payload: ActivityItemPayload): {
  going: string;
  envie: string;
} {
  return {
    going: circleGoingLine(payload.goingNames ?? []),
    envie: circleEnvieLine(payload.envieNames ?? []),
  };
}

export function hasSharerSand(payload: ActivityItemPayload | null | undefined): boolean {
  if (!payload) return false;
  return (payload.goingNames?.length ?? 0) + (payload.envieNames?.length ?? 0) > 0;
}

export function unreadBadgeLabel(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 9 ? '9+' : String(Math.floor(n));
}

export function eventIsUnread(ts: string, lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return true;
  const ev = Date.parse(ts);
  const seen = Date.parse(lastSeen);
  if (!Number.isFinite(ev) || !Number.isFinite(seen)) return false;
  return ev > seen;
}

export function countUnreadEvents(
  items: readonly ActivityListItem[],
  lastSeen: string | null | undefined,
): number {
  let n = 0;
  for (const item of items) {
    for (const ev of item.events) {
      if (ev.kind !== 'envie' && ev.kind !== 'going') continue;
      if (eventIsUnread(ev.ts, lastSeen)) n += 1;
    }
  }
  return n;
}

export function itemIsUnread(
  item: ActivityListItem,
  lastSeen: string | null | undefined,
): boolean {
  return item.events.some(
    (ev) =>
      (ev.kind === 'envie' || ev.kind === 'going') &&
      eventIsUnread(ev.ts, lastSeen),
  );
}

export function activityFicheHref(itemKey: string, token: string): string {
  return deepLinkUrl('', itemKey, token).replace(/^\/?/, '/');
}

export function formatActivityRelative(ts: string, now = Date.now()): string {
  const then = Date.parse(ts);
  if (!Number.isFinite(then)) return '';
  const delta = Math.max(0, now - then);
  const min = Math.floor(delta / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const dayMs = 86400000;
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  if (then >= startToday.getTime() - dayMs) return 'hier';
  const d = new Date(then);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function formatActivityDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return '';
  return `${m[3]}/${m[2]}`;
}

export function readClientLastSeen(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(ACTIVITY_LAST_SEEN_KEY);
    return v && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}

export function writeClientLastSeen(iso: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVITY_LAST_SEEN_KEY, iso);
  } catch {
    /* ignore */
  }
}

export function resolveLastSeen(server?: string | null): string | null {
  const local = readClientLastSeen();
  if (server && local) return Date.parse(server) >= Date.parse(local) ? server : local;
  return server || local;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
}

export function parseActivityEvent(raw: unknown): ActivityEvent | null {
  const o = asRecord(raw);
  if (!o) return null;
  if (o.kind !== 'envie' && o.kind !== 'going') return null;
  if (typeof o.firstName !== 'string' || !o.firstName.trim()) return null;
  if (typeof o.token !== 'string' || !o.token.trim()) return null;
  if (typeof o.email === 'string' || typeof o.emailHash === 'string') return null;
  if (typeof o.vid === 'string' || typeof o.cc_vid === 'string') return null;
  return {
    firstName: o.firstName.trim(),
    kind: o.kind,
    ts: typeof o.ts === 'string' ? o.ts : new Date().toISOString(),
    token: o.token.trim(),
  };
}

export function parseActivityListItem(raw: unknown): ActivityListItem | null {
  const o = asRecord(raw);
  if (!o || typeof o.itemKey !== 'string' || !o.itemKey.trim()) return null;
  if (typeof o.token !== 'string' || !o.token.trim()) return null;
  const events = Array.isArray(o.events)
    ? o.events.map(parseActivityEvent).filter((e): e is ActivityEvent => Boolean(e))
    : [];
  return {
    itemKey: o.itemKey,
    token: o.token,
    seanceKey: typeof o.seanceKey === 'string' ? o.seanceKey : null,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
    envie: typeof o.envie === 'number' && Number.isFinite(o.envie) ? o.envie : 0,
    going: typeof o.going === 'number' && Number.isFinite(o.going) ? o.going : 0,
    events,
  };
}

export function parseActivityListPayload(raw: unknown): ActivityListPayload {
  const o = asRecord(raw);
  const items = Array.isArray(o?.items)
    ? o.items.map(parseActivityListItem).filter((i): i is ActivityListItem => Boolean(i))
    : [];
  const lastSeen =
    typeof o?.lastSeen === 'string' && !Number.isNaN(Date.parse(o.lastSeen))
      ? o.lastSeen
      : undefined;
  return lastSeen ? { items, lastSeen } : { items };
}

export function parseActivityItemPayload(raw: unknown): ActivityItemPayload | null {
  const o = asRecord(raw);
  if (!o || typeof o.itemKey !== 'string' || !o.itemKey.trim()) return null;
  if (typeof o.email === 'string' || typeof o.emailHash === 'string') return null;
  const goingNames = Array.isArray(o.goingNames)
    ? o.goingNames.filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
    : undefined;
  const envieNames = Array.isArray(o.envieNames)
    ? o.envieNames.filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
    : undefined;
  const payload: ActivityItemPayload = { itemKey: o.itemKey };
  if (goingNames && goingNames.length) payload.goingNames = goingNames;
  if (envieNames && envieNames.length) payload.envieNames = envieNames;
  return payload;
}

function rsvpToEvent(r: ShareRsvpRecord): ActivityEvent {
  return {
    firstName: r.firstName,
    kind: r.kind,
    ts: r.ts,
    token: r.token,
  };
}

/** Dedup (emailHash, kind) keeping the latest ts. Chronological desc. */
export function activityEventsFromRsvps(
  rsvps: readonly ShareRsvpRecord[],
): ActivityEvent[] {
  const best = new Map<string, ShareRsvpRecord>();
  for (const r of rsvps) {
    if (r.kind !== 'envie' && r.kind !== 'going') continue;
    const key = `${r.emailHash}:${r.kind}`;
    const prev = best.get(key);
    if (!prev || Date.parse(r.ts) > Date.parse(prev.ts)) best.set(key, r);
  }
  return [...best.values()]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .map(rsvpToEvent);
}

function namesByKind(rsvps: readonly ShareRsvpRecord[]): {
  goingNames: string[];
  envieNames: string[];
} {
  const byEmail = new Map<string, ShareRsvpRecord>();
  for (const r of rsvps) {
    const prev = byEmail.get(r.emailHash);
    if (!prev || r.kind === 'going' || Date.parse(r.ts) > Date.parse(prev.ts)) {
      if (prev?.kind === 'going' && r.kind !== 'going') continue;
      byEmail.set(r.emailHash, r);
    }
  }
  const goingNames: string[] = [];
  const envieNames: string[] = [];
  for (const r of byEmail.values()) {
    const name = r.firstName.trim();
    if (!name) continue;
    if (r.kind === 'going') goingNames.push(name);
    else envieNames.push(name);
  }
  goingNames.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  envieNames.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  return { goingNames, envieNames };
}

export function buildActivityItemPayload(
  itemKey: string,
  rsvps: readonly ShareRsvpRecord[],
): ActivityItemPayload {
  const { goingNames, envieNames } = namesByKind(rsvps);
  const payload: ActivityItemPayload = { itemKey };
  if (goingNames.length) payload.goingNames = goingNames;
  if (envieNames.length) payload.envieNames = envieNames;
  return payload;
}

export function buildActivityListItems(opts: {
  tokens: readonly ActivityTokenRef[];
  rsvpsByToken: ReadonlyMap<string, readonly ShareRsvpRecord[]>;
  groupKeyOf?: (itemKey: string) => string;
  limit?: number;
}): ActivityListItem[] {
  const groups = new Map<
    string,
    { tokens: ActivityTokenRef[]; rsvps: ShareRsvpRecord[] }
  >();
  for (const token of opts.tokens) {
    const groupKey = (opts.groupKeyOf?.(token.itemKey) || token.itemKey).trim();
    if (!groupKey) continue;
    const bucket = groups.get(groupKey) ?? { tokens: [], rsvps: [] };
    bucket.tokens.push(token);
    bucket.rsvps.push(...(opts.rsvpsByToken.get(token.token) ?? []));
    groups.set(groupKey, bucket);
  }

  const items: ActivityListItem[] = [];
  for (const [groupKey, bucket] of groups) {
    const events = activityEventsFromRsvps(bucket.rsvps);
    const counts = motherStatsFromRsvps(bucket.rsvps);
    const latestEvent = events[0];
    const latestToken =
      bucket.tokens.find((t) => t.token === latestEvent?.token) ??
      [...bucket.tokens].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      )[0];
    if (!latestToken) continue;
    items.push({
      itemKey: latestToken.itemKey || groupKey,
      token: latestToken.token,
      seanceKey: latestToken.seanceKey ?? null,
      createdAt: latestToken.createdAt,
      envie: counts.envie,
      going: counts.going,
      events,
    });
  }

  items.sort((a, b) => {
    const aTs = Date.parse(a.events[0]?.ts || a.createdAt || '') || 0;
    const bTs = Date.parse(b.events[0]?.ts || b.createdAt || '') || 0;
    if (bTs !== aTs) return bTs - aTs;
    return (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
  });

  return items.slice(0, opts.limit ?? 30);
}

export function omitEmptyNameFields(payload: ActivityItemPayload): ActivityItemPayload {
  const next: ActivityItemPayload = { itemKey: payload.itemKey };
  if (payload.goingNames?.length) next.goingNames = payload.goingNames;
  if (payload.envieNames?.length) next.envieNames = payload.envieNames;
  return next;
}

/** Test / lint helper — activity copy must never say this. */
export function activityCopyHasInteresses(text: string): boolean {
  return /intéress/i.test(text);
}
