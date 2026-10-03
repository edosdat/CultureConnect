import 'server-only';

import { unstable_cache } from 'next/cache';
import { headers } from 'next/headers';
import type {
  Artiste,
  CategoryBucket,
  DayItem,
  Evenement,
  EventWithDetails,
  Lieu,
  ProgrammeItem,
  ProgrammeWithContext,
} from './types';
import { loadCultureData } from './data';
import { catsAllowCinemaPack, mainFromForm } from './categories';
import { filterItemsByCommune } from './commune';
import {
  cinemaDisplayStem,
  cinemaStemsCompatible,
  cinemaTitleStem,
  dedupeNonCinemaSameLieuHoraire,
  densifiedCardCount,
  isLivingArtsRelatedSeance,
  takeUniqueWorkItems,
} from './densify';
import { sectionSlotTotals } from './sectionBadge';
import {
  countItemsByDay,
  itemsForDateRange,
  itemsForDay,
} from './events';
import { genreSlugsFromItems } from './genreChipMatch';
import {
  CINE_LIVING_OTHER_DAY_HORIZON,
  collectCinemaLivingCandidates,
} from './filmVivantComplements';
import { withConcertArtistPress } from './pressCitation';
import {
  filmIdOfItem,
  isCinemaDayItem,
  isEnfantsChipItem,
  isEnfantsDayItem,
  isExpoDayItem,
  isMusiqueDayItem,
  isTheatreDayItem,
  isVivantDayItem,
  nouveauFilmIds,
  nouveautesCine,
} from './nouveautesCine';
import { itemSearchBlob, matchesNormalizedHaystack } from './searchText';
import {
  entityAliases,
  normalizePhrase,
  themeAliases,
} from './phraseTags';
import {
  detailDayItem,
  HOME_FIRST_PAINT_CINE_CAP,
  HOME_FIRST_PAINT_THEATRE_CAP,
  HOME_PACK_HERO_COPY_CAP,
  HOME_PACK_WIRE_CAP,
  relatedSeanceDayItem,
  slimDayItem,
  slimLieu,
  withTasteTags,
  type AgendaDetailResponse,
  type AgendaListResponse,
} from './slim';
import {
  addDaysIso,
  bootTimeScope,
  filterSeancesForDisplay,
  hideSeancesBeforeToday,
  parisParts,
  resolveScopeRange,
  seanceDateIso,
  upcomingRange,
  type TimeScopeId,
} from './timeScope';
import {
  parisIsoWeekKey,
  RELANCE_DIGEST_TIMEZONE,
  RELANCE_DIGEST_WINDOWS,
  relanceDigestRange,
  type RelanceDigestWindowId,
} from './mesRecosWeek';
import {
  fillEmptyCineSlot,
  itemBlockedByWorkKeys,
  mergeSlotPicks,
  pickSoonestPerSlot,
  profileHasChipWeight,
  recommendForProfile,
  resolvedFormOfItem,
  slotFormOfItem,
  workIdOf,
} from './reco';
import type { TasteEntry, TasteProfile } from './signals';
import { normalizeDeepLinkId } from './deepLink';
import { AGENDA_VENUE_PAGE_MAX, agendaListCacheKeyParts } from './agendaParams';
import { applyAvecEnfantsMode, seanceMatchesAvecEnfantsMode } from './enfantsMode';
import { createDayMemo } from './dayMemo';
import {
  GUEST_BOOT_RECO_SSR_BUDGET_MS,
  guestBootPlace,
  guestBootRecoFillDelayMs,
  isGuestBootRecoRequest,
  requestBypassesDataCache,
  withDeadline,
  type GuestBootPlace,
} from './guestBootReco';

export const AGENDA_PAGE_MAX = 50;
/** Single calendar day: show the day's matching séances, not the upcoming-50 cap. */
export const AGENDA_DAY_PAGE_MAX = 150;

export type AgendaQueryInput = {
  scope: TimeScopeId;
  commune: string | null;
  q: string;
  cats: string[];
  genres: string[];
  lieuId: string | null;
  selectedDate: string | null;
  year: number;
  month: number;
  limit?: number;
  offset?: number;
  includeCounts?: boolean;
  /** SSR / first paint only: venues + legend + communes. */
  includeListMeta?: boolean;
  /** Phrase tags — AND with scope/commune. Do not title-search q when set. */
  form?: string | null;
  moods?: string[];
  tagGenres?: string[];
  themes?: string[];
  entities?: string[];
  date_from?: string | null;
  date_to?: string | null;
  /** Top 3: date scope window, never cat chips. tous = entire upcoming catalogue. */
  recoUpcoming?: boolean;
  /** Moods/genres/themes only. Never email / signals / cats. */
  recoProfile?: TasteProfile | null;
  /**
   * P3 « pas pour moi » œuvre keys (`f:` / `e:` / `p:` / work id).
   * Dropped from the Top 3 pool for this request.
   */
  excludeWorkIds?: readonly string[];
  /**
   * Relance only. Replaces the scope range with the Paris-week
   * Sat–Sun or Mon–Fri window. Scoring stays `scope=semaine`
   * (`recommendForProfile`, cap 3). Ignored unless `recoUpcoming`.
   */
  digestWindow?: RelanceDigestWindowId;
  /**
   * Mode « Avec les enfants ». Request flag, not a `cats` value.
   * Intersects with category chips and filters each séance.
   */
  avecEnfants?: boolean;
};

export type { AgendaListResponse, AgendaDetailResponse } from './slim';

function parseTasteBucket(raw: unknown): Record<string, TasteEntry> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, TasteEntry> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !val || typeof val !== 'object') continue;
    const e = val as { weight?: unknown; pct?: unknown };
    const weight = Number(e.weight);
    const pct = Number(e.pct);
    if (!Number.isFinite(weight) && !Number.isFinite(pct)) continue;
    out[key] = {
      weight: Number.isFinite(weight) ? weight : 0,
      pct: Number.isFinite(pct) ? pct : 0,
    };
  }
  return out;
}

/** Compact profile for reco POST: moods / genres / themes only. */
export function parseRecoProfile(raw: unknown): TasteProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { moods?: unknown; genres?: unknown; themes?: unknown };
  const profile: TasteProfile = {
    cats: {},
    moods: parseTasteBucket(o.moods),
    genres: parseTasteBucket(o.genres),
    themes: parseTasteBucket(o.themes),
    communes: {},
  };
  return profileHasChipWeight(profile) ? profile : null;
}

const EXCLUDE_WORK_ID_MAX = 80;
const EXCLUDE_WORK_ID_LEN = 160;

/** Client-supplied œuvre keys. Membership check only — never a query. */
export function parseExcludeWorkIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!id || id.length > EXCLUDE_WORK_ID_LEN || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= EXCLUDE_WORK_ID_MAX) break;
  }
  return out;
}

function csvRowCounts(): Pick<AgendaListResponse, 'csvEvents' | 'csvProgramme'> {
  const data = loadCultureData();
  return {
    csvEvents: data.evenements.length,
    csvProgramme: data.programme.length,
  };
}

function emptyRecoExtras(): Pick<
  AgendaListResponse,
  | 'nouveautes'
  | 'communes'
  | 'venues'
  | 'genreSlugs'
  | 'genresLegend'
  | 'nouveauFilmIds'
  | 'vivantItems'
  | 'vivantTotal'
  | 'cineTotal'
  | 'theatreTotal'
  | 'musiqueTotal'
  | 'enfantsTotal'
  | 'expoTotal'
  | 'csvEvents'
  | 'csvProgramme'
> {
  return {
    nouveautes: [],
    communes: [],
    venues: [],
    genreSlugs: [],
    genresLegend: [],
    nouveauFilmIds: [],
    vivantItems: [],
    vivantTotal: 0,
    cineTotal: 0,
    theatreTotal: 0,
    musiqueTotal: 0,
    enfantsTotal: 0,
    expoTotal: 0,
    ...csvRowCounts(),
  };
}


function normalizeCommune(c: string | null | undefined): string {
  return (c || '').trim().toLocaleLowerCase('fr');
}

function clockHHMM(raw: string | undefined | null): string {
  const h = (raw || '').trim();
  if (!/^\d{1,2}:\d{2}/.test(h)) return '';
  const slice = h.slice(0, 5);
  return slice.length === 4 ? `0${slice}` : slice;
}

function itemHeureDebut(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      clockHHMM(item.programme.heure_debut) ||
      clockHHMM(item.evenement?.heure_debut)
    );
  }
  return clockHHMM(item.evenement.heure_debut);
}

/** Ce soir: clock >= 19:00; period cards without a clock stay out. */
export function startsAtOrAfter19(item: DayItem): boolean {
  const h = itemHeureDebut(item);
  return Boolean(h) && h >= '19:00';
}

/** Reco aujourdhui/semaine: still upcoming in Paris. Missing clock stays. */
function isStillUpcomingSeance(item: DayItem, now: Date): boolean {
  const paris = parisParts(now);
  const date = (item.dayIso || '').trim();
  if (date > paris.iso) return true;
  if (date !== paris.iso) return false;
  const h = itemHeureDebut(item);
  if (!h) return true;
  const nowHHMM =
    clockHHMM(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(now),
    ) || `${String(paris.hour).padStart(2, '0')}:00`;
  return h >= nowHHMM;
}

function filmIdOfDayItem(item: DayItem): string {
  if (item.kind !== 'programme') return '';
  return (item.programme.film_id || '').trim();
}

/**
 * Ce soir: clock >= 19:00. Cinema is one row per séance — a film with 14:00
 * and 20:00 keeps the 20:00 row. If a film-day was collapsed onto the earliest
 * heure, look up a raw séance >= 19:00 so the cine slot is not dropped.
 */
function filterSoirItems(
  items: DayItem[],
  programme: ProgrammeWithContext[],
): DayItem[] {
  const kept = items.filter(startsAtOrAfter19);
  const seenFilmDay = new Set<string>();
  for (const item of kept) {
    const fid = filmIdOfDayItem(item);
    if (fid) seenFilmDay.add(`${item.dayIso}:${fid}`);
  }

  for (const item of items) {
    if (startsAtOrAfter19(item)) continue;
    const fid = filmIdOfDayItem(item);
    if (!fid) continue;
    const filmDay = `${item.dayIso}:${fid}`;
    if (seenFilmDay.has(filmDay)) continue;

    const fromPool = items
      .filter(
        (it) =>
          filmIdOfDayItem(it) === fid &&
          it.dayIso === item.dayIso &&
          startsAtOrAfter19(it),
      )
      .sort((a, b) => itemHeureDebut(a).localeCompare(itemHeureDebut(b)))[0];
    if (fromPool) {
      kept.push(fromPool);
      seenFilmDay.add(filmDay);
      continue;
    }

    const eveningProg = programme
      .filter(
        (row) =>
          (row.programme.film_id || '').trim() === fid &&
          row.programme.date === item.dayIso &&
          clockHHMM(row.programme.heure_debut) >= '19:00',
      )
      .sort((a, b) =>
        clockHHMM(a.programme.heure_debut).localeCompare(
          clockHHMM(b.programme.heure_debut),
        ),
      )[0];
    if (!eveningProg) continue;
    kept.push({
      kind: 'programme',
      key: `p:${eveningProg.programme.programme_id}`,
      dayIso: item.dayIso,
      programme: eveningProg.programme,
      evenement: eveningProg.evenement,
      lieu: eveningProg.lieu,
    });
    seenFilmDay.add(filmDay);
  }
  return kept;
}


function collectCommunes(lieux: Iterable<Lieu>): string[] {
  const set = new Set<string>();
  for (const lieu of lieux) {
    const c = (lieu.commune || '').trim();
    if (c) set.add(c);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}

function lieuxByIdFromData(): Map<string, Lieu> {
  return loadCultureData().lieuxById;
}

function resolveLieuIds(
  commune: string | null,
  lieuId: string | null,
  searching: boolean,
): string[] {
  const byId = lieuxByIdFromData();
  if (searching) {
    if (lieuId) return [lieuId];
    return [];
  }
  const communeIds = (): string[] => {
    if (!commune) return [];
    const target = normalizeCommune(commune);
    const ids: string[] = [];
    for (const lieu of byId.values()) {
      if (normalizeCommune(lieu.commune) === target) ids.push(lieu.lieu_id);
    }
    return ids.length > 0 ? ids : ['__no_match__'];
  };
  if (lieuId) {
    if (!commune) return [lieuId];
    const lieu = byId.get(lieuId);
    if (lieu && normalizeCommune(lieu.commune) === normalizeCommune(commune)) {
      return [lieuId];
    }
    return communeIds();
  }
  if (commune) return communeIds();
  return [];
}

function dataMaxIso(): string {
  return loadCultureData().maxIso || '';
}


function splitTagField(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return raw
    .split(/[|,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function tagTokens(slug: string): string[] {
  return slug.toLowerCase().split(/[|_]+/).filter(Boolean);
}

function programmeOf(item: DayItem): ProgrammeItem | null {
  return item.kind === 'programme' ? item.programme : null;
}

function evenementOf(item: DayItem): Evenement | null {
  return item.evenement ?? null;
}

function formOfItem(item: DayItem): string {
  return resolvedFormOfItem(item);
}

function moodsOfItem(item: DayItem): string[] {
  const p = programmeOf(item);
  const ev = evenementOf(item);
  const fromP = splitTagField(p?.moods);
  if (fromP.length) return fromP;
  return splitTagField(ev?.moods);
}

function moodSourceOfItem(item: DayItem): string {
  const p = programmeOf(item);
  const ev = evenementOf(item);
  return (p?.mood_source || ev?.mood_source || '').toString().trim().toLowerCase();
}

function isEmptyMoodRow(item: DayItem): boolean {
  if (moodsOfItem(item).length === 0) return true;
  return moodSourceOfItem(item) === 'vide';
}

function genresHaystack(item: DayItem): string[] {
  const p = programmeOf(item);
  const ev = evenementOf(item);
  const hay: string[] = [];
  hay.push(...splitTagField(p?.genres_mood));
  hay.push(...splitTagField(ev?.genres_mood));
  const catGenre = ((p?.genre || ev?.genre || '') as string).trim().toLowerCase();
  if (catGenre) hay.push(catGenre);
  return hay;
}

function slugMatchesHay(query: string, hay: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  for (const h of hay) {
    if (h === q) return true;
    const tokens = tagTokens(h);
    if (tokens.includes(q)) return true;
  }
  return false;
}

const ANIMATION_SLUGS = new Set(['animation', 'animation_jeune_public']);
function genresOverlap(query: string[], item: DayItem): boolean {
  if (query.length === 0) return true;
  const hay = genresHaystack(item).map((h) => h.trim().toLowerCase());
  const animQ = query.some((q) => ANIMATION_SLUGS.has(q));
  const other = query.filter((q) => !ANIMATION_SLUGS.has(q));
  if (animQ && hay.some((h) => ANIMATION_SLUGS.has(h))) return true;
  if (other.length) return other.some((q) => slugMatchesHay(q, hay));
  if (animQ) return false;
  return true;
}

function moodsOverlap(query: string[], item: DayItem): boolean {
  if (query.length === 0) return true;
  const have = new Set(moodsOfItem(item));
  return query.some((m) => have.has(m.toLowerCase()));
}

function formMatches(query: string, item: DayItem): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return formOfItem(item) === q;
}

function itemThemeHay(item: DayItem): string {
  const p = programmeOf(item);
  const ev = evenementOf(item);
  const parts: string[] = [];
  if (p) {
    parts.push(
      p.nom_item,
      p.notes,
      p.description_item || '',
      p.genre,
      p.genres_mood || '',
      p.themes || '',
      p.entities || '',
    );
  }
  if (ev) {
    parts.push(
      ev.titre,
      ev.description_courte || '',
      ev.description_longue || '',
      ev.casting || '',
      ev.tags || '',
      ev.genre,
      ev.genres_mood || '',
      ev.themes || '',
      ev.entities || '',
      ev.categorie,
    );
  }
  return normalizePhrase(parts.filter(Boolean).join(' '));
}

function themesOverlap(query: string[], item: DayItem): boolean {
  if (query.length === 0) return true;
  const hay = itemThemeHay(item);
  const hidden = [
    ...splitTagField(programmeOf(item)?.genres_mood),
    ...splitTagField(evenementOf(item)?.genres_mood),
    ...splitTagField(evenementOf(item)?.tags),
    ...splitTagField(programmeOf(item)?.genre),
    ...splitTagField(evenementOf(item)?.genre),
    ...splitTagField(programmeOf(item)?.themes),
    ...splitTagField(evenementOf(item)?.themes),
    ...splitTagField(programmeOf(item)?.entities),
    ...splitTagField(evenementOf(item)?.entities),
  ];
  return query.some((slug) => {
    const aliases = themeAliases(slug);
    if (aliases.some((a) => hidden.includes(a))) return true;
    return aliases.some((a) => {
      if (!a) return false;
      const re = new RegExp(`(?:^|\\s)${a.replace(/\\s+/g, '\\s+')}(?:\\s|$)`);
      return re.test(hay);
    });
  });
}

function entitiesOverlap(query: string[], item: DayItem): boolean {
  if (query.length === 0) return true;
  const hay = itemThemeHay(item);
  return query.some((canon) =>
    entityAliases(canon).some((alias) => {
      if (!alias) return false;
      const re = new RegExp(
        `(?:^|\\s)${alias.replace(/\\s+/g, '\\s+')}(?:\\s|$)`,
      );
      return re.test(hay);
    }),
  );
}

export function itemMatchesPhraseTags(
  item: DayItem,
  query: {
    form?: string | null;
    moods?: string[];
    tagGenres?: string[];
    themes?: string[];
    entities?: string[];
    date_from?: string | null;
    date_to?: string | null;
  },
): boolean {
  const form = (query.form || '').trim();
  const moods = (query.moods || []).map((m) => m.trim().toLowerCase()).filter(Boolean);
  const genres = (query.tagGenres || []).map((g) => g.trim().toLowerCase()).filter(Boolean);
  const themes = (query.themes || []).map((g) => g.trim().toLowerCase()).filter(Boolean);
  const entities = (query.entities || []).map((g) => g.trim().toLowerCase()).filter(Boolean);
  const from = (query.date_from || '').trim();
  const to = (query.date_to || '').trim();
  const hasForm = Boolean(form);
  const hasMoods = moods.length > 0;
  const hasGenres = genres.length > 0;
  const hasThemes = themes.length > 0;
  const hasEntities = entities.length > 0;
  const hasDates = Boolean(from || to);
  if (!hasForm && !hasMoods && !hasGenres && !hasThemes && !hasEntities && !hasDates)
    return true;

  if (hasDates) {
    const d = (item.dayIso || '').trim();
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
  }
  if (hasForm && !formMatches(form, item)) return false;
  if (hasThemes && !themesOverlap(themes, item)) return false;
  if (hasEntities && !entitiesOverlap(entities, item)) return false;

  const moodOnly = hasMoods && !hasForm && !hasGenres && !hasThemes && !hasEntities;
  if (moodOnly) {
    if (isEmptyMoodRow(item)) return false;
    return moodsOverlap(moods, item);
  }

  const moodAndGenre = hasMoods && hasGenres && !hasThemes && !hasEntities;
  if (moodAndGenre) {
    if (moodsOverlap(moods, item)) return true;
    return isEmptyMoodRow(item) && genresOverlap(genres, item);
  }

  if (hasMoods && !moodsOverlap(moods, item)) return false;
  if (hasGenres && !genresOverlap(genres, item)) return false;
  return true;
}

function hasPhraseFilters(input: AgendaQueryInput): boolean {
  return Boolean(
    (input.form && input.form.trim()) ||
      (input.moods && input.moods.length > 0) ||
      (input.tagGenres && input.tagGenres.length > 0) ||
      (input.themes && input.themes.length > 0) ||
      (input.entities && input.entities.length > 0) ||
      (input.date_from && input.date_from.trim()) ||
      (input.date_to && input.date_to.trim()),
  );
}

function emptyBucket(): CategoryBucket {
  return { programme: [], events: [] };
}

/** Reco keeps cats=[] — never index-filter the top 3 pool. */
function indexMainsForQuery(
  reco: boolean,
  cats: string[],
  form: string | null | undefined,
): string[] {
  if (reco) return [];
  if (cats.length > 0) return cats;
  const main = mainFromForm(form);
  return main ? [main] : [];
}

function poolForMains(mains: string[]): CategoryBucket {
  const data = loadCultureData();
  if (mains.length === 0) {
    return {
      programme: data.programmeWithContext,
      events: data.events,
    };
  }
  if (mains.length === 1) {
    return data.byMain[mains[0]!] ?? emptyBucket();
  }
  const programme: ProgrammeWithContext[] = [];
  const events: EventWithDetails[] = [];
  const seenP = new Set<string>();
  const seenE = new Set<string>();
  for (const main of mains) {
    const bucket = data.byMain[main];
    if (!bucket) continue;
    for (const p of bucket.programme) {
      const id = p.programme.programme_id;
      if (seenP.has(id)) continue;
      seenP.add(id);
      programme.push(p);
    }
    for (const ev of bucket.events) {
      if (seenE.has(ev.event_id)) continue;
      seenE.add(ev.event_id);
      events.push(ev);
    }
  }
  return { programme, events };
}

function listForRange(
  input: AgendaQueryInput,
  now: Date,
): { items: DayItem[]; searching: boolean; rangeDays: string[] } {
  const data = loadCultureData();
  const paris = parisParts(now);
  const reco = Boolean(input.recoUpcoming);
  const phrase = !reco && hasPhraseFilters(input);
  const qText = reco ? '' : input.q;
  const cats = reco ? [] : input.cats;
  const genres = reco ? [] : input.genres;
  const lieuId = reco ? null : input.lieuId;
  const searching = !phrase && qText.trim().length > 0;
  const scopeRange = resolveScopeRange(input.scope, input.selectedDate, now, {
    year: input.year,
    month: input.month,
  });
  const phraseFrom = reco ? '' : (input.date_from || '').trim();
  const phraseTo = reco ? '' : (input.date_to || '').trim();
  // Title search still honors an active date chip (Ce soir / samedi / …).
  // Only `tous` opens the full upcoming window.
  let range =
    input.scope === 'tous'
      ? upcomingRange(paris.iso, dataMaxIso())
      : scopeRange;
  if (reco && input.digestWindow) {
    // Relance slices: civil Sat–Sun / Mon–Fri of this Paris week.
    // Chip `weekend` is a different range (Friday joins when today is Friday).
    range = relanceDigestRange(input.digestWindow, now);
  }
  if (!searching && (phraseFrom || phraseTo)) {
    const start =
      phraseFrom && phraseFrom > range.startIso ? phraseFrom : range.startIso;
    const end = phraseTo && phraseTo < range.endIso ? phraseTo : range.endIso;
    if (start > end) {
      return { items: [], searching: false, rangeDays: [] };
    }
    range = {
      startIso: start,
      endIso: end,
      days: range.days.filter((d) => d >= start && d <= end),
    };
  }
  const lieuIds = resolveLieuIds(input.commune, lieuId, searching);
  if (!searching) {
    range = {
      ...range,
      days: range.days.filter((d) => d >= paris.iso),
    };
  }

  const indexMains = indexMainsForQuery(reco, cats, input.form);
  const useIndex = indexMains.length > 0;
  const pool = useIndex
    ? poolForMains(indexMains)
    : { programme: data.programmeWithContext, events: data.events };

  let items: DayItem[];
  if (searching) {
    items = itemsForDateRange(
      pool.programme,
      pool.events,
      range.startIso,
      range.endIso,
      cats,
      lieuIds,
      genres,
    );
    const q = qText.trim();
    if (q) {
      const artisteNameById = new Map(
        data.artistes.map((a) => [a.artiste_id, a.nom]),
      );
      const filmTitleById = new Map(data.films.map((f) => [f.film_id, f.titre]));
      items = items.filter((item) =>
        matchesNormalizedHaystack(
          itemSearchBlob(
            item,
            data.genresLegend,
            artisteNameById,
            filmTitleById,
          ),
          q,
        ),
      );
    }
  } else {
    // One pass on the (possibly pre-indexed) pool. No per-day full-catalogue scan.
    const excludeLong =
      reco ||
      input.scope === 'tous' ||
      input.scope === 'aujourdhui' ||
      input.scope === 'soir' ||
      input.scope === 'weekend' ||
      input.scope === 'semaine';
    items = itemsForDateRange(
      pool.programme,
      pool.events,
      range.startIso,
      range.endIso,
      cats,
      lieuIds,
      genres,
      excludeLong,
    );
  }
  if (input.scope === 'soir') {
    items = filterSoirItems(items, pool.programme);
  }

  if (phrase) {
    items = items.filter((item) =>
      itemMatchesPhraseTags(item, {
        form: input.form,
        moods: input.moods,
        tagGenres: input.tagGenres,
        themes: input.themes,
        entities: input.entities,
        date_from: input.date_from,
        date_to: input.date_to,
      }),
    );
  }

  items = hideSeancesBeforeToday(items, paris.iso);
  if (input.avecEnfants) {
    items = applyAvecEnfantsMode(items);
  }
  return { items, searching, rangeDays: range.days };
}

/** Unique slim lieux from the given items. Optionally keeps a selected id. */
function venuesFromWindow(items: DayItem[], selectedLieuId: string | null): Lieu[] {
  const map = new Map<string, Lieu>();
  for (const item of items) {
    const slim = slimLieu(item.lieu);
    if (slim?.lieu_id) map.set(slim.lieu_id, slim);
  }
  if (selectedLieuId && !map.has(selectedLieuId)) {
    const extra = slimLieu(lieuxByIdFromData().get(selectedLieuId));
    if (extra) map.set(selectedLieuId, extra);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.nom.localeCompare(b.nom, 'fr'),
  );
}

/**
 * Salle menu: every lieu with an upcoming event in the active categories,
 * inside the active commune (null commune = all communes, Près de moi).
 * Quand, genre, phrase, title search, and the selected salle do not narrow it.
 */
const categoryVenueMemo = createDayMemo<Lieu[]>({ ttlMs: 300_000, max: 32 });

function venuesForCategoryMenu(
  input: AgendaQueryInput,
  now: Date,
): Lieu[] {
  const paris = parisParts(now).iso;
  const cats = [...input.cats].sort().join(',');
  const key = `${paris}|${normalizeCommune(input.commune)}|${cats}`;
  const hit = categoryVenueMemo.get(key);
  if (hit) return hit;
  const facet: AgendaQueryInput = {
    scope: 'tous',
    commune: input.commune,
    q: '',
    cats: input.cats,
    genres: [],
    lieuId: null,
    selectedDate: null,
    year: input.year,
    month: input.month,
  };
  const { items } = listForRange(facet, now);
  const venues = venuesFromWindow(items, null);
  categoryVenueMemo.set(key, venues);
  return venues;
}

function withRecoTags(item: DayItem): DayItem {
  return withTasteTags(slimDayItem(item), item);
}

const EMPTY_WORK_IDS: ReadonlySet<string> = new Set();

/**
 * Plafond produit : +120 ms ajoutés sur scope=tous, profil chargé.
 * Mesure 2026-09-28, 25 profils banc, lundi 28/09 10:00 Paris, après échauffement :
 * chaîne complète (soir + aujourd'hui + week-end + semaine) — médiane 136,3 ms, max 161,0 ms.
 * Au-dessus du plafond. Arbitrage : semaine et tous ne démotent qu'aujourd'hui
 * (l'essentiel du gain variété du banc 1). Aujourd'hui continue de démoter ce soir ;
 * le week-end garde sa règle (aujourd'hui seulement si le jour Paris est dans le week-end).
 * Mesure après arbitrage (deux passages) : médiane ~63 ms, max observé 70 ms.
 */
const DEMOTE_FULL_CHAIN = false;

/** Durée de la dernière chaîne (ms), hors recommend de la fenêtre servie. */
export let lastDemoteChainMs = 0;

/**
 * Point d'appel unique de recommendForProfile pour le Top 3.
 * Fenêtre servie, repli `tous` et fenêtres étroites passent par ici.
 */
export const agendaRecommend: {
  forProfile: typeof recommendForProfile;
} = {
  forProfile: recommendForProfile,
};

export type AgendaRecoTraceHit = {
  role: 'narrow' | 'window' | 'fallback';
  scope: TimeScopeId;
  demoteWorkIds: ReadonlySet<string>;
};

let agendaRecoTrace: AgendaRecoTraceHit[] | null = null;

/** Compteur de test : aucun effet tant qu'il n'est pas armé. */
export function traceAgendaRecoForTests(): AgendaRecoTraceHit[] {
  const buf: AgendaRecoTraceHit[] = [];
  agendaRecoTrace = buf;
  return buf;
}

export function stopAgendaRecoTraceForTests(): void {
  agendaRecoTrace = null;
}

type DemoteCtx = {
  input: AgendaQueryInput;
  profile: TasteProfile;
  now: Date;
  /** Séances encore à venir de la fenêtre servie, aujourd'hui inclus. */
  windowPool: DayItem[];
  nouveauIds: ReadonlySet<string>;
  demoteByKey: Map<string, ReadonlySet<string>>;
  retainedByKey: Map<string, ReadonlySet<string>>;
};

function profileMemoKey(profile: TasteProfile): string {
  const chunks: string[] = [];
  const bucket = (
    name: string,
    rec: Record<string, { weight: number; pct: number }> | undefined,
  ) => {
    for (const k of Object.keys(rec ?? {}).sort()) {
      const entry = rec![k];
      chunks.push(`${name}:${k}:${entry?.weight ?? 0}:${entry?.pct ?? 0}`);
    }
  };
  bucket('cats', profile.cats);
  bucket('moods', profile.moods);
  bucket('genres', profile.genres);
  bucket('themes', profile.themes);
  for (const k of Object.keys(profile.communes ?? {}).sort()) {
    chunks.push(`commune:${k}:${profile.communes[k] ?? 0}`);
  }
  return chunks.join('|');
}

function demoteMemoKey(scope: TimeScopeId, profile: TasteProfile): string {
  return `${scope}\0${profileMemoKey(profile)}`;
}

/** Ven / Sam / Dim : aujourd'hui est dans le week-end (weekendRange). */
function parisTodayInWeekend(now: Date): boolean {
  const { weekday } = parisParts(now);
  return weekday === 0 || weekday === 5 || weekday === 6;
}

function predecessorScopes(scope: TimeScopeId, now: Date): readonly TimeScopeId[] {
  if (!DEMOTE_FULL_CHAIN && (scope === 'semaine' || scope === 'tous')) {
    return ['aujourdhui'];
  }
  switch (scope) {
    case 'soir':
    case 'date':
      return [];
    case 'aujourdhui':
      return ['soir'];
    case 'weekend':
      return parisTodayInWeekend(now) ? ['aujourdhui'] : [];
    case 'semaine':
      return ['soir', 'aujourdhui', 'weekend'];
    case 'tous':
      return ['soir', 'aujourdhui', 'weekend', 'semaine'];
    default:
      return [];
  }
}

/** Sous-ensemble du pool déjà chargé : même commune, mêmes filtres reco. */
function itemsInScope(
  items: DayItem[],
  scope: TimeScopeId,
  input: AgendaQueryInput,
  now: Date,
): DayItem[] {
  if (scope === 'tous') return items;
  const range = resolveScopeRange(
    scope,
    scope === 'date' ? input.selectedDate : null,
    now,
    { year: input.year, month: input.month },
  );
  let out = items.filter((item) => {
    const day = (item.dayIso || '').trim();
    return Boolean(day) && day >= range.startIso && day <= range.endIso;
  });
  if (scope === 'soir') {
    out = filterSoirItems(out, loadCultureData().programmeWithContext).filter(
      (item) => isStillUpcomingSeance(item, now),
    );
  }
  return out;
}

function callRecommend(
  role: AgendaRecoTraceHit['role'],
  scope: TimeScopeId,
  pool: DayItem[],
  profile: TasteProfile,
  now: Date,
  nouveauIds: ReadonlySet<string>,
  demoteWorkIds: ReadonlySet<string>,
) {
  agendaRecoTrace?.push({ role, scope, demoteWorkIds });
  return agendaRecommend.forProfile(
    pool,
    { signalsRecent: [], profile },
    3,
    { now, nouveauFilmIds: nouveauIds, demoteWorkIds },
  );
}

function pickRecoItems(
  scope: TimeScopeId,
  windowPool: DayItem[],
  profile: TasteProfile,
  now: Date,
  nouveauIds: ReadonlySet<string>,
  demoteWorkIds: ReadonlySet<string>,
  role: 'narrow' | 'window',
): DayItem[] {
  const paris = parisParts(now);
  const pool =
    scope === 'tous'
      ? windowPool.filter((item) => (item.dayIso || '').trim() > paris.iso)
      : windowPool;
  const scored = callRecommend(
    role,
    scope,
    pool,
    profile,
    now,
    nouveauIds,
    demoteWorkIds,
  );
  const preferred = scored.map((s) => s.item);
  const fromPoolRaw = profileHasChipWeight(profile)
    ? preferred
    : mergeSlotPicks(preferred, pickSoonestPerSlot(pool));
  const fromPool = fillEmptyCineSlot(
    fromPoolRaw,
    windowPool,
    nouveauIds,
    demoteWorkIds,
  );
  const haveSlots = new Set(
    fromPool.map((item) => slotFormOfItem(item)).filter(Boolean),
  );
  // tous: missing FORM (not 0-overlap) from date>=today.
  const pickedRaw =
    scope === 'tous' && haveSlots.size < 3
      ? mergeSlotPicks(
          fromPool,
          callRecommend(
            'fallback',
            scope,
            windowPool,
            profile,
            now,
            nouveauIds,
            demoteWorkIds,
          ).map((s) => s.item),
        )
      : fromPool;
  return pickedRaw.filter((item) => isStillUpcomingSeance(item, now));
}

function retainedWorkIds(
  scope: TimeScopeId,
  input: AgendaQueryInput,
  profile: TasteProfile,
  now: Date,
  ctx: DemoteCtx,
): ReadonlySet<string> {
  const key = demoteMemoKey(scope, profile);
  const cached = ctx.retainedByKey.get(key);
  if (cached) return cached;
  const demote = demoteChainFor(scope, input, profile, now, ctx);
  const pool = itemsInScope(ctx.windowPool, scope, input, now);
  const picked = pickRecoItems(
    scope,
    pool,
    profile,
    now,
    ctx.nouveauIds,
    demote,
    'narrow',
  );
  const ids = new Set<string>();
  for (const item of picked) {
    const id = workIdOf(item) || item.key || '';
    if (id) ids.add(id);
  }
  ctx.retainedByKey.set(key, ids);
  return ids;
}

/**
 * Œuvres déjà retenues par les fenêtres plus étroites que `scope`.
 * Recalcul serveur sur le même pool : queryAgenda ne voit qu'une fenêtre
 * par appel, et l'état client n'est pas une source fiable.
 * Mémoïsé par (scope, profil) le temps de la requête — `tous` ne recalcule
 * pas `soir` trois fois.
 */
function demoteChainFor(
  scope: TimeScopeId,
  input: AgendaQueryInput,
  profile: TasteProfile,
  now: Date,
  ctx: DemoteCtx,
): ReadonlySet<string> {
  const key = demoteMemoKey(scope, profile);
  const cached = ctx.demoteByKey.get(key);
  if (cached) return cached;
  const preds = predecessorScopes(scope, now);
  if (preds.length === 0) {
    ctx.demoteByKey.set(key, EMPTY_WORK_IDS);
    return EMPTY_WORK_IDS;
  }
  const ids = new Set<string>();
  for (const pred of preds) {
    for (const id of retainedWorkIds(pred, input, profile, now, ctx)) {
      ids.add(id);
    }
  }
  ctx.demoteByKey.set(key, ids);
  return ids;
}

/**
 * Short-window list: default scope + commune, slim cards.
 * Search / multi-day pages are capped at ~50.
 */
export function queryAgenda(
  input: AgendaQueryInput,
  now = new Date(),
): AgendaListResponse {
  const data = loadCultureData();
  const paris = parisParts(now);
  const { items, searching, rangeDays } = listForRange(input, now);

  if (input.recoUpcoming) {
    // aujourdhui/semaine: skip started séances. tous must not — that glued
    // boot top 3 onto today's soonest trio.
    // Slots use séance day+time ≥ now Paris, never event.date_debut (saison 02/07).
    const blockedWorks = new Set(input.excludeWorkIds ?? []);
    const upcoming = items.filter(
      (item) =>
        isStillUpcomingSeance(item, now) &&
        !itemBlockedByWorkKeys(item, blockedWorks),
    );
    const windowPool = upcoming;
    const profile = input.recoProfile ?? {
      cats: {},
      moods: {},
      genres: {},
      themes: {},
      communes: {},
    };
    const nouveauIds = nouveauFilmIds(data.programmeWithContext, now);
    const demoteCtx: DemoteCtx = {
      input,
      profile,
      now,
      windowPool,
      nouveauIds,
      demoteByKey: new Map(),
      retainedByKey: new Map(),
    };
    const demoteStarted = performance.now();
    const demoteWorkIds = demoteChainFor(
      input.scope,
      input,
      profile,
      now,
      demoteCtx,
    );
    lastDemoteChainMs = performance.now() - demoteStarted;
    // Reco never surfaces a seance before today Paris (26/08 and earlier).
    const picked = pickRecoItems(
      input.scope,
      windowPool,
      profile,
      now,
      nouveauIds,
      demoteWorkIds,
      'window',
    );
    return {
      scope: input.scope,
      commune: input.commune,
      items: picked.map(withRecoTags),
      total: picked.length,
      densifiedTotal: densifiedCardCount(picked),
      ...emptyRecoExtras(),
      parisIso: paris.iso,
      weekday: paris.weekday,
      date_from: rangeDays[0],
      date_to: rangeDays[rangeDays.length - 1],
    };
  }

  return assembleListFromItems(items, input, now, { searching, rangeDays });
}

export type RelanceDigestSlice = {
  id: RelanceDigestWindowId;
  date_from: string;
  date_to: string;
  items: DayItem[];
  total: number;
};

/**
 * Two personal slices for the Relance email.
 * Same scorer as « Mes recos de la semaine »: `recommendForProfile` via
 * `scope=semaine` (cap 3, aujourd'hui demoted when that day sits in the window).
 * Not guest-boot `tous`, not the catalogue list order.
 * No kids flag: moods / genres / themes only, same as the week sheet.
 */
export type RelanceDigestResponse = {
  digest: 'relance';
  /** Same engine as the week sheet (`scope=semaine`). */
  score: 'mes-recos-semaine';
  timezone: typeof RELANCE_DIGEST_TIMEZONE;
  weekKey: string;
  parisIso: string;
  weekday: number;
  commune: string | null;
  slices: RelanceDigestSlice[];
};

export type RelanceDigestInput = {
  commune: string | null;
  recoProfile?: TasteProfile | null;
  excludeWorkIds?: readonly string[];
  year?: number;
  month?: number;
};

export function queryRelanceDigest(
  input: RelanceDigestInput,
  now = new Date(),
): RelanceDigestResponse {
  const paris = parisParts(now);
  const slices: RelanceDigestSlice[] = RELANCE_DIGEST_WINDOWS.map((id) => {
    const window = relanceDigestRange(id, now);
    const listed = queryAgenda(
      {
        scope: 'semaine',
        commune: input.commune,
        q: '',
        cats: [],
        genres: [],
        lieuId: null,
        selectedDate: null,
        year: input.year ?? paris.year,
        month: input.month ?? paris.month,
        recoUpcoming: true,
        recoProfile: input.recoProfile ?? null,
        excludeWorkIds: input.excludeWorkIds,
        digestWindow: id,
      },
      now,
    );
    return {
      id,
      date_from: window.startIso,
      date_to: window.endIso,
      items: listed.items,
      total: listed.items.length,
    };
  });
  return {
    digest: 'relance',
    score: 'mes-recos-semaine',
    timezone: RELANCE_DIGEST_TIMEZONE,
    weekKey: parisIsoWeekKey(now),
    parisIso: paris.iso,
    weekday: paris.weekday,
    commune: input.commune,
    slices,
  };
}

/**
 * Densified pack counters (voir tout / admin), not the public créneau badge.
 * One indexed pass per pack, then a day + item-set memo so a hard reload
 * (`Cache-Control: no-cache` bypasses `unstable_cache`) does not densify again.
 */
const PACK_TOTALS_MEMO_MS = 300_000;

type PackDensifiedTotals = {
  densifiedTotal: number;
  vivantTotal: number;
  cineTotal: number;
  theatreTotal: number;
  musiqueTotal: number;
  enfantsTotal: number;
  expoTotal: number;
};

const packTotalsMemo = createDayMemo<PackDensifiedTotals>({
  ttlMs: PACK_TOTALS_MEMO_MS,
  max: 24,
});
let packTotalsComputes = 0;

/** How many times pack totals were densified (cache misses). Tests only. */
export function packTotalsComputeCountForTests(): number {
  return packTotalsComputes;
}

function itemSetStamp(items: readonly DayItem[]): string {
  let h = 2166136261;
  for (const item of items) {
    const k = item.key;
    for (let i = 0; i < k.length; i++) {
      h ^= k.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x7c;
  }
  return `${items.length}:${h >>> 0}`;
}

function loadPackDensifiedTotals(
  day: string,
  items: DayItem[],
  enfantsChip: boolean,
  split: {
    vivantAll: DayItem[];
    cineAll: DayItem[];
    theatreAll: DayItem[];
    musiqueAll: DayItem[];
    enfantsAll: DayItem[];
    expoAll: DayItem[];
  },
): PackDensifiedTotals {
  const key = `${day}|${enfantsChip ? 'enfants' : 'pack'}|${itemSetStamp(items)}`;
  const hit = packTotalsMemo.get(key);
  if (hit) return hit;
  packTotalsComputes += 1;
  const totals: PackDensifiedTotals = {
    densifiedTotal: densifiedCardCount(items),
    vivantTotal: densifiedCardCount(split.vivantAll),
    cineTotal: densifiedCardCount(split.cineAll),
    theatreTotal: densifiedCardCount(split.theatreAll),
    musiqueTotal: densifiedCardCount(split.musiqueAll),
    enfantsTotal: densifiedCardCount(split.enfantsAll),
    expoTotal: densifiedCardCount(split.expoAll),
  };
  packTotalsMemo.set(key, totals);
  return totals;
}

function assembleListFromItems(
  items: DayItem[],
  input: AgendaQueryInput,
  now: Date,
  opts: { searching: boolean; rangeDays: string[] },
): AgendaListResponse {
  const data = loadCultureData();
  const paris = parisParts(now);
  const { searching } = opts;
  void opts.rangeDays;

  const showNouveautes =
    !input.avecEnfants &&
    !input.recoUpcoming &&
    !searching &&
    !hasPhraseFilters(input) &&
    catsAllowCinemaPack(input.cats) &&
    (input.scope === 'tous' ||
      input.scope === 'aujourdhui' ||
      input.scope === 'soir' ||
      input.scope === 'semaine');
  const nouveautes = filterItemsByCommune(
    hideSeancesBeforeToday(
      showNouveautes ? nouveautesCine(data.programmeWithContext, now) : [],
      paris.iso,
    ),
    input.commune,
  );

  const total = items.length;
  const offset = Math.max(0, input.offset ?? 0);
  const dayPage =
    input.scope === 'date' && Boolean((input.selectedDate || '').trim());
  const pageMax = dayPage
    ? AGENDA_DAY_PAGE_MAX
    : !searching && input.lieuId
      ? AGENDA_VENUE_PAGE_MAX
      : AGENDA_PAGE_MAX;
  const requested = input.limit ?? pageMax;
  const cap = Math.min(Math.max(requested, 0), pageMax);

  const vivantAll = items.filter(isVivantDayItem);
  const cineAll = items.filter(isCinemaDayItem);
  const theatreAll = items.filter(isTheatreDayItem);
  const musiqueAll = items.filter(isMusiqueDayItem);
  const enfantsAll = items.filter(
    input.cats.includes('enfants_famille') ? isEnfantsChipItem : isEnfantsDayItem,
  );
  const expoAll = items.filter(isExpoDayItem);
  const vivantCap = dayPage ? pageMax : HOME_PACK_WIRE_CAP;
  const heroCopyKeys = new Set<string>();
  for (const group of [cineAll, theatreAll, musiqueAll, enfantsAll, expoAll]) {
    for (const item of takeUniqueWorkItems(group, HOME_PACK_HERO_COPY_CAP)) {
      heroCopyKeys.add(item.key);
    }
  }
  const slimWire = (item: DayItem) =>
    slimDayItem(item, { keepFicheCopy: heroCopyKeys.has(item.key) });
  const pageSlice = items.slice(offset, offset + cap);
  for (const item of takeUniqueWorkItems(
    pageSlice.filter(isCinemaDayItem),
    HOME_PACK_HERO_COPY_CAP,
  )) {
    heroCopyKeys.add(item.key);
  }
  const page = pageSlice.map(slimWire);

  const vivantItems =
    !searching && offset === 0
      ? [
          ...takeUniqueWorkItems(theatreAll, vivantCap),
          ...takeUniqueWorkItems(musiqueAll, vivantCap),
          ...takeUniqueWorkItems(enfantsAll, vivantCap),
          ...takeUniqueWorkItems(expoAll, vivantCap),
        ]
          .filter((item, i, all) => all.findIndex((x) => x.key === item.key) === i)
          .map(slimWire)
      : [];
  const enfantsChip = input.cats.includes('enfants_famille');
  const {
    densifiedTotal,
    vivantTotal,
    cineTotal,
    theatreTotal,
    musiqueTotal,
    enfantsTotal,
    expoTotal,
  } = loadPackDensifiedTotals(paris.iso, items, enfantsChip, {
    vivantAll,
    cineAll,
    theatreAll,
    musiqueAll,
    enfantsAll,
    expoAll,
  });

  let counts: Record<string, number> | undefined;
  if (input.includeCounts) {
    const lieuIds = resolveLieuIds(input.commune, input.lieuId, searching);
    const countCats = input.recoUpcoming ? [] : input.cats;
    const countPool =
      countCats.length > 0
        ? poolForMains(countCats)
        : { programme: data.programmeWithContext, events: data.events };
    const map = countItemsByDay(
      countPool.programme,
      countPool.events,
      input.year,
      input.month,
      countCats,
      searching ? [] : lieuIds,
      input.genres,
      input.avecEnfants ? seanceMatchesAvecEnfantsMode : undefined,
    );
    counts = Object.fromEntries(map);
  }

  const venues =
    input.cats.length > 0
      ? venuesForCategoryMenu(input, now)
      : venuesFromWindow(items, input.lieuId);
  const genreSlugs =
    input.cats.length > 0 ? genreSlugsFromItems(items) : [];
  const slots = sectionSlotTotals(items, {
    enfantsChip: input.cats.includes('enfants_famille'),
  });

  return {
    scope: input.scope,
    commune: input.commune,
    items: page,
    total,
    densifiedTotal,
    ...csvRowCounts(),
    nouveautes: nouveautes.map((item) => slimDayItem(item)),
    communes: input.includeListMeta
      ? collectCommunes(lieuxByIdFromData().values())
      : [],
    venues,
    genreSlugs,
    counts,
    parisIso: paris.iso,
    weekday: paris.weekday,
    genresLegend: input.includeListMeta ? data.genresLegend : [],
    nouveauFilmIds: Array.from(nouveauFilmIds(data.programmeWithContext, now)),
    vivantItems,
    vivantTotal,
    cineTotal,
    theatreTotal,
    musiqueTotal,
    enfantsTotal,
    expoTotal,
    ...slots,
  };
}

export type RecoBootScope =
  | 'tous'
  | 'soir'
  | 'aujourdhui'
  | 'weekend'
  | 'semaine';

export type RecoByScope = Record<RecoBootScope, DayItem[]>;

export type ScopeListSnapshot = {
  items: DayItem[];
  total: number;
  densifiedTotal: number;
  nouveautes: DayItem[];
  venues: Lieu[];
  vivantItems?: DayItem[];
  vivantTotal?: number;
  cineTotal?: number;
  theatreTotal?: number;
  musiqueTotal?: number;
  enfantsTotal?: number;
  expoTotal?: number;
  cineSlotTotal?: number;
  theatreSlotTotal?: number;
  musiqueSlotTotal?: number;
  enfantsSlotTotal?: number;
  expoSlotTotal?: number;
  autresSlotTotal?: number;
};

export type ListByScope = Partial<Record<RecoBootScope, ScopeListSnapshot>>;

export type HomeWindow = AgendaListResponse & {
  recoByScope: RecoByScope;
  listByScope: ListByScope;
  /** Guest populaire for scope `tous` with the city chip cleared (métropole). */
  guestMetroTop3?: DayItem[];
};

/**
 * Empty reco slots. Profile and non-boot scopes stay empty on SSR.
 * Guest boot `tous` is attached afterwards when the short-TTL cache hits
 * inside `GUEST_BOOT_RECO_SSR_BUDGET_MS`. A cold recommendForProfile must
 * not stall first paint — `demoteChainFor` itself is unchanged.
 */
export function deferredRecoByScope(): RecoByScope {
  const empty: DayItem[] = [];
  return {
    tous: empty,
    soir: empty,
    aujourdhui: empty,
    weekend: empty,
    semaine: empty,
  };
}

/**
 * First HTML: cine + theatre first-paint cards + totals + chip meta.
 * Other living-arts rails hydrate from GET /api/agenda?window=home (append-only).
 */
function assembleHomeFirstPaint(
  items: DayItem[],
  input: AgendaQueryInput,
  now: Date,
): AgendaListResponse {
  const data = loadCultureData();
  const paris = parisParts(now);
  const showNouveautes =
    !input.recoUpcoming &&
    catsAllowCinemaPack(input.cats) &&
    (input.scope === 'tous' ||
      input.scope === 'aujourdhui' ||
      input.scope === 'soir' ||
      input.scope === 'semaine');
  const nouveautes = filterItemsByCommune(
    hideSeancesBeforeToday(
      showNouveautes ? nouveautesCine(data.programmeWithContext, now) : [],
      paris.iso,
    ),
    input.commune,
  );
  const cineAll = items.filter(isCinemaDayItem);
  const theatreAll = items.filter(isTheatreDayItem);
  const musiqueAll = items.filter(isMusiqueDayItem);
  const enfantsAll = items.filter(isEnfantsDayItem);
  const expoAll = items.filter(isExpoDayItem);
  const vivantAll = items.filter(isVivantDayItem);
  const cineHeroKeys = new Set(
    takeUniqueWorkItems(cineAll, 1).map((item) => item.key),
  );
  const theatreHeroKeys = new Set(
    takeUniqueWorkItems(theatreAll, 1).map((item) => item.key),
  );
  const page = takeUniqueWorkItems(cineAll, HOME_FIRST_PAINT_CINE_CAP).map(
    (item) => slimDayItem(item, { keepFicheCopy: cineHeroKeys.has(item.key) }),
  );
  const theatrePage = takeUniqueWorkItems(
    theatreAll,
    HOME_FIRST_PAINT_THEATRE_CAP,
  ).map((item) =>
    slimDayItem(item, { keepFicheCopy: theatreHeroKeys.has(item.key) }),
  );
  const totals = loadPackDensifiedTotals(paris.iso, items, false, {
    vivantAll,
    cineAll,
    theatreAll,
    musiqueAll,
    enfantsAll,
    expoAll,
  });
  const slots = sectionSlotTotals(items);
  return {
    scope: input.scope,
    commune: input.commune,
    items: page,
    total: items.length,
    densifiedTotal: totals.densifiedTotal,
    ...csvRowCounts(),
    nouveautes: nouveautes.map((item) => slimDayItem(item)),
    communes: input.includeListMeta
      ? collectCommunes(lieuxByIdFromData().values())
      : [],
    venues: [],
    genreSlugs: genreSlugsFromItems(items),
    parisIso: paris.iso,
    weekday: paris.weekday,
    genresLegend: input.includeListMeta ? data.genresLegend : [],
    nouveauFilmIds: Array.from(nouveauFilmIds(data.programmeWithContext, now)),
    vivantItems: theatrePage,
    vivantTotal: totals.vivantTotal,
    cineTotal: totals.cineTotal,
    theatreTotal: totals.theatreTotal,
    musiqueTotal: totals.musiqueTotal,
    enfantsTotal: totals.enfantsTotal,
    expoTotal: totals.expoTotal,
    ...slots,
  };
}

export function computeHomeFirstPaint(now = new Date()): HomeWindow {
  const scope = bootTimeScope();
  const { year, month } = parisParts(now);
  const bootInput: AgendaQueryInput = {
    scope,
    commune: 'Toulouse',
    q: '',
    cats: [],
    genres: [],
    lieuId: null,
    selectedDate: null,
    year,
    month,
    includeListMeta: true,
  };
  const { items: upcoming } = listForRange(bootInput, now);
  const boot = assembleHomeFirstPaint(upcoming, bootInput, now);
  return {
    ...boot,
    recoByScope: deferredRecoByScope(),
    listByScope: {},
  };
}

/** Guest populaire Top 3 for the homepage boot scope. Same path as a guest POST. */
export function guestBootRecoInput(
  now = new Date(),
  place: GuestBootPlace = 'toulouse',
): AgendaQueryInput {
  const { year, month } = parisParts(now);
  return {
    scope: 'tous',
    commune: place === 'metro' ? null : 'Toulouse',
    q: '',
    cats: [],
    genres: [],
    lieuId: null,
    selectedDate: null,
    year,
    month,
    recoUpcoming: true,
    recoProfile: null,
  };
}

/** Live guest boot reco (populaire + N1 demote). Not cached. */
export function computeGuestBootReco(
  now = new Date(),
  place: GuestBootPlace = 'toulouse',
): AgendaListResponse {
  return queryAgenda(guestBootRecoInput(now, place), now);
}

const guestBootRecoInflight = new Map<string, Promise<AgendaListResponse>>();

const GUEST_BOOT_MEMO_MS = 300_000;
const guestBootMemos = new Map<string, { items: DayItem[]; at: number }>();

function guestBootMemoKey(day: string, place: GuestBootPlace): string {
  return `${day}|${place}`;
}

/** Same-isolate copy so a hard reload can paint Top 3 without touching `unstable_cache`. */
export function rememberGuestBootMemo(
  day: string,
  items: DayItem[],
  place: GuestBootPlace = 'toulouse',
): void {
  if (!day || items.length === 0) return;
  guestBootMemos.set(guestBootMemoKey(day, place), { items, at: Date.now() });
}

export function readGuestBootMemo(
  day: string,
  nowMs = Date.now(),
  place: GuestBootPlace = 'toulouse',
): DayItem[] | null {
  const memo = guestBootMemos.get(guestBootMemoKey(day, place));
  if (!memo) return null;
  if (nowMs - memo.at > GUEST_BOOT_MEMO_MS) return null;
  return memo.items;
}

async function hardReloadBypassesRecoCache(): Promise<boolean> {
  try {
    const h = await headers();
    return requestBypassesDataCache({
      cacheControl: h.get('cache-control'),
      pragma: h.get('pragma'),
    });
  } catch {
    return false;
  }
}

/**
 * Short TTL, Paris day + boot scope + place + empty profile.
 * `Toulouse` is the city chip. `metro` is no city chip.
 * In-flight calls for the same place share one compute so an SSR budget
 * miss and the guest POST do not run recommendForProfile twice.
 */
export function loadGuestBootReco(
  now = new Date(),
  opts?: { eager?: boolean; place?: GuestBootPlace },
): Promise<AgendaListResponse> {
  const place = opts?.place ?? 'toulouse';
  const day = parisParts(now).iso;
  const inflightKey = guestBootMemoKey(day, place);
  const pending = guestBootRecoInflight.get(inflightKey);
  if (pending) return pending;
  // Captured per call. SSR stays non-eager so a miss yields past the budget.
  // The guest POST passes eager and computes immediately.
  // City key stays `Toulouse` so an already-warm cache still hits.
  const delayMs = guestBootRecoFillDelayMs(Boolean(opts?.eager));
  const cachePlace = place === 'metro' ? 'metro' : 'Toulouse';
  let work: Promise<AgendaListResponse>;
  try {
    work = unstable_cache(
      async () => {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        return computeGuestBootReco(new Date(), place);
      },
      ['guest-boot-reco-v2', day, 'tous', cachePlace],
      { revalidate: 300 },
    )();
  } catch (err) {
    return Promise.reject(err);
  }
  const tracked = work
    .then((res) => {
      rememberGuestBootMemo(day, res.items, place);
      return res;
    })
    .finally(() => {
      guestBootRecoInflight.delete(inflightKey);
    });
  guestBootRecoInflight.set(inflightKey, tracked);
  return tracked;
}

export function mergeGuestBootReco<
  T extends { recoByScope: RecoByScope; guestMetroTop3?: DayItem[] },
>(boot: T, items: DayItem[], place: GuestBootPlace = 'toulouse'): T {
  if (items.length === 0) return boot;
  if (place === 'metro') {
    return { ...boot, guestMetroTop3: items };
  }
  return {
    ...boot,
    recoByScope: {
      ...boot.recoByScope,
      tous: items,
    },
  };
}

async function guestBootItemsForPlace(
  day: string,
  now: Date,
  place: GuestBootPlace,
  bypass: boolean,
  budgetMs: number,
): Promise<DayItem[]> {
  const remembered = readGuestBootMemo(day, Date.now(), place);
  if (remembered) return remembered;
  // Hard reload bypasses the data cache and waits out the recompute.
  if (bypass) return [];
  const pending = loadGuestBootReco(now, { place })
    .then((res) => res.items)
    .catch((err: unknown) => {
      console.error('[guest-boot-reco]', place, err);
      return [] as DayItem[];
    });
  const items = await withDeadline(pending, budgetMs, [] as DayItem[]);
  if (items.length > 0) rememberGuestBootMemo(day, items, place);
  return items;
}

/**
 * Attach cached guest Top 3 onto an already-built first paint.
 * City chip → `recoByScope.tous`. No city chip → `guestMetroTop3`.
 * Cache hit: cards land in the RSC payload. Cache miss: the fill yields
 * past `budgetMs` (sync reco cannot be preempted) and HTML returns without
 * that pool. The in-flight fill still writes the cache when the isolate stays
 * up; otherwise the guest POST (`eager`) writes it. Do not `after()` the
 * fill — that holds the document open until recommendForProfile finishes.
 */
export async function attachGuestBootReco(
  boot: HomeWindow,
  now = new Date(),
  budgetMs = GUEST_BOOT_RECO_SSR_BUDGET_MS,
): Promise<HomeWindow> {
  const day = parisParts(now).iso;
  const toulouseMemo = readGuestBootMemo(day, Date.now(), 'toulouse');
  const metroMemo = readGuestBootMemo(day, Date.now(), 'metro');
  if (toulouseMemo && metroMemo) {
    return mergeGuestBootReco(
      mergeGuestBootReco(boot, toulouseMemo, 'toulouse'),
      metroMemo,
      'metro',
    );
  }
  const bypass = await hardReloadBypassesRecoCache();
  const [toulouse, metro] = await Promise.all([
    guestBootItemsForPlace(day, now, 'toulouse', bypass, budgetMs),
    guestBootItemsForPlace(day, now, 'metro', bypass, budgetMs),
  ]);
  return mergeGuestBootReco(
    mergeGuestBootReco(boot, toulouse, 'toulouse'),
    metro,
    'metro',
  );
}

const homePayloadMemo = createDayMemo<HomeWindow>({
  ttlMs: PACK_TOTALS_MEMO_MS,
  max: 4,
});
const agendaListMemo = createDayMemo<AgendaListResponse>({
  ttlMs: PACK_TOTALS_MEMO_MS,
  max: 24,
});

export function clearHomePaintMemosForTests(): void {
  packTotalsMemo.clear();
  homePayloadMemo.clear();
  agendaListMemo.clear();
  packTotalsComputes = 0;
}

/**
 * Slim first HTML: chips + cached guest Top 3 + cine + théâtre packs.
 * The day memo is checked before `unstable_cache`. A hard reload bypasses
 * the Next data cache and would otherwise rebuild this payload; the memo
 * keeps the cards and the pack totals from the previous miss in this isolate.
 */
export async function loadHomeFirstPaint(
  now = new Date(),
): Promise<HomeWindow> {
  const day = parisParts(now).iso;
  const remembered = homePayloadMemo.get(`first:${day}`);
  if (remembered) return attachGuestBootReco(remembered, now);
  const boot = await unstable_cache(
    async () => computeHomeFirstPaint(new Date()),
    ['home-first-paint-v4', day],
    { revalidate: 300 },
  )();
  homePayloadMemo.set(`first:${day}`, boot);
  return attachGuestBootReco(boot, now);
}

/**
 * Guest boot Top 3 reads the short-TTL cache. A profile (or any other
 * window) still runs `queryAgenda` live, including `demoteChainFor`.
 */
export async function queryAgendaReco(
  input: AgendaQueryInput,
  now = new Date(),
): Promise<AgendaListResponse> {
  const place = guestBootPlace(input.commune);
  if (
    place &&
    isGuestBootRecoRequest({
      recoUpcoming: Boolean(input.recoUpcoming),
      hasProfile: profileHasChipWeight(input.recoProfile),
      scope: input.scope,
      commune: input.commune,
      selectedDate: input.selectedDate,
    }) &&
    !(input.excludeWorkIds && input.excludeWorkIds.length > 0)
  ) {
    return loadGuestBootReco(now, { eager: true, place });
  }
  return queryAgenda(input, now);
}

function computeHomeWindow(now = new Date()): HomeWindow {
  const scope = bootTimeScope();
  const { year, month } = parisParts(now);
  const bootInput: AgendaQueryInput = {
    scope,
    commune: 'Toulouse',
    q: '',
    cats: [],
    genres: [],
    lieuId: null,
    selectedDate: null,
    year,
    month,
    includeListMeta: true,
  };
  // One upcoming scan — date chips are filtered subsets (no 5× queryAgenda).
  const { items: upcoming, searching, rangeDays } = listForRange(bootInput, now);
  const boot = assembleListFromItems(upcoming, bootInput, now, {
    searching,
    rangeDays,
  });
  // Date-chip snapshots are not embedded in first HTML — chips fetch
  // `/api/agenda?scope=` (5 min server cache). Saves TTFB + download.
  return {
    ...boot,
    recoByScope: deferredRecoByScope(),
    listByScope: {},
  };
}

/**
 * Home rail fill (`window=home`). Same day memo as first paint: a no-cache
 * miss must not densify the Toulouse « tous » catalogue again.
 */
export async function loadHomeWindow(
  now = new Date(),
): Promise<HomeWindow> {
  const day = parisParts(now).iso;
  const remembered = homePayloadMemo.get(`window:${day}`);
  if (remembered) return remembered;
  const boot = await unstable_cache(
    async () => computeHomeWindow(new Date()),
    ['home-window-slim-v4', day],
    { revalidate: 300 },
  )();
  homePayloadMemo.set(`window:${day}`, boot);
  return boot;
}

/**
 * Civil day only — inbox date filter. Do not use `queryAgendaDetail`
 * (related seances + aussiCeSoir) on this path; that is the cold ~10s.
 */
export function queryAgendaItemDateIso(id: string): string {
  const item = findItemByKey(id);
  if (!item) return '';
  return seanceDateIso(item);
}

function findItemByKey(id: string): DayItem | null {
  const normalized = normalizeDeepLinkId(id);
  if (!normalized) return null;
  const data = loadCultureData();
  if (normalized.startsWith('p:')) {
    const pid = normalized.slice(2);
    const p = data.programmeWithContext.find(
      (row) => row.programme.programme_id === pid,
    );
    if (!p) return null;
    return {
      kind: 'programme',
      key: `p:${p.programme.programme_id}`,
      dayIso: p.programme.date,
      programme: p.programme,
      evenement: p.evenement,
      lieu: p.lieu,
    };
  }
  if (normalized.startsWith('e:')) {
    const rest = normalized.slice(2);
    const lastColon = rest.lastIndexOf(':');
    const eventId = lastColon > 0 ? rest.slice(0, lastColon) : rest;
    const dayIso = lastColon > 0 ? rest.slice(lastColon + 1) : '';
    const ev = data.events.find((e) => e.event_id === eventId);
    if (!ev) return null;
    return {
      kind: 'fallback',
      key: dayIso ? `e:${eventId}:${dayIso}` : `e:${eventId}`,
      dayIso: dayIso || ev.date_debut,
      evenement: ev,
      lieu: ev.lieu,
    };
  }
  return null;
}

function withCredits(item: DayItem, artistes: Artiste[]): DayItem {
  const byId = new Map(artistes.map((a) => [a.artiste_id, a.nom]));
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const k = trimmed.toLocaleLowerCase('fr');
    if (seen.has(k)) return;
    seen.add(k);
    names.push(trimmed);
  };
  if (item.kind === 'programme') {
    for (const id of (item.programme.artiste_id || '').split(/[|,;]/)) {
      const nom = byId.get(id.trim());
      if (nom) add(nom);
    }
  }
  const ev = item.evenement;
  if (ev?.casting) {
    for (const part of ev.casting.split(/[,;|/]/)) add(part);
  }
  if (!ev || names.length === 0) return item;
  return { ...item, evenement: { ...ev, casting: names.join(', ') } };
}

function relatedSeancesFromProgramme(
  rows: ProgrammeWithContext[],
  commune?: string | null,
  window?: {
    dateFrom?: string | null;
    dateTo?: string | null;
    soir?: boolean;
  },
): DayItem[] {
  const mapped = rows
    .map((p) => ({
      kind: 'programme' as const,
      key: `p:${p.programme.programme_id}`,
      dayIso: p.programme.date,
      programme: p.programme,
      evenement: p.evenement,
      lieu: p.lieu,
    }))
    .sort((a, b) => {
      const da = a.programme.date || a.dayIso;
      const db = b.programme.date || b.dayIso;
      if (da !== db) return da.localeCompare(db);
      return (a.programme.heure_debut || '').localeCompare(
        b.programme.heure_debut || '',
      );
    })
    .map(relatedSeanceDayItem);
  return dedupeNonCinemaSameLieuHoraire(
    filterSeancesForDisplay(
      filterItemsByCommune(
        hideSeancesBeforeToday(mapped, parisParts().iso),
        commune,
      ),
      {
        startIso: window?.dateFrom,
        endIso: window?.dateTo,
        soir: Boolean(window?.soir),
      },
    ),
  );
}

export function queryAgendaDetail(
  id: string,
  commune?: string | null,
  window?: {
    dateFrom?: string | null;
    dateTo?: string | null;
    soir?: boolean;
  },
): AgendaDetailResponse | null {
  const data = loadCultureData();
  const item = findItemByKey(id);
  if (!item) return null;

  let relatedItems: DayItem[] = [];
  const fid = filmIdOfItem(item);
  const cineStem = isCinemaDayItem(item) ? cinemaDisplayStem(item) : '';
  if (fid || cineStem) {
    // Same visible film (official film_id and catalogue title clones).
    relatedItems = relatedSeancesFromProgramme(
      data.programmeWithContext.filter((p) => {
        if (fid && (p.programme.film_id || '').trim() === fid) return true;
        if (!cineStem) return false;
        const rowStem = cinemaTitleStem(
          p.programme.nom_item || p.evenement?.titre || '',
        );
        return cinemaStemsCompatible(cineStem, rowStem);
      }),
      commune,
      window,
    );
  } else {
    // Living-arts fiche: same normalised display title only.
    // Festival children share one event_id — do not join on that id.
    // Weekly BAR* clones mint a new event_id per night; title still matches.
    relatedItems = relatedSeancesFromProgramme(
      data.programmeWithContext.filter((p) =>
        isLivingArtsRelatedSeance(
          item,
          p.programme.nom_item,
          p.evenement?.titre,
        ),
      ),
      // Title match only — a Toulouse chip must not drop Ramonville créneaux.
      null,
      window,
    );
  }

  let aussiCeSoir: DayItem[] = [];
  if (isCinemaDayItem(item)) {
    const days = new Set<string>();
    for (const row of [item, ...relatedItems]) {
      const d = seanceDateIso(row) || row.dayIso;
      if (d) days.add(d);
    }
    for (const d of [...days]) {
      for (let i = 1; i <= CINE_LIVING_OTHER_DAY_HORIZON; i++) {
        days.add(addDaysIso(d, i));
      }
    }
    const pool: DayItem[] = [];
    for (const day of days) {
      pool.push(
        ...itemsForDay(
          data.programmeWithContext,
          data.events,
          day,
          [],
          [],
          [],
          false,
        ),
      );
    }
    aussiCeSoir = collectCinemaLivingCandidates(pool).map((item) =>
      slimDayItem(item),
    );
  }

  return {
    item: detailDayItem(
      withConcertArtistPress(withCredits(item, data.artistes), data.artistes),
    ),
    relatedItems,
    aussiCeSoir,
  };
}

export function parseTimeScope(raw: string | null): TimeScopeId {
  if (
    raw === 'tous' ||
    raw === 'aujourdhui' ||
    raw === 'soir' ||
    raw === 'weekend' ||
    raw === 'semaine' ||
    raw === 'date'
  ) {
    return raw;
  }
  return 'tous';
}

export function parseCsvParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}


/**
 * First-page list cache: scope + cat + commune + Paris day.
 * Search, phrase, and counts stay live. Guest boot reco uses its own
 * short-TTL cache; other reco windows stay live.
 */
export async function queryAgendaListCached(
  input: AgendaQueryInput,
  now = new Date(),
): Promise<AgendaListResponse> {
  const searching = Boolean((input.q || '').trim());
  const phrase = hasPhraseFilters(input);
  if (input.recoUpcoming) {
    return queryAgendaReco(input, now);
  }
  if (searching || phrase || input.includeCounts) {
    return queryAgenda(input, now);
  }
  const day = parisParts(now).iso;
  const cacheParts = agendaListCacheKeyParts({
    scope: input.scope,
    selectedDate: input.selectedDate,
    year: input.year,
    month: input.month,
    cats: input.cats,
    commune: input.commune,
    lieuId: input.lieuId,
    genres: input.genres,
    offset: input.offset,
    limit: input.limit,
    includeListMeta: input.includeListMeta,
    avecEnfants: input.avecEnfants,
    parisDay: day,
  });
  const cacheKey = cacheParts.join('\u001f');
  const remembered = agendaListMemo.get(cacheKey);
  if (remembered) return remembered;
  const result = await unstable_cache(
    async () => queryAgenda(input, new Date()),
    cacheParts,
    { revalidate: 300 },
  )();
  agendaListMemo.set(cacheKey, result);
  return result;
}
