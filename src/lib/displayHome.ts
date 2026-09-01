/**
 * Display-only helpers for the home sections.
 * No scoring, no CSV edits, no tag vocabulary changes.
 */

import type { DayItem } from './types';
import type { AccountTasteState } from './signals';
import { densify, densifyGroupKey, type DenseRow } from './densify';
import {
  filmIdOfItem,
  isCinemaDayItem,
  isVivantDayItem,
  mainOfDayItem,
} from './nouveautesCine';
import { formatDateFr, formatHeure, formatLieuAffiche } from './labels';
import { seanceDateIso } from './timeScope';
import { profileChips } from './pourToi';
import { isTasteMood, type TasteMood } from './phraseTags';
import type { RecoSlotForm } from './reco';
import { slotFormOfItem } from './reco';
import type { TimeScopeId } from './timeScope';
import { sortItemsNearestFirst, type GeoPos } from './nearMe';

/** Living-led visual order for Top 3 (scoring order in reco.ts is unchanged). */
export const DISPLAY_SLOT_ORDER: RecoSlotForm[] = [
  'concert',
  'theatre',
  'cine',
];

export const SEARCH_EXAMPLES = [
  { label: 'un truc intimiste', query: 'un truc intimiste' },
  { label: 'envie de danser', query: 'envie de danser' },
  { label: 'un film feel good', query: 'un film feel good' },
] as const;

const HOME_CINE_DESKTOP = 10;
const HOME_CINE_MOBILE = 3;
const LIVE_DISPLAY_CAP = 36;
const EDITORIAL_CAP = 6;

export function itemTitle(item: DayItem): string {
  return item.kind === 'programme'
    ? item.programme.nom_item
    : item.evenement.titre;
}

export function itemPitch(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.description_item || '').trim() ||
      (item.evenement?.description_courte || '').trim()
    );
  }
  return (item.evenement.description_courte || '').trim();
}

export function itemImageUrl(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.image_url || '').trim() ||
      (item.evenement?.image_url || '').trim()
    );
  }
  return (item.evenement.image_url || '').trim();
}

export function itemHeure(item: DayItem): string {
  if (item.kind === 'programme') {
    return formatHeure(item.programme.heure_debut);
  }
  return formatHeure(item.evenement.heure_debut);
}

/** Planning line: this séance’s Paris date + time (never a later day’s clock). */
export function seanceWhen(item: DayItem, earliestHeure?: string): string {
  const date = formatDateFr(seanceDateIso(item) || item.dayIso || '');
  const time = itemHeure(item) || (earliestHeure ? formatHeure(earliestHeure) : '');
  return [date, time].filter(Boolean).join(' · ');
}

export const SEARCH_PLACEHOLDER =
  'Qu’est-ce qui te ferait vibrer ? (un truc intimiste, envie de danser, un film feel good)';

export function itemVenue(item: DayItem): string {
  return formatLieuAffiche(item.lieu);
}

function splitTagField(raw: string): string[] {
  return raw
    .split(/[|,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function itemMoods(item: DayItem): string[] {
  const raw =
    item.kind === 'programme'
      ? `${item.programme.moods || ''} ${item.evenement?.moods || ''}`
      : item.evenement.moods || '';
  return splitTagField(raw);
}

export function itemGenreSlugs(item: DayItem): string[] {
  const raw =
    item.kind === 'programme'
      ? `${item.programme.genre || ''} ${item.programme.genres_mood || ''} ${item.evenement?.genre || ''} ${item.evenement?.genres_mood || ''}`
      : `${item.evenement.genre || ''} ${item.evenement.genres_mood || ''}`;
  return splitTagField(raw);
}

/** Reco cards that actually exist (1 ciné + 1 théâtre + 1 concert). Omit empty slots. */
export function visibleTop3Items(items: DayItem[]): DayItem[] {
  const bySlot = new Map<RecoSlotForm, DayItem>();
  for (const item of items) {
    const slot = slotFormOfItem(item);
    if (slot && !bySlot.has(slot)) bySlot.set(slot, item);
  }
  const out: DayItem[] = [];
  for (const slot of DISPLAY_SLOT_ORDER) {
    const hit = bySlot.get(slot);
    if (hit) out.push(hit);
  }
  return out;
}

/** 0 → hide; 1 → full width; 2 → 50/50; 3 → current 3-up. */
export function top3GridClass(count: number): string {
  if (count <= 1) return 'grid w-full grid-cols-1 gap-3';
  if (count === 2) return 'grid w-full grid-cols-1 gap-3 sm:grid-cols-2';
  return 'grid w-full grid-cols-1 gap-3 lg:grid-cols-3';
}

export function shouldShowTop3Section(opts: {
  ready: boolean;
  wiped: boolean;
  cardCount: number;
}): boolean {
  if (opts.wiped) return false;
  if (!opts.ready) return true;
  return opts.cardCount > 0;
}

export function eventIdOf(item: DayItem): string {
  if (item.kind === 'programme') return item.programme.event_id || '';
  return item.evenement.event_id || '';
}

export function identityKeysOf(item: DayItem): string[] {
  const keys = [item.key, densifyGroupKey(item)];
  const fid = filmIdOfItem(item);
  if (fid) keys.push(`film:${fid}`);
  const eid = eventIdOf(item);
  if (eid) keys.push(`ev:${eid}`);
  const title = itemTitle(item).trim().toLocaleLowerCase('fr');
  if (title) keys.push(`t:${title}`);
  return keys;
}

export function top3IdentitySet(items: DayItem[]): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    for (const k of identityKeysOf(item)) set.add(k);
  }
  return set;
}

export function isInTop3(item: DayItem, top3: ReadonlySet<string>): boolean {
  if (top3.size === 0) return false;
  return identityKeysOf(item).some((k) => top3.has(k));
}

export function dedupAgainstTop3(
  items: DayItem[],
  top3: ReadonlySet<string>,
): DayItem[] {
  if (top3.size === 0) return items;
  return items.filter((item) => !isInTop3(item, top3));
}

/** Avoid a run of 6+ same-genre / same-form cards. Display shuffle only. */
export function displayShuffle<T extends DayItem>(items: T[]): T[] {
  if (items.length < 6) return items;
  const out: T[] = [];
  const pending = [...items];
  while (pending.length) {
    const last = out[out.length - 1];
    const lastForm = last ? slotFormOfItem(last) || mainOfDayItem(last) : null;
    const lastGenre = last ? itemGenreSlugs(last)[0] : '';
    let pick = 0;
    if (lastForm || lastGenre) {
      const run = countTailRun(out, lastForm, lastGenre);
      if (run >= 5) {
        const alt = pending.findIndex((item) => {
          const form = slotFormOfItem(item) || mainOfDayItem(item);
          const genre = itemGenreSlugs(item)[0];
          return form !== lastForm || (genre && genre !== lastGenre);
        });
        if (alt >= 0) pick = alt;
      }
    }
    out.push(pending.splice(pick, 1)[0]!);
  }
  return out;
}

function countTailRun(
  items: DayItem[],
  form: string | null,
  genre: string,
): number {
  let n = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    const f = slotFormOfItem(item) || mainOfDayItem(item);
    const g = itemGenreSlugs(item)[0];
    if (f === form && (!genre || g === genre)) n += 1;
    else break;
  }
  return n;
}

export function cineRows(
  items: DayItem[],
  top3: ReadonlySet<string>,
  opts?: { origin?: GeoPos | null },
): DenseRow[] {
  const cine = dedupAgainstTop3(items.filter(isCinemaDayItem), top3);
  const origin = opts?.origin ?? null;
  if (origin) return densify(cine, { origin });
  return densify(displayShuffle(cine));
}

export function liveRows(
  items: DayItem[],
  top3: ReadonlySet<string>,
  opts?: { origin?: GeoPos | null },
): DenseRow[] {
  const live = dedupAgainstTop3(items.filter(isVivantDayItem), top3);
  const origin = opts?.origin ?? null;
  if (origin) return densify(live, { origin });
  return densify(displayShuffle(live));
}

/** Keep the 1+1+1 slot picks, then nearest-first when GPS is on. */
export function visibleTop3Nearest(
  items: DayItem[],
  origin: GeoPos | null | undefined,
): DayItem[] {
  const slots = visibleTop3Items(items);
  if (!origin) return slots;
  return sortItemsNearestFirst(slots, origin);
}

export function cineFirstPaint(mobile: boolean): number {
  return mobile ? HOME_CINE_MOBILE : HOME_CINE_DESKTOP;
}

export function capCineRows(rows: DenseRow[], mobile: boolean): DenseRow[] {
  return rows.slice(0, cineFirstPaint(mobile));
}

export function capLiveRows(rows: DenseRow[]): DenseRow[] {
  return rows.slice(0, LIVE_DISPLAY_CAP);
}

const FIRST_PERF_RE =
  /premi[eè]re|cr[eé]ation|ouverture|avant[- ]?premi[eè]re|premi[eè]re représentation/i;

function looksFirstPerformance(item: DayItem): boolean {
  const blob = [
    itemTitle(item),
    item.kind === 'programme' ? item.programme.notes || '' : '',
    item.kind === 'programme'
      ? item.programme.type_item || ''
      : item.evenement.statut || '',
  ].join(' ');
  return FIRST_PERF_RE.test(blob);
}

function uniqueDateKeys(items: DayItem[]): Set<string> {
  const dates = new Map<string, Set<string>>();
  for (const item of items) {
    const id = eventIdOf(item) || densifyGroupKey(item);
    if (!id) continue;
    if (!dates.has(id)) dates.set(id, new Set());
    dates.get(id)!.add(item.dayIso);
  }
  const unique = new Set<string>();
  for (const [id, days] of dates) {
    if (days.size === 1) unique.add(id);
  }
  return unique;
}

/**
 * Editorial strip: reuse nouveautés / unique-date / first-performance
 * signals already on the items. No new scoring.
 */
export function editorialRows(
  listItems: DayItem[],
  nouveautes: DayItem[],
  top3: ReadonlySet<string>,
  nouveauFilmIds: ReadonlySet<string>,
): DenseRow[] {
  const pool = dedupAgainstTop3(
    [...nouveautes, ...listItems.filter(isVivantDayItem), ...listItems],
    top3,
  );
  const uniqueDates = uniqueDateKeys(pool);
  const scored = pool.map((item, index) => {
    let w = 0;
    const fid = filmIdOfItem(item);
    if (fid && nouveauFilmIds.has(fid)) w += 4;
    if (looksFirstPerformance(item)) w += 3;
    const id = eventIdOf(item) || densifyGroupKey(item);
    if (id && uniqueDates.has(id) && isVivantDayItem(item)) w += 2;
    if (isVivantDayItem(item)) w += 1;
    return { item, w, index };
  });
  scored.sort((a, b) => b.w - a.w || a.index - b.index);

  const picked: DayItem[] = [];
  const seen = new Set<string>();
  const forms = new Set<string>();
  for (const row of scored) {
    if (row.w <= 0 && picked.length >= 3) continue;
    const key = densifyGroupKey(row.item);
    if (seen.has(key)) continue;
    const form = slotFormOfItem(row.item) || mainOfDayItem(row.item) || 'x';
    if (picked.length >= 3 && forms.has(form) && forms.size < 3) continue;
    seen.add(key);
    forms.add(form);
    picked.push(row.item);
    if (picked.length >= EDITORIAL_CAP) break;
  }
  if (picked.length === 0) {
    const diverse = pickDiverseUpcoming(dedupAgainstTop3(listItems, top3), 3);
    return densify(diverse);
  }
  return densify(picked);
}

function pickDiverseUpcoming(items: DayItem[], n: number): DayItem[] {
  const byForm = new Map<string, DayItem>();
  const rest: DayItem[] = [];
  for (const item of items) {
    const form = slotFormOfItem(item) || mainOfDayItem(item) || item.key;
    if (!byForm.has(form)) byForm.set(form, item);
    else rest.push(item);
  }
  const preferred = ['concert', 'theatre', 'musique', 'theatre_danse', 'cine', 'cinema'];
  const out: DayItem[] = [];
  for (const form of preferred) {
    const item = byForm.get(form);
    if (item) {
      out.push(item);
      byForm.delete(form);
    }
    if (out.length >= n) return out;
  }
  for (const item of byForm.values()) {
    out.push(item);
    if (out.length >= n) return out;
  }
  for (const item of rest) {
    out.push(item);
    if (out.length >= n) return out;
  }
  return out;
}

export function guestReasonLine(
  scope: TimeScopeId,
  commune: string | null,
): string {
  const city = (commune || 'Toulouse').trim() || 'Toulouse';
  if (scope === 'soir') return `Ce soir à ${city}`;
  if (scope === 'aujourdhui') return `Aujourd’hui à ${city}`;
  if (scope === 'weekend') return `Ce week-end à ${city}`;
  return `Populaire à ${city}`;
}

/**
 * Reco why-line only (Ton top 3 / Pour toi).
 * Logged-in: 16 locked moods, grammatical French, never a raw slug.
 * Guest: place/time line — never « parce que tu aimes ».
 * Catalogue cards must not call this.
 */
const RECO_WHY_FR: Record<TasteMood, string> = {
  rigolo: 'parce que tu aimes rire',
  tendre: 'parce que tu aimes le tendre',
  intense: 'parce que tu aimes l’intense',
  angoissant: 'parce que tu aimes l’ambiance angoissante',
  epique: 'parce que tu aimes l’épique',
  brutal: 'parce que tu aimes le brutal',
  festif: 'parce que tu aimes l’ambiance festive',
  cerveau: 'parce que tu aimes le cerveau',
  intimiste: 'parce que tu aimes l’intimiste',
  absurde: 'parce que tu aimes l’absurde',
  critique: 'parce que tu aimes l’esprit critique',
  sombre: 'parce que tu aimes le sombre',
  poetique: 'parce que tu aimes le poétique',
  dansant: 'parce que tu as envie de danser',
  contemplatif: 'parce que tu aimes l’ambiance contemplative',
  leger: 'parce que tu aimes le léger',
};

/** Locked-mood why-line, or null. Never interpolates a slug. */
export function recoWhyForMood(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  if (!isTasteMood(key)) return null;
  return RECO_WHY_FR[key as TasteMood] ?? null;
}

export function displayReasonForItem(
  item: DayItem,
  opts: {
    guest: boolean;
    tasteState: AccountTasteState | null;
    scope: TimeScopeId;
    commune: string | null;
  },
): string | null {
  if (opts.guest || !opts.tasteState) {
    return guestReasonLine(opts.scope, opts.commune);
  }
  const itemLocked = new Set(
    [...itemMoods(item), ...itemGenreSlugs(item)].filter(isTasteMood),
  );
  if (itemLocked.size === 0) return null;
  const chips = profileChips(opts.tasteState.profile, 16).filter(
    (c) => c.bucket === 'moods' && itemLocked.has(c.key),
  );
  const hit = chips[0];
  if (!hit) return null;
  return recoWhyForMood(hit.key);
}

const MOOD_HEX: Record<string, string> = {
  rigolo: '#d97706',
  intense: '#7c3a6e',
  tendre: '#c44a2f',
  cerveau: '#1e3a5f',
  sortie: '#0f766e',
};

export function moodFallbackHex(item: DayItem, categoryHex?: string): string {
  const moods = itemMoods(item);
  for (const m of moods) {
    if (MOOD_HEX[m]) return MOOD_HEX[m];
  }
  return categoryHex || '#e85d3b';
}

export function sharePrefill(item: DayItem, pageUrl: string): {
  title: string;
  text: string;
  url: string;
} {
  const title = itemTitle(item);
  const date = formatDateFr(item.dayIso || '');
  const venue = itemVenue(item);
  const bits = [title, date, venue].filter(Boolean);
  return {
    title,
    text: bits.join(' — '),
    url: pageUrl,
  };
}

export function deepLinkUrl(origin: string, itemKey: string): string {
  return `${origin}/?e=${encodeURIComponent(itemKey)}`;
}

export function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export { isCinemaDayItem, isVivantDayItem };
