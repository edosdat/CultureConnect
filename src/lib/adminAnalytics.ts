/**
 * Admin analytics MVP — KPI 1–18 helpers (pure).
 * Sources are assembled in adminAnalyticsLoad.ts (Neon / KV / catalogue).
 * RGPD: no cc_vid ↔ email join; export 18 hashes emails and omits full payloads.
 */
import { createHash } from 'crypto';
import { dailyVidUniquesKey } from '@/lib/guestSignals';
import { addDaysIso, parisParts } from '@/lib/timeScope';
import { isTasteMood, parsePhraseRules, TASTE_MOODS } from '@/lib/phraseTags';
import {
  entryWeight,
  hasScorableState,
  isCatTasteKey,
  TASTE_GENRE_SLUGS,
  type AccountTasteState,
  type SignalKind,
} from '@/lib/signals';

export const ANALYTICS_WINDOW_DAYS = 7;
export const MATCHABLE_TAG_THRESHOLD = 5;
export const TASTE_EXPORT_LIMIT = 30;
export const TAG_BUCKETS = ['0', '1-5', '6-15', '15+'] as const;
export type TagBucket = (typeof TAG_BUCKETS)[number];

/** Mirrors reco CLOSED_THEMES — tag utile = closed mood / genre / theme. */
const CLOSED_THEMES = new Set([
  'feminisme',
  'histoire',
  'politique',
  'guerre',
  'ecologie',
  'science',
  'amour',
  'famille',
  'colonial',
  'immigration',
  'lgbt',
  'religion',
  'sport',
  'mer',
  'voyage',
  'amitie',
  'travail',
  'deuil',
  'jeunesse',
]);

const USEFUL_CATALOGUE_TAGS = new Set<string>([
  ...TASTE_MOODS,
  ...TASTE_GENRE_SLUGS,
  ...CLOSED_THEMES,
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
  themes: string;
  tastesTextChars: number;
};

/** Inclusive last 7 Paris calendar days (today − 6 … today). */
export function analyticsWindowDays(now = new Date()): string[] {
  const today = parisParts(now).iso;
  const days: string[] = [];
  for (let i = ANALYTICS_WINDOW_DAYS - 1; i >= 0; i -= 1) {
    days.push(addDaysIso(today, -i));
  }
  return days;
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
 * Uniques = distinct vids present that Paris day.
 * Retour / j = vid also present on an earlier day in the same 7j window.
 * Returners = vids with ≥2 distinct days in the window (j+1+).
 */
export function uniquesAndReturns(
  vidDays: ReadonlyMap<string, ReadonlySet<string>>,
  windowDays: readonly string[],
): {
  perDay: DailyUniques[];
  distinct: number;
  returners: number;
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

  return { perDay, distinct, returners };
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

/** Distinct useful goût tags (moods 16 + genres + themes). Cats / communes excluded. */
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
  for (const [k, e] of Object.entries(p.themes ?? {})) {
    if (isCatTasteKey(k) || entryWeight(e) <= 0) continue;
    push('t:', k);
  }
  const text = (state.tastesText || '').trim();
  if (text) {
    const parsed = parsePhraseRules(text);
    for (const m of parsed.moods) {
      if (isTasteMood(m)) push('', m);
    }
    for (const g of parsed.genres) push('g:', g);
    for (const t of parsed.themes) push('t:', t);
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
  themes?: string;
  tags?: string;
}): string[] {
  const raw = [
    ...splitCatalogueTagSlugs(fields.moods),
    ...splitCatalogueTagSlugs(fields.genres_mood),
    ...splitCatalogueTagSlugs(fields.genre),
    ...splitCatalogueTagSlugs(fields.themes),
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

export function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function tasteExportRows(
  rows: readonly {
    userKey: string;
    state: AccountTasteState;
    updatedAt?: string;
  }[],
  limit = TASTE_EXPORT_LIMIT,
): TasteExportRow[] {
  const scored = rows
    .filter((r) => hasScorableState(r.state))
    .map((r) => {
      const tags = usefulTasteTags(r.state);
      const moods = Object.entries(r.state.profile.moods ?? {})
        .filter(([k, e]) => isTasteMood(k) && entryWeight(e) > 0)
        .map(([k]) => k)
        .sort();
      const genres = Object.entries(r.state.profile.genres ?? {})
        .filter(([k, e]) => !isCatTasteKey(k) && entryWeight(e) > 0)
        .map(([k]) => k)
        .sort();
      const themes = Object.entries(r.state.profile.themes ?? {})
        .filter(([k, e]) => !isCatTasteKey(k) && entryWeight(e) > 0)
        .map(([k]) => k)
        .sort();
      const tastesSetAt = r.state.tastesSetAt || r.updatedAt || '';
      const row: TasteExportRow = {
        emailHash: hashEmailKey(r.userKey),
        updatedAt: r.updatedAt || '',
        tastesSetAt,
        tagCount: tags.length,
        matchable: tags.length >= MATCHABLE_TAG_THRESHOLD,
        moods: moods.join('|'),
        genres: genres.join('|'),
        themes: themes.join('|'),
        tastesTextChars: (r.state.tastesText || '').trim().length,
      };
      const sortKey = Date.parse(tastesSetAt) || Date.parse(r.updatedAt || '') || 0;
      return { row, sortKey };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(0, limit);

  return scored.map((item) => item.row);
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
    'themes',
    'tastes_text_chars',
  ];
  const lines = [
    '# INTERNE — export goûts KPI 18. Ne pas diffuser. email_hash = sha256(email)[:16]. Pas de payload complet.',
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
        csvEscape(r.themes),
        csvEscape(r.tastesTextChars),
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
