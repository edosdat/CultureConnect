/**
 * Display-only helpers for the home sections.
 * No scoring, no CSV edits, no tag vocabulary changes.
 */

import type { DayItem } from './types';
import type { AccountTasteState } from './signals';
import {
  cinemaDisplayStem,
  densify,
  densifyGroupKey,
  visibleWorkKey,
  type DenseRow,
} from './densify';
import {
  filmIdOfItem,
  homePackOfItem,
  isCinemaDayItem,
  isEnfantsChipItem,
  isEnfantsDayItem,
  isExpoDayItem,
  isMusiqueDayItem,
  isTheatreDayItem,
  isVivantDayItem,
  mainOfDayItem,
  type HomePackId,
} from './nouveautesCine';
import { seanceTimeLabel } from './eventTimes';
import { formatDateFr, formatHeure, formatLieuAffiche } from './labels';
import { isEnfantsOnlyChip, type MainCategoryId } from './categories';
import { profileChips } from './pourToi';
import {
  hasPhraseSignal,
  isTasteMood,
  normalizePhrase,
  parsePhraseRules,
  tasteMoodsOf,
  type PhraseMood,
  type PhraseTags,
  type TasteMood,
} from './phraseTags';
import type { RecoSlotForm } from './reco';
import { fillEmptyCineSlot, slotFormOfItem } from './reco';
import { parseSearchChips, type SearchChipParse } from './parseSearchChips';
import { seanceDateIso, type TimeScopeId } from './timeScope';
import { sortItemsNearestFirst, type GeoPos } from './nearMe';

/** Living-led visual order for Top 3 (scoring order in reco.ts is unchanged). */
export const DISPLAY_SLOT_ORDER: RecoSlotForm[] = [
  'concert',
  'theatre',
  'cine',
];

/** Locked FR example chips — same axes as Enter / QUAND-QUOI / Ambiances. */
export const SEARCH_EXAMPLES = [
  { label: 'un truc intimiste ce WE', query: 'un truc intimiste ce WE' },
  { label: 'envie de rire', query: 'envie de rire' },
  { label: 'concert près du centre', query: 'concert près du centre' },
] as const;

/**
 * Examples under `#cc-search` are retired (redundant with the field).
 * Always false so home / boot chrome never mounts `SearchExamples`.
 */
export function searchExamplesVisible(_opts?: {
  selectedCategories?: readonly string[];
  query?: string;
  committedTitle?: string;
  timeScope?: TimeScopeId | null;
}): boolean {
  void _opts;
  return false;
}

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

/** Planning line: this séance’s Paris date + début–fin (never a later day’s clock). */
export function seanceWhen(item: DayItem, earliestHeure?: string): string {
  const date = formatDateFr(seanceDateIso(item) || item.dayIso || '');
  const time =
    seanceTimeLabel(item) || (earliestHeure ? formatHeure(earliestHeure) : '');
  return [date, time].filter(Boolean).join(' · ');
}

/** Short neutral hint — no example phrases (chips retired in #71). */
export const SEARCH_PLACEHOLDER = 'Rechercher un spectacle, un film, un lieu…';

/**
 * Extra existing chips for the 3 example taps.
 * Vivant QUOI for the intimiste WE line; Toulouse commune for centre.
 * No 17th mood, no GPS persist.
 */
export function searchExampleChipExtras(query: string): {
  categories: MainCategoryId[];
  commune: string | null;
} {
  const n = normalizePhrase(query);
  if (n === normalizePhrase('un truc intimiste ce WE')) {
    return { categories: ['theatre_danse', 'musique'], commune: null };
  }
  if (n === normalizePhrase('concert près du centre')) {
    return { categories: [], commune: 'Toulouse' };
  }
  return { categories: [], commune: null };
}

export type SearchSubmitIntent = {
  parsed: SearchChipParse;
  phraseTags: PhraseTags | null;
  commune: string | null;
  titleQuery: string;
};

/**
 * Enter / example tap → existing chips + locked Ambiances moods.
 * Mood leftover is not a title `q`.
 */
export function resolveSearchSubmit(
  raw: string,
  now = new Date(),
): SearchSubmitIntent {
  const parsed = parseSearchChips(raw, now);
  const extra = searchExampleChipExtras(raw);
  const tags = parsePhraseRules(raw, now);
  const moods = tasteMoodsOf(tags.moods) as PhraseMood[];
  const categories =
    extra.categories.length > 0 ? extra.categories : parsed.categories;
  const merged: SearchChipParse = { ...parsed, categories };
  const phraseTags: PhraseTags | null =
    moods.length > 0 || tags.form
      ? {
          moods,
          genres: [],
          themes: [],
          entities: [],
          source: 'rules',
          ...(tags.form ? { form: tags.form } : {}),
        }
      : null;
  const usePhrase = Boolean(phraseTags && hasPhraseSignal(phraseTags));
  return {
    parsed: merged,
    phraseTags: usePhrase ? phraseTags : null,
    commune: extra.commune,
    titleQuery: usePhrase ? '' : parsed.titleQuery,
  };
}

export function searchExampleIsVivant(query: string, now = new Date()): boolean {
  const intent = resolveSearchSubmit(query, now);
  if (intent.parsed.categories.some((c) => c === 'theatre_danse' || c === 'musique')) {
    return true;
  }
  const form = intent.phraseTags?.form;
  return form === 'theatre' || form === 'concert';
}

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

/** Distinct reco buckets present (cine / theatre / concert). */
export function recoSlotsOf(items: DayItem[]): Set<RecoSlotForm> {
  const slots = new Set<RecoSlotForm>();
  for (const item of items) {
    const slot = slotFormOfItem(item);
    if (slot) slots.add(slot);
  }
  return slots;
}

/**
 * Stale `cc.profileReco.v1`: fewer than 3 buckets while the densified
 * carousel of the same scope still has cine.
 */
export function shouldInvalidateProfileRecoCache(
  cached: DayItem[],
  densifiedCineCount: number,
): boolean {
  if (densifiedCineCount <= 0) return false;
  return recoSlotsOf(cached).size < 3;
}

/**
 * If reco is missing cine and the upcoming pool has ≥1 film, fill that slot.
 */
export function fillEmptyCineFromPool(
  recoItems: DayItem[],
  filmPool: DayItem[],
): DayItem[] {
  if (recoSlotsOf(recoItems).has('cine')) return recoItems;
  const films = filmPool.filter((item) => slotFormOfItem(item) === 'cine');
  if (films.length === 0) return recoItems;
  return fillEmptyCineSlot(recoItems, films);
}

/** 0 → hide; 1 → full width; 2 → 50/50; 3 → current 3-up. Stretch so rail thumbs fill the row. */
export function top3GridClass(count: number): string {
  if (count <= 1) return 'grid w-full grid-cols-1 items-stretch gap-3';
  if (count === 2) return 'grid w-full grid-cols-1 items-stretch gap-3 sm:grid-cols-2';
  return 'grid w-full grid-cols-1 items-stretch gap-3 lg:grid-cols-3';
}

/** Where the card is painted. Top 3 never shows pitch, even on compact. */
export type SeanceCardPitchSource = 'top3' | 'catalogue';

/**
 * Pitch / synopsis on SeanceCard.
 * Home Top 3 (`source: 'top3'` — rail or compact scan) is image, title,
 * short meta, CTA only. Never a short, long, or 2-line-clamped description.
 * The `rail` variant is also scan-only. Catalogue `default` / `live` /
 * `compact` cards and fiches keep copy.
 */
export function seanceCardShowsPitch(
  variant: 'default' | 'rail' | 'live' | 'compact',
  source: SeanceCardPitchSource = 'catalogue',
): boolean {
  if (source === 'top3') return false;
  return variant !== 'rail';
}

/**
 * Reserved list-wait chrome above Top 3 (LAYOUT_JUMP at ~380px).
 * 32px — list-wait dots (12px) + stack gap, so the slot does not collapse.
 */
export const HOME_LIST_WAIT_SLOT_CLASS = 'h-8';

export type Top3SectionOpts = {
  ready: boolean;
  wiped: boolean;
  cardCount: number;
  selectedCategories?: readonly string[];
  committedTitle?: string;
  phraseActive?: boolean;
};

export type Top3PaintMode = 'hidden' | 'skeleton' | 'cards';

/**
 * Home Top 3 row.
 * Hide when a QUOI chip or an omnibox commit (title leftover / phrase) is on.
 * Date chips, commune, and salle alone keep the section (if cards).
 * While reco is not ready, keep the shell so first paint is not blank.
 */
export function shouldShowTop3Section(opts: Top3SectionOpts): boolean {
  return top3PaintMode(opts) !== 'hidden';
}

/**
 * First paint: skeleton as soon as the section is allowed.
 * Real cards only after recoReady. Never wait on reco to show the shell.
 */
export function top3PaintMode(opts: Top3SectionOpts): Top3PaintMode {
  if (opts.wiped) return 'hidden';
  if ((opts.selectedCategories?.length ?? 0) > 0) return 'hidden';
  if ((opts.committedTitle || '').trim()) return 'hidden';
  if (opts.phraseActive) return 'hidden';
  if (!opts.ready) return 'skeleton';
  return opts.cardCount > 0 ? 'cards' : 'hidden';
}

/** H2 for the reco row. Matches visible card count; 0 is hidden by the caller. */
export function top3Heading(
  cardCount: number,
  signedIn = false,
): string {
  const n = cardCount === 1 || cardCount === 2 || cardCount === 3 ? cardCount : 3;
  return signedIn ? `Mon top ${n} du moment` : `Le top ${n} du moment`;
}

export function eventIdOf(item: DayItem): string {
  if (item.kind === 'programme') return item.programme.event_id || '';
  return item.evenement.event_id || '';
}

export function identityKeysOf(item: DayItem): string[] {
  const keys = [item.key, densifyGroupKey(item), visibleWorkKey(item)];
  const fid = filmIdOfItem(item);
  if (fid) keys.push(`film:${fid}`);
  const eid = eventIdOf(item);
  if (eid) keys.push(`ev:${eid}`);
  const title = itemTitle(item).trim().toLocaleLowerCase('fr');
  if (title) keys.push(`t:${title}`);
  const stem = cinemaDisplayStem(item);
  if (stem) keys.push(`stem:${stem}`);
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

export function theatreRows(
  items: DayItem[],
  top3: ReadonlySet<string>,
  opts?: { origin?: GeoPos | null },
): DenseRow[] {
  const theatre = dedupAgainstTop3(items.filter(isTheatreDayItem), top3);
  const origin = opts?.origin ?? null;
  if (origin) return densify(theatre, { origin });
  return densify(displayShuffle(theatre));
}

export function musiqueRows(
  items: DayItem[],
  top3: ReadonlySet<string>,
  opts?: { origin?: GeoPos | null },
): DenseRow[] {
  const musique = dedupAgainstTop3(items.filter(isMusiqueDayItem), top3);
  const origin = opts?.origin ?? null;
  if (origin) return densify(musique, { origin });
  return densify(displayShuffle(musique));
}

export function enfantsRows(
  items: DayItem[],
  top3: ReadonlySet<string>,
  opts?: { origin?: GeoPos | null; includeCrossCatKids?: boolean },
): DenseRow[] {
  const pred = opts?.includeCrossCatKids ? isEnfantsChipItem : isEnfantsDayItem;
  const enfants = dedupAgainstTop3(items.filter(pred), top3);
  const origin = opts?.origin ?? null;
  if (origin) return densify(enfants, { origin });
  return densify(displayShuffle(enfants));
}

export function expoRows(
  items: DayItem[],
  top3: ReadonlySet<string>,
  opts?: { origin?: GeoPos | null },
): DenseRow[] {
  const expos = dedupAgainstTop3(items.filter(isExpoDayItem), top3);
  const origin = opts?.origin ?? null;
  if (origin) return densify(expos, { origin });
  return densify(displayShuffle(expos));
}

/** @deprecated Home no longer collapses living arts into one strip. */
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

/**
 * QUOI / search home chips hide catalogue sections exclusively.
 * Only Cinéma / Théâtre / Musique count as home chips.
 * Extra chips (festival, expo) filter the item pool — they do not hide packs.
 * Enfants-only is a kids view: Enfants carousel (+ filtered kids grid),
 * not an awkward Sorties-pack hide. Combined extra chips stay open (#49).
 * No home chip → all five. Cats never apply to Top 3.
 */
export function homeSectionsVisible(cats: readonly string[]): {
  cine: boolean;
  theatre: boolean;
  musique: boolean;
  enfants: boolean;
  expo: boolean;
} {
  const home = cats.filter(
    (c) => c === 'cinema' || c === 'theatre_danse' || c === 'musique',
  );
  if (home.length === 0) {
    if (isEnfantsOnlyChip(cats)) {
      return {
        cine: false,
        theatre: false,
        musique: false,
        enfants: true,
        expo: false,
      };
    }
    return {
      cine: true,
      theatre: true,
      musique: true,
      enfants: true,
      expo: true,
    };
  }
  return {
    cine: home.includes('cinema'),
    theatre: home.includes('theatre_danse'),
    musique: home.includes('musique'),
    enfants: false,
    expo: false,
  };
}

/**
 * Look up a card by agenda key (`p:…` / `e:…`) across in-memory pools.
 * Pass the full Top 3 / reco catalogue first — never only the QUOI-filtered
 * grid (`applyList` / cine rows). Same key as `?e=` / `/api/agenda?id=`.
 */
export function findDayItemByKey(
  key: string | null | undefined,
  ...pools: Array<readonly DayItem[] | undefined | null>
): DayItem | null {
  if (!key) return null;
  for (const pool of pools) {
    if (!pool?.length) continue;
    const found = pool.find((item) => item.key === key);
    if (found) return found;
  }
  return null;
}

export type HomeCardOpen =
  | { mode: 'fiche'; key: string }
  | { mode: 'pack'; pack: HomePackId; key: string };

/**
 * Top 3 always opens the event fiche (dialog), even when a QUOI chip has
 * hidden that pack's grid. Catalogue / leftover cards still focus their pack.
 */
export function resolveHomeCardOpen(
  key: string,
  found: DayItem | null,
  source: 'top3' | 'grid' = 'grid',
): HomeCardOpen {
  if (source === 'top3') return { mode: 'fiche', key };
  const pack = found ? homePackOfItem(found) : null;
  if (pack) return { mode: 'pack', pack, key };
  return { mode: 'fiche', key };
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
 * Reco why-line only (Top 3 / Pour toi).
 * Logged-in: 16 locked moods, grammatical French, display labels
 * (rigolo → rire, critique → satirique). Never a raw slug.
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
  critique: 'parce que tu aimes le satirique',
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

export {
  isCinemaDayItem,
  isEnfantsChipItem,
  isEnfantsDayItem,
  isExpoDayItem,
  isMusiqueDayItem,
  isTheatreDayItem,
  isVivantDayItem,
};
