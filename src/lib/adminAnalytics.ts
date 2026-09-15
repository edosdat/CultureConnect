/**
 * Admin analytics MVP — KPI 1–18 helpers (pure).
 * Sources are assembled in adminAnalyticsLoad.ts (Neon / KV / catalogue).
 * RGPD: no cc_vid ↔ email join; export 18 hashes emails and omits full payloads.
 * P1 tables: hash only, 0 prénom, 0 vid list. CSV tastes = all scorable.
 */
import { createHash } from 'crypto';
import { dailyVidUniquesKey } from '@/lib/guestSignals';
import { addDaysIso, parisParts } from '@/lib/timeScope';
import { isTasteMood, TASTE_MOODS } from '@/lib/phraseTags';
import {
  entryWeight,
  hasScorableState,
  isCatTasteKey,
  TASTE_GENRE_SLUGS,
  type AccountTasteState,
  type SignalKind,
} from '@/lib/signals';

export const ANALYTICS_WINDOW_DAYS = 7;
export const ANALYTICS_WINDOW_DAYS_30 = 30;
export const MATCHABLE_TAG_THRESHOLD = 5;
/** P1: CSV tastes = all scorable comptes (no top-30 cap). */
export const TASTE_EXPORT_LIMIT = Number.POSITIVE_INFINITY;
export const ADMIN_TASTES_PAGE_SIZE = 50;
export const ADMIN_TABLE_PAGINATE_FROM = 100;
export const ADMIN_TOKENS_CAP = 2000;
export const ADMIN_RSVPS_CAP = 5000;
export const ADMIN_TASTES_CAP = 2000;
export const ADMIN_VISITS_TOP = 50;
export const ADMIN_TOP_TAGS_USERS = 15;
export const TAG_BUCKETS = ['0', '1-5', '6-15', '15+'] as const;
export type TagBucket = (typeof TAG_BUCKETS)[number];

/** Mesure LOCK: countable tags = moods ∪ genres only. 0 themes. */
const USEFUL_CATALOGUE_TAGS = new Set<string>([
  ...TASTE_MOODS,
  ...TASTE_GENRE_SLUGS,
]);

export type MixMain = 'cinema' | 'theatre_danse' | 'musique';

export type DailyUniques = {
  day: string;
  uniques: number;
  /** Same vid already seen on an earlier day in the 7j window. */
  returns: number;
};

export type TagDistribution = Record<TagBucket, number>;

export type GuestKindCount = { kind: SignalKind | string; count: number };

export type TopTag = { tag: string; count: number };

export type TasteExportRow = {
  emailHash: string;
  updatedAt: string;
  tastesSetAt: string;
  tagCount: number;
  matchable: boolean;
  moods: string;
  genres: string;
  tastesTextChars: number;
  nSignals: number;
  scorable: boolean;
};

export type TopTagUser = { tag: string; userCount: number };

export type TokenTableRow = {
  token: string;
  itemKey: string;
  seanceKey: string;
  createdAt: string;
  createdDay: string;
  sharerHash: string;
  opens: number;
};

export type RsvpTableRow = {
  token: string;
  emailHash: string;
  kind: string;
  itemKey: string;
  workId: string;
  updatedAt: string;
  updatedDay: string;
};

export type VisitAggRow = {
  token: string;
  opens: number;
  createdAt: string;
  createdDay: string;
  sharerHash: string;
  itemKey: string;
};

export type AdminTablesPayload = {
  tastes: { rows: TasteExportRow[]; topTagsUsers: TopTagUser[] };
  tokens: {
    rows: TokenTableRow[];
    totals: { count: number; opensSum: number; distinctSharers: number };
  };
  rsvps: { rows: RsvpTableRow[]; totals: { envie: number; going: number } };
  visitsAgg: {
    byTokenTop: VisitAggRow[];
    window7: { opensSum: number; tokensWithOpens: number; tokensCreated: number };
  };
  windowDays30: string[];
};

/** Inclusive last N Paris calendar days (today − (n−1) … today). */
export function analyticsWindowDaysN(n: number, now = new Date()): string[] {
  const count = Math.max(1, Math.floor(n));
  const today = parisParts(now).iso;
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    days.push(addDaysIso(today, -i));
  }
  return days;
}

/** Inclusive last 7 Paris calendar days (today − 6 … today). */
export function analyticsWindowDays(now = new Date()): string[] {
  return analyticsWindowDaysN(ANALYTICS_WINDOW_DAYS, now);
}

export function parisDayOfIso(ts: string): string | null {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return null;
  return parisParts(new Date(t)).iso;
}

export function inParisWindow(ts: string, days: ReadonlySet<string>): boolean {
  const day = parisDayOfIso(ts);
  return Boolean(day && days.has(day));
}

export { dailyVidUniquesKey };

export function googleLoginCountKey(parisIso: string): string {
  return `cc:login:${parisIso}`;
}

export function mean(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  let sum = 0;
  for (const n of nums) sum += n;
  return sum / nums.length;
}

export function median(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function round1(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/**
 * Mesure LOCK — KPI 1–2.
 * Uniques / j = DISTINCT vid with ≥1 `cc:vs:*` line whose ts falls on that
 * Paris calendar day. Returners = vids active on ≥2 distinct days in the
 * 7j window. Rate = returners / distinct-window (0 if none).
 * Retour / j = same vid already present on an earlier day in the window.
 */
export function uniquesAndReturns(
  vidDays: ReadonlyMap<string, ReadonlySet<string>>,
  windowDays: readonly string[],
): {
  perDay: DailyUniques[];
  distinct: number;
  returners: number;
  returnRate: number;
} {
  const dayIndex = new Map(windowDays.map((d, i) => [d, i]));
  const perDay = windowDays.map((day) => ({ day, uniques: 0, returns: 0 }));
  let returners = 0;
  let distinct = 0;

  for (const days of vidDays.values()) {
    const inWindow = windowDays.filter((d) => days.has(d));
    if (inWindow.length === 0) continue;
    distinct += 1;
    if (inWindow.length >= 2) returners += 1;
    for (const day of inWindow) {
      const idx = dayIndex.get(day);
      if (idx == null) continue;
      const row = perDay[idx]!;
      row.uniques += 1;
      const earlier = inWindow.some((d) => (dayIndex.get(d) ?? 99) < idx);
      if (earlier) row.returns += 1;
    }
  }

  return {
    perDay,
    distinct,
    returners,
    returnRate: distinct > 0 ? returners / distinct : 0,
  };
}

export function mergeVidDay(
  map: Map<string, Set<string>>,
  vid: string,
  day: string,
): void {
  if (!vid || !day) return;
  const set = map.get(vid) ?? new Set<string>();
  set.add(day);
  map.set(vid, set);
}

/**
 * Mesure LOCK — KPI 13 / 17 countable tags.
 * moods ∪ genres keys with weight > 0 only.
 * Exclude themes, entities, tastesText-only, and Musique/Théâtre/Cinéma cats.
 */
export function usefulTasteTags(state: AccountTasteState): string[] {
  const seen = new Set<string>();
  const push = (prefix: string, key: string) => {
    const k = key.trim().toLowerCase();
    if (!k) return;
    seen.add(`${prefix}${k}`);
  };
  const p = state.profile;
  for (const [k, e] of Object.entries(p.moods ?? {})) {
    if (isTasteMood(k) && entryWeight(e) > 0) push('', k);
  }
  for (const [k, e] of Object.entries(p.genres ?? {})) {
    if (isCatTasteKey(k) || entryWeight(e) <= 0) continue;
    push('g:', k);
  }
  return [...seen];
}

export function tagBucket(count: number): TagBucket {
  if (count <= 0) return '0';
  if (count <= 5) return '1-5';
  if (count <= 15) return '6-15';
  return '15+';
}

export function emptyTagDistribution(): TagDistribution {
  return { '0': 0, '1-5': 0, '6-15': 0, '15+': 0 };
}

export function splitCatalogueTagSlugs(
  raw: string | string[] | undefined | null,
): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(/[|,]/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const s = part.trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function isUsefulCatalogueTag(slug: string): boolean {
  return USEFUL_CATALOGUE_TAGS.has(slug.trim().toLowerCase());
}

export function usefulTagsFromFields(fields: {
  moods?: string;
  genres_mood?: string;
  genre?: string;
  tags?: string;
}): string[] {
  const raw = [
    ...splitCatalogueTagSlugs(fields.moods),
    ...splitCatalogueTagSlugs(fields.genres_mood),
    ...splitCatalogueTagSlugs(fields.genre),
    ...splitCatalogueTagSlugs(fields.tags),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slug of raw) {
    if (!isUsefulCatalogueTag(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function hashEmailKey(userKey: string): string {
  return createHash('sha256').update(userKey.trim().toLowerCase()).digest('hex').slice(0, 16);
}

/** UI hash: sha256[:16]. Store RSVP hashes may already be full sha256. */
export function displayEmailHash(hash: string): string {
  return hash.trim().toLowerCase().slice(0, 16);
}

/** UI token: `abcd…wxyz` (8+4) when longer than 12 chars. */
export function truncateTokenUi(token: string): string {
  const t = token.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

export function capJoinedList(value: string, maxChars = 72): string {
  const s = value.trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function adminCsvFilename(store: string, day: string): string {
  return `cc-${store}-${day}.csv`;
}

export function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function tasteRowFromAccount(r: {
  userKey: string;
  state: AccountTasteState;
  updatedAt?: string;
}): TasteExportRow {
  const tags = usefulTasteTags(r.state);
  const moods = Object.entries(r.state.profile.moods ?? {})
    .filter(([k, e]) => isTasteMood(k) && entryWeight(e) > 0)
    .map(([k]) => k)
    .sort();
  const genres = Object.entries(r.state.profile.genres ?? {})
    .filter(([k, e]) => !isCatTasteKey(k) && entryWeight(e) > 0)
    .map(([k]) => k)
    .sort();
  const tastesSetAt = r.state.tastesSetAt || r.updatedAt || '';
  return {
    emailHash: hashEmailKey(r.userKey),
    updatedAt: r.updatedAt || '',
    tastesSetAt,
    tagCount: tags.length,
    matchable: tags.length >= MATCHABLE_TAG_THRESHOLD,
    moods: moods.join('|'),
    genres: genres.join('|'),
    tastesTextChars: (r.state.tastesText || '').trim().length,
    nSignals: Array.isArray(r.state.signalsRecent) ? r.state.signalsRecent.length : 0,
    scorable: hasScorableState(r.state),
  };
}

export function tasteTableRows(
  rows: readonly {
    userKey: string;
    state: AccountTasteState;
    updatedAt?: string;
  }[],
): TasteExportRow[] {
  return rows
    .map((r) => {
      const row = tasteRowFromAccount(r);
      const sortKey = Date.parse(row.updatedAt) || Date.parse(row.tastesSetAt) || 0;
      return { row, sortKey };
    })
    .sort((a, b) => b.sortKey - a.sortKey)
    .map((item) => item.row);
}

/**
 * CSV KPI 18 / P1 comptes — **all** scorable rows (0 top-30 cap).
 * Optional `limit` is a test helper only.
 */
export function tasteExportRows(
  rows: readonly {
    userKey: string;
    state: AccountTasteState;
    updatedAt?: string;
  }[],
  limit?: number,
): TasteExportRow[] {
  const scored = rows
    .filter((r) => hasScorableState(r.state))
    .map((r) => {
      const row = tasteRowFromAccount(r);
      const sortKey = Date.parse(row.tastesSetAt) || Date.parse(row.updatedAt) || 0;
      return { row, sortKey };
    })
    .sort((a, b) => a.sortKey - b.sortKey);

  const cap =
    limit != null && Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : scored.length;
  return scored.slice(0, cap).map((item) => item.row);
}

/** Flatten moods∪genres > 0 → # comptes / tag. ≠ catalogue KPI 15. */
export function topTagsComptes(
  rows: readonly { state: AccountTasteState }[],
  limit = ADMIN_TOP_TAGS_USERS,
): TopTagUser[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const tag of usefulTasteTags(r.state)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, userCount]) => ({ tag, userCount }))
    .sort((a, b) => b.userCount - a.userCount || a.tag.localeCompare(b.tag))
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function buildTokenTableRows(
  rows: readonly {
    token: string;
    itemKey: string;
    seanceKey?: string;
    createdAt: string;
    sharerEmail: string | null;
    opens: number;
  }[],
): TokenTableRow[] {
  return rows
    .map((r) => {
      const createdDay = parisDayOfIso(r.createdAt) || '';
      const row: TokenTableRow = {
        token: r.token,
        itemKey: r.itemKey,
        seanceKey: r.seanceKey || '',
        createdAt: r.createdAt,
        createdDay,
        sharerHash: r.sharerEmail ? hashEmailKey(r.sharerEmail) : '',
        opens: Number.isFinite(r.opens) ? r.opens : 0,
      };
      return row;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function tokenTableTotals(rows: readonly TokenTableRow[]): {
  count: number;
  opensSum: number;
  distinctSharers: number;
} {
  const sharers = new Set(rows.map((r) => r.sharerHash).filter(Boolean));
  return {
    count: rows.length,
    opensSum: rows.reduce((n, r) => n + r.opens, 0),
    distinctSharers: sharers.size,
  };
}

export function buildRsvpTableRows(
  rows: readonly {
    token: string;
    emailHash: string;
    kind: string;
    itemKey: string;
    workId: string;
    ts: string;
  }[],
): RsvpTableRow[] {
  return rows
    .map((r) => ({
      token: r.token,
      emailHash: r.emailHash,
      kind: r.kind,
      itemKey: r.itemKey,
      workId: r.workId,
      updatedAt: r.ts,
      updatedDay: parisDayOfIso(r.ts) || '',
    }))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function rsvpTableTotals(rows: readonly RsvpTableRow[]): {
  envie: number;
  going: number;
} {
  let envie = 0;
  let going = 0;
  for (const r of rows) {
    if (r.kind === 'envie') envie += 1;
    else if (r.kind === 'going') going += 1;
  }
  return { envie, going };
}

export function buildVisitsAgg(
  tokens: readonly TokenTableRow[],
  windowDays: ReadonlySet<string>,
  top = ADMIN_VISITS_TOP,
): {
  byTokenTop: VisitAggRow[];
  window7: { opensSum: number; tokensWithOpens: number; tokensCreated: number };
} {
  const inWindow = tokens.filter((t) => t.createdDay && windowDays.has(t.createdDay));
  const byTokenTop: VisitAggRow[] = [...tokens]
    .sort((a, b) => b.opens - a.opens || a.token.localeCompare(b.token))
    .slice(0, Math.max(0, Math.floor(top)))
    .map((t) => ({
      token: t.token,
      opens: t.opens,
      createdAt: t.createdAt,
      createdDay: t.createdDay,
      sharerHash: t.sharerHash,
      itemKey: t.itemKey,
    }));
  return {
    byTokenTop,
    window7: {
      opensSum: inWindow.reduce((n, t) => n + t.opens, 0),
      tokensWithOpens: inWindow.filter((t) => t.opens > 0).length,
      tokensCreated: inWindow.length,
    },
  };
}

function interneBanner(store: string): string {
  return `# INTERNE — export ${store}. Ne pas diffuser. 0 e-mail clair, 0 prénom, 0 identifiant visiteur. Hash comptes/partageurs = sha256(email)[:16].`;
}

export function formatTasteExportCsv(rows: readonly TasteExportRow[]): string {
  const header = [
    'email_hash',
    'updated_at',
    'tastes_set_at',
    'tag_count',
    'matchable_ge5',
    'moods',
    'genres',
    'tastes_text_chars',
    'n_signals',
  ];
  const lines = [
    `${interneBanner('tastes')} Tags = moods∪genres > 0 only. Tous les comptes scorable.`,
    header.join(','),
    ...rows.map((r) =>
      [
        csvEscape(r.emailHash),
        csvEscape(r.updatedAt),
        csvEscape(r.tastesSetAt),
        csvEscape(r.tagCount),
        csvEscape(r.matchable ? '1' : '0'),
        csvEscape(r.moods),
        csvEscape(r.genres),
        csvEscape(r.tastesTextChars),
        csvEscape(r.nSignals),
      ].join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatTokenExportCsv(rows: readonly TokenTableRow[]): string {
  const header = [
    'token',
    'item_key',
    'seance_key',
    'created_at',
    'sharer_hash',
    'opens',
  ];
  const lines = [
    `${interneBanner('tokens')} token = secret de lien (allowlist only).`,
    header.join(','),
    ...rows.map((r) =>
      [
        csvEscape(r.token),
        csvEscape(r.itemKey),
        csvEscape(r.seanceKey),
        csvEscape(r.createdAt),
        csvEscape(r.sharerHash),
        csvEscape(r.opens),
      ].join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatRsvpExportCsv(rows: readonly RsvpTableRow[]): string {
  const header = [
    'token',
    'email_hash',
    'kind',
    'item_key',
    'work_id',
    'updated_at',
  ];
  const lines = [
    `${interneBanner('rsvps')} email_hash = hash store (pas de prénom).`,
    header.join(','),
    ...rows.map((r) =>
      [
        csvEscape(r.token),
        csvEscape(r.emailHash),
        csvEscape(r.kind),
        csvEscape(r.itemKey),
        csvEscape(r.workId),
        csvEscape(r.updatedAt),
      ].join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatVisitsAggExportCsv(rows: readonly VisitAggRow[]): string {
  const header = ['token', 'opens', 'created_at', 'sharer_hash'];
  const lines = [
    `${interneBanner('visits')} agrégat share_tokens.opens — pas de lignes visiteur.`,
    header.join(','),
    ...rows.map((r) =>
      [
        csvEscape(r.token),
        csvEscape(r.opens),
        csvEscape(r.createdAt),
        csvEscape(r.sharerHash),
      ].join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function incrementKindCounts(
  counts: Map<string, number>,
  kind: string,
): void {
  counts.set(kind, (counts.get(kind) || 0) + 1);
}

export function kindCountsToList(counts: Map<string, number>): GuestKindCount[] {
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}
