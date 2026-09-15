/**
 * Assemble KPI 1–18 from existing Neon / KV / catalogue stores.
 * Admin-only caller. Never joins cc_vid with account identity.
 */
import 'server-only';
import {
  analyticsWindowDays,
  emptyTagDistribution,
  formatTasteExportCsv,
  inParisWindow,
  incrementKindCounts,
  kindCountsToList,
  mean,
  median,
  mergeVidDay,
  parisDayOfIso,
  round1,
  tagBucket,
  tasteExportRows,
  uniquesAndReturns,
  usefulTagsFromFields,
  usefulTasteTags,
  type DailyUniques,
  type GuestKindCount,
  type MixMain,
  type TagDistribution,
  type TasteExportRow,
  type TopTag,
} from '@/lib/adminAnalytics';
import { readGoogleLoginCounts } from '@/lib/adminCounters';
import { listAccountTastesForAdmin } from '@/lib/accountTasteStore';
import { loadCultureData } from '@/lib/data';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import { normalizeCommune } from '@/lib/commune';
import { mainsForItem, type MainCategoryId } from '@/lib/categories';
import {
  assertNoVidAccountJoin,
  dailyVidUniquesKey,
  isValidVid,
  type GuestAppendLine,
} from '@/lib/guestSignals';
import { queryAgendaDetail } from '@/lib/agendaQuery';
import {
  hasScorableState,
  isKnownSignalKind,
  mappedCategorie,
} from '@/lib/signals';
import {
  listShareRsvpsForAdmin,
  listShareTokensForAdmin,
} from '@/lib/shareStore';

type KvConfig = { url: string; token: string };

function kvConfig(): KvConfig | null {
  const env = process.env;
  const url = (
    env['KV_REST_API_URL'] ||
    env['UPSTASH_REDIS_REST_URL'] ||
    ''
  ).trim();
  const token = (
    env['KV_REST_API_TOKEN'] ||
    env['UPSTASH_REDIS_REST_TOKEN'] ||
    ''
  ).trim();
  if (!url || !token || url === 'undefined' || token === 'undefined') {
    return null;
  }
  return { url: url.replace(/\/$/, ''), token };
}

async function kvPipeline(cmds: string[][]): Promise<unknown[] | null> {
  const cfg = kvConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cmds),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function pipelineStrings(entry: unknown): string[] {
  if (Array.isArray(entry)) {
    return entry.filter((v): v is string => typeof v === 'string');
  }
  if (entry && typeof entry === 'object' && 'result' in entry) {
    const r = (entry as { result?: unknown }).result;
    if (Array.isArray(r)) {
      return r.filter((v): v is string => typeof v === 'string');
    }
  }
  return [];
}

function pipelineScan(entry: unknown): { cursor: string; keys: string[] } {
  let pair: unknown = entry;
  if (entry && typeof entry === 'object' && 'result' in entry) {
    pair = (entry as { result: unknown }).result;
  }
  if (!Array.isArray(pair) || pair.length < 2) return { cursor: '0', keys: [] };
  const cursor = String(pair[0] ?? '0');
  const keysRaw = pair[1];
  const keys = Array.isArray(keysRaw)
    ? keysRaw.filter((k): k is string => typeof k === 'string')
    : [];
  return { cursor, keys };
}

function parseGuestAppendLine(raw: string): GuestAppendLine | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    if (!isValidVid(o.vid)) return null;
    if (typeof o.kind !== 'string' || !isKnownSignalKind(o.kind)) return null;
    if (o.authed !== false) return null;
    assertNoVidAccountJoin(o);
    return {
      ts: typeof o.ts === 'string' ? o.ts : '',
      vid: o.vid,
      kind: o.kind,
      itemKey: typeof o.itemKey === 'string' ? o.itemKey : '',
      cohort: typeof o.cohort === 'string' ? o.cohort : 'public',
      authed: false,
    };
  } catch {
    return null;
  }
}

const SCAN_KEY_CAP = 1500;
const LRANGE_BATCH = 40;

async function scanGuestVidKeys(): Promise<string[]> {
  const keys: string[] = [];
  const seen = new Set<string>();
  let cursor = '0';
  for (let i = 0; i < 40; i += 1) {
    const rows = await kvPipeline([
      ['SCAN', cursor, 'MATCH', 'cc:vs:*', 'COUNT', '200'],
    ]);
    if (!rows) break;
    const page = pipelineScan(rows[0]);
    for (const key of page.keys) {
      if (!key.startsWith('cc:vs:') || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
      if (keys.length >= SCAN_KEY_CAP) return keys;
    }
    cursor = page.cursor;
    if (cursor === '0') break;
  }
  return keys;
}

async function listGuestAppendLines(): Promise<GuestAppendLine[]> {
  const keys = await scanGuestVidKeys();
  if (keys.length === 0) return [];
  const lines: GuestAppendLine[] = [];
  for (let i = 0; i < keys.length; i += LRANGE_BATCH) {
    const batch = keys.slice(i, i + LRANGE_BATCH);
    const rows = await kvPipeline(batch.map((k) => ['LRANGE', k, '0', '-1']));
    if (!rows) break;
    for (const entry of rows) {
      for (const raw of pipelineStrings(entry)) {
        const line = parseGuestAppendLine(raw);
        if (line) lines.push(line);
      }
    }
  }
  return lines;
}

async function readDailyVidSets(
  days: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (days.length === 0) return out;
  const rows = await kvPipeline(
    days.map((d) => ['SMEMBERS', dailyVidUniquesKey(d)]),
  );
  if (!rows) return out;
  days.forEach((day, i) => {
    out.set(day, pipelineStrings(rows[i]));
  });
  return out;
}

const MIX_MAINS: ReadonlySet<string> = new Set([
  'cinema',
  'theatre_danse',
  'musique',
]);

function mixFromMains(mains: readonly MainCategoryId[]): MixMain | null {
  if (mains.includes('cinema')) return 'cinema';
  if (mains.includes('theatre_danse')) return 'theatre_danse';
  if (mains.includes('musique')) return 'musique';
  return null;
}

function mixFromItemKey(
  itemKey: string,
  cache: Map<string, MixMain | null>,
): MixMain | null {
  const raw = (itemKey || '').trim();
  if (!raw) return null;
  const hit = cache.get(raw);
  if (hit !== undefined) return hit;

  const candidates = [
    raw,
    normalizeDeepLinkId(raw) || '',
    raw.startsWith('p:') || raw.startsWith('e:') ? '' : `e:${raw}`,
    raw.startsWith('p:') || raw.startsWith('e:') ? '' : `p:${raw}`,
  ].filter(Boolean);

  let resolved: MixMain | null = null;
  for (const key of candidates) {
    const item = queryAgendaDetail(key)?.item;
    if (!item) continue;
    const cat =
      item.kind === 'programme'
        ? item.evenement?.categorie || ''
        : item.evenement.categorie || '';
    const genre =
      item.kind === 'programme'
        ? item.programme.genre || item.evenement?.genre || ''
        : item.evenement.genre || '';
    if ((item.kind === 'programme' ? item.programme.film_id : '')?.trim()) {
      resolved = 'cinema';
      break;
    }
    resolved = mixFromMains(mainsForItem(cat, genre));
    if (!resolved) {
      const mapped = mappedCategorie(cat);
      if (mapped && MIX_MAINS.has(mapped)) resolved = mapped as MixMain;
    }
    if (resolved) break;
  }
  if (!resolved && /^f/i.test(raw)) resolved = 'cinema';
  cache.set(raw, resolved);
  return resolved;
}

export type AdminAnalyticsSnapshot = {
  windowDays: string[];
  generatedAt: string;
  sources: {
    neon: boolean;
    kv: boolean;
  };
  notes: string[];
  traffic: {
    perDay: DailyUniques[];
    distinct7j: number;
    returners: number;
  };
  funnel: {
    openCard: number;
    outboundClick: number;
  };
  share: {
    tokensCreated: number;
    opensMean: number;
    opensMedian: number;
    envie: number;
    going: number;
    enviePerToken: number;
    goingPerToken: number;
    distinctSharers: number;
  };
  compte: {
    googleLogins: number;
    googleLoginsPerDay: { day: string; count: number }[];
    guestAppends: number;
  };
  mix: {
    cinema: number;
    theatre: number;
    musique: number;
    other: number;
    total: number;
  };
  gouts: {
    accounts: number;
    withTastes: number;
    withoutTastes: number;
    tagDistribution: TagDistribution;
    catalogueEvents: number;
    catalogueTagged: number;
    catalogueCoveragePct: number;
    topTagsToulouse: TopTag[];
    guestByKind: GuestKindCount[];
    matchable: number;
  };
  export18: {
    rows: number;
    interne: true;
  };
};

function postgresConfigured(): boolean {
  const env = process.env;
  const url = (env['POSTGRES_URL'] || env['POSTGRES_URL_NON_POOLING'] || '').trim();
  return Boolean(url && url !== 'undefined');
}

export async function loadAdminAnalytics(
  now = new Date(),
): Promise<AdminAnalyticsSnapshot> {
  const windowDays = analyticsWindowDays(now);
  const daySet = new Set(windowDays);
  const notes: string[] = [];

  const [guestLines, dailySets, loginCounts, tokens, rsvps, accounts] =
    await Promise.all([
      listGuestAppendLines(),
      readDailyVidSets(windowDays),
      readGoogleLoginCounts(windowDays),
      listShareTokensForAdmin(),
      listShareRsvpsForAdmin(),
      listAccountTastesForAdmin(),
    ]);

  const vidDays = new Map<string, Set<string>>();
  for (const [day, vids] of dailySets) {
    for (const vid of vids) mergeVidDay(vidDays, vid, day);
  }
  for (const line of guestLines) {
    const day = parisDayOfIso(line.ts);
    if (day && daySet.has(day)) mergeVidDay(vidDays, line.vid, day);
  }
  const traffic = uniquesAndReturns(vidDays, windowDays);
  if (guestLines.length === 0 && traffic.distinct === 0) {
    notes.push(
      'KPI 1–2 : uniques / retours = vids guest (`cc:vs:*` + index `cc:vu:YYYY-MM-DD`). Authed sans miroir vid. Vide si KV indisponible ou aucun signal guest.',
    );
  }

  const windowGuest = guestLines.filter((l) => inParisWindow(l.ts, daySet));
  const guestKindMap = new Map<string, number>();
  let openCard = 0;
  let outboundClick = 0;
  const mixCache = new Map<string, MixMain | null>();
  const mix = { cinema: 0, theatre: 0, musique: 0, other: 0, total: 0 };

  for (const line of windowGuest) {
    incrementKindCounts(guestKindMap, line.kind);
    if (line.kind === 'open_card') {
      openCard += 1;
      const main = mixFromItemKey(line.itemKey, mixCache);
      mix.total += 1;
      if (main === 'cinema') mix.cinema += 1;
      else if (main === 'theatre_danse') mix.theatre += 1;
      else if (main === 'musique') mix.musique += 1;
      else mix.other += 1;
    }
    if (line.kind === 'outbound_click') outboundClick += 1;
  }

  for (const row of accounts) {
    for (const s of row.state.signalsRecent) {
      if (!inParisWindow(s.ts, daySet)) continue;
      if (s.kind === 'open_card') {
        openCard += 1;
        const key = s.film_id || s.event_id || s.programme_id || '';
        const fromCat = mappedCategorie(s.categorie);
        let main: MixMain | null =
          fromCat && MIX_MAINS.has(fromCat) ? (fromCat as MixMain) : null;
        if (!main && key) main = mixFromItemKey(key, mixCache);
        if (!main && s.film_id) main = 'cinema';
        mix.total += 1;
        if (main === 'cinema') mix.cinema += 1;
        else if (main === 'theatre_danse') mix.theatre += 1;
        else if (main === 'musique') mix.musique += 1;
        else mix.other += 1;
      }
      if (s.kind === 'outbound_click') outboundClick += 1;
    }
  }

  const tokensInWindow = tokens.filter((t) => inParisWindow(t.createdAt, daySet));
  const tokenPool = tokensInWindow.length > 0 ? tokensInWindow : tokens;
  const opens = tokenPool.map((t) => t.opens);
  const rsvpsInWindow = rsvps.filter((r) => inParisWindow(r.ts, daySet));
  const rsvpPool = rsvpsInWindow.length > 0 ? rsvpsInWindow : rsvps;
  const envie = rsvpPool.filter((r) => r.kind === 'envie').length;
  const going = rsvpPool.filter((r) => r.kind === 'going').length;
  const tokenDenom = Math.max(tokenPool.length, 1);
  const sharers = new Set(
    tokensInWindow
      .map((t) => t.sharerEmail)
      .filter((e): e is string => Boolean(e && e.includes('@'))),
  );

  const googleLoginsPerDay = windowDays.map((day) => ({
    day,
    count: loginCounts.get(day) || 0,
  }));
  const googleLogins = googleLoginsPerDay.reduce((n, r) => n + r.count, 0);
  if (googleLogins === 0) {
    notes.push(
      'KPI 9 : compteur KV `cc:login:YYYY-MM-DD` posé au sign-in NextAuth (à partir de ce déploiement). Historique antérieur non stocké.',
    );
  }

  const tagDistribution = emptyTagDistribution();
  let withTastes = 0;
  let matchable = 0;
  for (const row of accounts) {
    const tags = usefulTasteTags(row.state);
    tagDistribution[tagBucket(tags.length)] += 1;
    if (hasScorableState(row.state)) withTastes += 1;
    if (tags.length >= 5) matchable += 1;
  }

  const data = loadCultureData();
  const tagsByEvent = new Map<string, Set<string>>();
  const toulouseTags = new Map<string, number>();

  const addEventTags = (
    eventId: string,
    commune: string | undefined,
    fields: {
      moods?: string;
      genres_mood?: string;
      genre?: string;
      tags?: string;
    },
  ) => {
    const id = (eventId || '').trim();
    if (!id) return;
    const useful = usefulTagsFromFields(fields);
    const set = tagsByEvent.get(id) ?? new Set<string>();
    for (const t of useful) set.add(t);
    tagsByEvent.set(id, set);
    if (normalizeCommune(commune) === 'toulouse') {
      for (const t of useful) {
        toulouseTags.set(t, (toulouseTags.get(t) || 0) + 1);
      }
    }
  };

  for (const ev of data.events) {
    addEventTags(ev.event_id, ev.lieu?.commune, ev);
  }
  for (const row of data.programmeWithContext) {
    const eventId = row.evenement?.event_id || row.programme.event_id;
    addEventTags(eventId, row.lieu?.commune, {
      moods: row.programme.moods || row.evenement?.moods,
      genres_mood: row.programme.genres_mood || row.evenement?.genres_mood,
      genre: row.programme.genre || row.evenement?.genre,
      tags: row.evenement?.tags,
    });
  }

  const catalogueEvents = tagsByEvent.size || data.evenements.length;
  let catalogueTagged = 0;
  for (const set of tagsByEvent.values()) {
    if (set.size > 0) catalogueTagged += 1;
  }
  const catalogueCoveragePct =
    catalogueEvents > 0 ? round1((100 * catalogueTagged) / catalogueEvents) : 0;
  const topTagsToulouse: TopTag[] = [...toulouseTags.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 15);

  const exportRows = tasteExportRows(accounts);

  return {
    windowDays,
    generatedAt: now.toISOString(),
    sources: {
      neon: postgresConfigured(),
      kv: Boolean(kvConfig()),
    },
    notes,
    traffic: {
      perDay: traffic.perDay,
      distinct7j: traffic.distinct,
      returners: traffic.returners,
    },
    funnel: { openCard, outboundClick },
    share: {
      tokensCreated: tokensInWindow.length,
      opensMean: round1(mean(opens)),
      opensMedian: round1(median(opens)),
      envie,
      going,
      enviePerToken: round1(envie / tokenDenom),
      goingPerToken: round1(going / tokenDenom),
      distinctSharers: sharers.size,
    },
    compte: {
      googleLogins,
      googleLoginsPerDay,
      guestAppends: windowGuest.length,
    },
    mix,
    gouts: {
      accounts: accounts.length,
      withTastes,
      withoutTastes: Math.max(0, accounts.length - withTastes),
      tagDistribution,
      catalogueEvents,
      catalogueTagged,
      catalogueCoveragePct,
      topTagsToulouse,
      guestByKind: kindCountsToList(guestKindMap),
      matchable,
    },
    export18: { rows: exportRows.length, interne: true },
  };
}

export async function loadTasteExportCsv(now = new Date()): Promise<{
  csv: string;
  rows: TasteExportRow[];
  filename: string;
}> {
  const accounts = await listAccountTastesForAdmin();
  const rows = tasteExportRows(accounts);
  const day = analyticsWindowDays(now)[analyticsWindowDays(now).length - 1];
  return {
    csv: formatTasteExportCsv(rows),
    rows,
    filename: `cc-gouts-internes-${day}.csv`,
  };
}
