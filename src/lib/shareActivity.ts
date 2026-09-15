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
import { isNotBeforeToday } from '@/lib/timeScope';
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
  token?: string;
};

export type ActivityLatest = {
  firstName: string;
  kind: RsvpKind;
  ts: string;
};

export type ActivityListItem = {
  token: string;
  itemKey: string;
  seanceKey: string | null;
  createdAt: string;
  envie: number;
  going: number;
  unread: boolean;
  deltaGoing: number;
  deltaEnvie: number;
  latest: ActivityLatest | null;
  events: ActivityEvent[];
};

export type ActivityListPayload = {
  lastSeenAt: string | null;
  unreadCount: number;
  items: ActivityListItem[];
};

export type ActivityItemPayload = {
  itemKey?: string;
  goingNames?: string[];
  envieNames?: string[];
};

export type ActivitySeenBody =
  | { scope: 'all' }
  | { scope: 'token'; token: string };

export type ActivitySeenPayload = {
  ok: boolean;
  unreadCount: number;
};

export type ActivitySeenState = {
  global: string | null;
  tokens: Record<string, string>;
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
      : `anon:${ev.token || ev.ts}`;
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

function plusGoing(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? '+1 y va' : 'Une personne de plus y va';
}

function plusEnvie(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? '+1 envie' : `+${n} envie`;
}

/**
 * Contract copy: `latest` prénom if present, then leftover
 * `deltaGoing` / `deltaEnvie` as +1. Going before envie.
 */
export function inboxDeltaCopy(item: ActivityListItem): string {
  const latest = item.latest;
  const namedGoing =
    latest?.kind === 'going' && isNamed(latest.firstName)
      ? `${latest.firstName} y va`
      : '';
  const namedEnvie =
    latest?.kind === 'envie' && isNamed(latest.firstName)
      ? `${latest.firstName} a envie`
      : '';
  const extraGoing = Math.max(0, (item.deltaGoing || 0) - (namedGoing ? 1 : 0));
  const extraEnvie = Math.max(0, (item.deltaEnvie || 0) - (namedEnvie ? 1 : 0));
  const going = namedGoing || plusGoing(item.deltaGoing || 0);
  const envie = namedEnvie || plusEnvie(item.deltaEnvie || 0);
  const parts = [going, namedGoing ? plusGoing(extraGoing) : '', envie, namedEnvie ? plusEnvie(extraEnvie) : ''];
  const copy = parts.filter(Boolean).join(' · ');
  if (copy) return copy;
  return activityDeltaCopy(item.events);
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

export function inboxUnreadCount(items: readonly ActivityListItem[]): number {
  return items.filter((item) => item.unread).length;
}

export function itemIsUnread(item: ActivityListItem): boolean {
  return item.unread === true;
}

export function emptyActivityInbox(): ActivityListPayload {
  return { lastSeenAt: null, unreadCount: 0, items: [] };
}

/**
 * Wire list: keep unreadCount / deltas / latest. Drop `events[]`
 * (inbox copy uses latest + deltas; sand uses /item).
 */
export function slimActivityListForWire(
  payload: ActivityListPayload,
): ActivityListPayload {
  return {
    lastSeenAt: payload.lastSeenAt,
    unreadCount: payload.unreadCount,
    items: payload.items.map((item) => ({ ...item, events: [] })),
  };
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
}

/**
 * Chronological max of global + per-token lastSeen.
 * `tokens[token] || global` is wrong: an older per-token stamp
 * shadows a newer scope=all global and leaves RSVPs unread.
 */
export function lastSeenForToken(
  state: ActivitySeenState,
  token: string,
): string | null {
  const tokenSeen = state.tokens[token];
  const global = state.global;
  const tokenMs = tokenSeen ? Date.parse(tokenSeen) : NaN;
  const globalMs = global ? Date.parse(global) : NaN;
  const hasToken = Number.isFinite(tokenMs);
  const hasGlobal = Number.isFinite(globalMs);
  if (hasToken && hasGlobal) {
    return tokenMs >= globalMs ? tokenSeen : global;
  }
  if (hasToken) return tokenSeen;
  if (hasGlobal) return global;
  return null;
}

/** Missing / past event date → out of inbox (Paris civil day). */
export function filterActivityTokensByEventDate<T extends { itemKey: string }>(
  tokens: readonly T[],
  dateIsoForItemKey: (itemKey: string) => string,
  todayIso: string,
): T[] {
  return tokens.filter((t) =>
    isNotBeforeToday(dateIsoForItemKey(t.itemKey), todayIso),
  );
}

export function parseActivitySeenState(raw: unknown): ActivitySeenState {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        return parseActivitySeenState(JSON.parse(trimmed));
      } catch {
        return { global: null, tokens: {} };
      }
    }
    if (!Number.isNaN(Date.parse(trimmed))) {
      return { global: trimmed, tokens: {} };
    }
    return { global: null, tokens: {} };
  }
  const o = asRecord(raw);
  if (!o) return { global: null, tokens: {} };
  const global =
    typeof o.global === 'string' && !Number.isNaN(Date.parse(o.global))
      ? o.global
      : null;
  const tokens: Record<string, string> = {};
  if (o.tokens && typeof o.tokens === 'object') {
    for (const [k, v] of Object.entries(o.tokens as Record<string, unknown>)) {
      if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) tokens[k] = v;
    }
  }
  return { global, tokens };
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

export function parseActivityEvent(raw: unknown): ActivityEvent | null {
  const o = asRecord(raw);
  if (!o) return null;
  if (o.kind !== 'envie' && o.kind !== 'going') return null;
  if (typeof o.firstName !== 'string' || !o.firstName.trim()) return null;
  if (typeof o.email === 'string' || typeof o.emailHash === 'string') return null;
  if (typeof o.vid === 'string' || typeof o.cc_vid === 'string') return null;
  const ev: ActivityEvent = {
    firstName: o.firstName.trim(),
    kind: o.kind,
    ts: typeof o.ts === 'string' ? o.ts : new Date().toISOString(),
  };
  if (typeof o.token === 'string' && o.token.trim()) ev.token = o.token.trim();
  return ev;
}

export function parseActivityLatest(raw: unknown): ActivityLatest | null {
  const ev = parseActivityEvent(raw);
  if (!ev) return null;
  return { firstName: ev.firstName, kind: ev.kind, ts: ev.ts };
}

export function parseActivityListItem(raw: unknown): ActivityListItem | null {
  const o = asRecord(raw);
  if (!o || typeof o.itemKey !== 'string' || !o.itemKey.trim()) return null;
  if (typeof o.token !== 'string' || !o.token.trim()) return null;
  const events = Array.isArray(o.events)
    ? o.events.map(parseActivityEvent).filter((e): e is ActivityEvent => Boolean(e))
    : [];
  const latest = parseActivityLatest(o.latest) || (events[0]
    ? { firstName: events[0].firstName, kind: events[0].kind, ts: events[0].ts }
    : null);
  const deltaGoing =
    typeof o.deltaGoing === 'number' && Number.isFinite(o.deltaGoing)
      ? o.deltaGoing
      : 0;
  const deltaEnvie =
    typeof o.deltaEnvie === 'number' && Number.isFinite(o.deltaEnvie)
      ? o.deltaEnvie
      : 0;
  const unread =
    typeof o.unread === 'boolean' ? o.unread : deltaGoing + deltaEnvie > 0;
  return {
    token: o.token,
    itemKey: o.itemKey,
    seanceKey: typeof o.seanceKey === 'string' ? o.seanceKey : null,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
    envie: typeof o.envie === 'number' && Number.isFinite(o.envie) ? o.envie : 0,
    going: typeof o.going === 'number' && Number.isFinite(o.going) ? o.going : 0,
    unread,
    deltaGoing,
    deltaEnvie,
    latest,
    events,
  };
}

export function parseActivityListPayload(raw: unknown): ActivityListPayload {
  const o = asRecord(raw);
  const items = Array.isArray(o?.items)
    ? o.items.map(parseActivityListItem).filter((i): i is ActivityListItem => Boolean(i))
    : [];
  const lastSeenAtRaw = o?.lastSeenAt ?? o?.lastSeen;
  const lastSeenAt =
    typeof lastSeenAtRaw === 'string' && !Number.isNaN(Date.parse(lastSeenAtRaw))
      ? lastSeenAtRaw
      : null;
  const unreadCount =
    typeof o?.unreadCount === 'number' && Number.isFinite(o.unreadCount)
      ? Math.max(0, Math.floor(o.unreadCount))
      : inboxUnreadCount(items);
  return { lastSeenAt, unreadCount, items };
}

export function parseActivityItemPayload(raw: unknown): ActivityItemPayload | null {
  const o = asRecord(raw);
  if (!o) return null;
  if (typeof o.email === 'string' || typeof o.emailHash === 'string') return null;
  if (!('goingNames' in o) && !('envieNames' in o) && !('itemKey' in o)) return null;
  const goingNames = Array.isArray(o.goingNames)
    ? o.goingNames.filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
    : undefined;
  const envieNames = Array.isArray(o.envieNames)
    ? o.envieNames.filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
    : undefined;
  const payload: ActivityItemPayload = {};
  if (typeof o.itemKey === 'string' && o.itemKey.trim()) payload.itemKey = o.itemKey;
  if (goingNames && goingNames.length) payload.goingNames = goingNames;
  if (envieNames && envieNames.length) payload.envieNames = envieNames;
  return payload;
}

export function parseActivitySeenPayload(raw: unknown): ActivitySeenPayload | null {
  const o = asRecord(raw);
  if (!o) return null;
  const unreadCount =
    typeof o.unreadCount === 'number' && Number.isFinite(o.unreadCount)
      ? Math.max(0, Math.floor(o.unreadCount))
      : null;
  if (unreadCount == null) return null;
  return { ok: o.ok !== false, unreadCount };
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

/** 1 token = 1 inbox row (MVP). Unread / deltas from lastSeen of that token. */
export function buildActivityListItems(opts: {
  tokens: readonly ActivityTokenRef[];
  rsvpsByToken: ReadonlyMap<string, readonly ShareRsvpRecord[]>;
  lastSeenForToken?: (token: string) => string | null;
  limit?: number;
}): ActivityListItem[] {
  const items: ActivityListItem[] = [];
  for (const token of opts.tokens) {
    const rsvps = opts.rsvpsByToken.get(token.token) ?? [];
    const events = activityEventsFromRsvps(rsvps).slice(0, 10);
    const counts = motherStatsFromRsvps(rsvps);
    const seen = opts.lastSeenForToken?.(token.token) ?? null;
    const unreadEvents = events.filter((e) => eventIsUnread(e.ts, seen));
    const deltaGoing = unreadEvents.filter((e) => e.kind === 'going').length;
    const deltaEnvie = unreadEvents.filter((e) => e.kind === 'envie').length;
    const head = events[0];
    items.push({
      token: token.token,
      itemKey: token.itemKey,
      seanceKey: token.seanceKey ?? null,
      createdAt: token.createdAt,
      envie: counts.envie,
      going: counts.going,
      unread: unreadEvents.length > 0,
      deltaGoing,
      deltaEnvie,
      latest: head
        ? { firstName: head.firstName, kind: head.kind, ts: head.ts }
        : null,
      events,
    });
  }

  items.sort((a, b) => {
    const aTs = Date.parse(a.latest?.ts || a.createdAt || '') || 0;
    const bTs = Date.parse(b.latest?.ts || b.createdAt || '') || 0;
    if (bTs !== aTs) return bTs - aTs;
    return (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
  });

  return items.slice(0, opts.limit ?? 30);
}

export function omitEmptyNameFields(payload: ActivityItemPayload): ActivityItemPayload {
  const next: ActivityItemPayload = {};
  if (payload.itemKey) next.itemKey = payload.itemKey;
  if (payload.goingNames?.length) next.goingNames = payload.goingNames;
  if (payload.envieNames?.length) next.envieNames = payload.envieNames;
  return next;
}

/** Test / lint helper — activity copy must never say this. */
export function activityCopyHasInteresses(text: string): boolean {
  return /intéress/i.test(text);
}
