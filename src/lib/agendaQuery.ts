import 'server-only';

import { unstable_cache } from 'next/cache';
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
import { catsAllowCinemaPack, formFromCategorieAndForm, mainFromForm } from './categories';
import { filterItemsByCommune } from './commune';
import { densifiedCardCount } from './densify';
import {
  countItemsByDay,
  genreOfItem,
  itemsForDateRange,
  itemsForDay,
} from './events';
import {
  filmIdOfItem,
  isCinemaDayItem,
  isVivantDayItem,
  nouveauFilmIds,
  nouveautesCine,
  pickAussiCeSoir,
} from './nouveautesCine';
import { itemSearchBlob, matchesNormalizedHaystack } from './searchText';
import {
  entityAliases,
  normalizePhrase,
  themeAliases,
} from './phraseTags';
import {
  detailDayItem,
  relatedSeanceDayItem,
  slimDayItem,
  slimLieu,
  type AgendaDetailResponse,
  type AgendaListResponse,
} from './slim';
import {
  bootTimeScope,
  filterSeancesForDisplay,
  hideSeancesBeforeToday,
  parisParts,
  resolveScopeRange,
  upcomingRange,
  type TimeScopeId,
} from './timeScope';
import { mergeSlotPicks, pickSoonestPerSlot, profileHasChipWeight, recommendForProfile } from './reco';
import type { TasteEntry, TasteProfile } from './signals';
import { normalizeDeepLinkId } from './deepLink';

export const AGENDA_PAGE_MAX = 50;

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
  const p = programmeOf(item);
  const ev = evenementOf(item);
  const cat = ev?.categorie || '';
  // Category main wins over stored form so phrase « musique »/« concert »
  // matches the Musique chip (e.g. Aurore musicale: form=danse, cat=musique).
  return formFromCategorieAndForm(cat, p?.form || ev?.form);
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
  let range = searching || input.scope === 'tous'
    ? upcomingRange(paris.iso, dataMaxIso())
    : scopeRange;
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
    if (input.scope === 'soir') {
      items = filterSoirItems(items, pool.programme);
    }
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
  return { items, searching, rangeDays: range.days };
}

/** Unique slim lieux from the same item set the counter uses (lieuId stripped). */
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

function genreSlugsFromItems(items: DayItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const g = genreOfItem(item);
    if (g) set.add(g);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}


function withRecoTags(item: DayItem): DayItem {
  const slim = slimDayItem(item);
  const evSrc = item.evenement;
  if (slim.kind === 'programme' && item.kind === 'programme') {
    return {
      ...slim,
      programme: {
        ...slim.programme,
        form: item.programme.form || '',
        moods: item.programme.moods || '',
        genres_mood: item.programme.genres_mood || '',
        themes: item.programme.themes || '',
      },
      evenement: slim.evenement
        ? {
            ...slim.evenement,
            form: evSrc?.form || '',
            moods: evSrc?.moods || '',
            genres_mood: evSrc?.genres_mood || '',
            themes: evSrc?.themes || '',
          }
        : slim.evenement,
    };
  }
  if (slim.kind === 'fallback') {
    return {
      ...slim,
      evenement: {
        ...slim.evenement,
        form: evSrc?.form || '',
        moods: evSrc?.moods || '',
        genres_mood: evSrc?.genres_mood || '',
        themes: evSrc?.themes || '',
      },
    };
  }
  return slim;
}


/** Reco pool: keep every theatre + concert, then fill cine up to cap. */
function recoSlotOf(item: DayItem): "cine" | "theatre" | "concert" | null {
  const ev = item.evenement ?? null;
  const prog = item.kind === "programme" ? item.programme : null;
  const form = formFromCategorieAndForm(
    ev?.categorie || "",
    prog?.form || ev?.form,
  );
  if (form === "cine" || form === "cinema") return "cine";
  if (form === "theatre" || form === "theatre_danse") return "theatre";
  if (form === "concert" || form === "musique") return "concert";
  const genre = `${prog?.genre || ""} ${ev?.genre || ""}`.toLowerCase();
  if (form === "festival" && /theatre|humour|standup|danse|cirque/.test(genre)) {
    return "theatre";
  }
  if (form === "festival" && /concert|musique|rock|jazz/.test(genre)) {
    return "concert";
  }
  return null;
}

function balanceRecoPool(items: DayItem[], cap: number): DayItem[] {
  const cine: DayItem[] = [];
  const theatre: DayItem[] = [];
  const concert: DayItem[] = [];
  for (const item of items) {
    const slot = recoSlotOf(item);
    if (slot === "cine") cine.push(item);
    else if (slot === "theatre") theatre.push(item);
    else if (slot === "concert") concert.push(item);
  }
  const must = [...theatre, ...concert];
  const rest = Math.max(0, cap - must.length);
  return [...must, ...cine.slice(0, rest)].slice(0, cap);
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

  const showNouveautes =
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
  const densifiedTotal = densifiedCardCount(items);

  if (input.recoUpcoming) {
    // aujourdhui/semaine: skip started séances. tous must not — that glued
    // boot top 3 onto today's soonest trio.
    // Slots use séance day+time ≥ now Paris, never event.date_debut (saison 02/07).
    const upcoming = items.filter((item) => isStillUpcomingSeance(item, now));
    const windowPool = upcoming;
    const pool =
      input.scope === 'tous'
        ? upcoming.filter((item) => (item.dayIso || '').trim() > paris.iso)
        : windowPool;
    const profile = input.recoProfile ?? null;
    const preferred =
      profile && profileHasChipWeight(profile)
        ? recommendForProfile(pool, { signalsRecent: [], profile }, 3).map(
            (s) => s.item,
          )
        : pickSoonestPerSlot(pool);
    const fromPool = mergeSlotPicks(preferred, pickSoonestPerSlot(pool));
    // tous: fill an empty slot from date>=today only (no skip-past).
    const pickedRaw =
      input.scope === 'tous'
        ? mergeSlotPicks(fromPool, pickSoonestPerSlot(windowPool))
        : fromPool;
    // Reco never surfaces a seance before today Paris (26/08 and earlier).
    const picked = pickedRaw.filter((item) => isStillUpcomingSeance(item, now));
    return {
      scope: input.scope,
      commune: input.commune,
      items: picked.map(slimDayItem),
      total: picked.length,
      densifiedTotal: densifiedCardCount(picked),
      ...emptyRecoExtras(),
      parisIso: paris.iso,
      weekday: paris.weekday,
      date_from: rangeDays[0],
      date_to: rangeDays[rangeDays.length - 1],
    };
  }

  const offset = Math.max(0, input.offset ?? 0);
  const requested = input.limit ?? AGENDA_PAGE_MAX;
  const cap = Math.min(Math.max(requested, 0), AGENDA_PAGE_MAX);
  const page = items.slice(offset, offset + cap).map(slimDayItem);

  const vivantAll = items.filter(isVivantDayItem);
  const cineAll = items.filter(isCinemaDayItem);
  const vivantItems =
    !searching && offset === 0
      ? vivantAll.slice(0, 40).map(slimDayItem)
      : [];
  const vivantTotal = densifiedCardCount(vivantAll);
  const cineTotal = densifiedCardCount(cineAll);

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
    );
    counts = Object.fromEntries(map);
  }

  void rangeDays;

  // Venues / genres from the already-filtered set — never re-scan days.
  const venues = venuesFromWindow(items, input.lieuId);
  const genreSlugs =
    input.cats.length > 0 ? genreSlugsFromItems(items) : [];

  return {
    scope: input.scope,
    commune: input.commune,
    items: page,
    total,
    densifiedTotal,
    nouveautes: nouveautes.map(slimDayItem),
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
  };
}

const RECO_BOOT_SCOPES = ['tous', 'soir', 'aujourdhui', 'weekend', 'semaine'] as const;

export type RecoBootScope = (typeof RECO_BOOT_SCOPES)[number];

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
};

export type ListByScope = Record<RecoBootScope, ScopeListSnapshot>;

export type HomeWindow = AgendaListResponse & {
  recoByScope: RecoByScope;
  listByScope: ListByScope;
};

function guestRecoForScope(scope: RecoBootScope, now: Date): DayItem[] {
  return queryAgenda(
    {
      scope,
      commune: 'Toulouse',
      q: '',
      cats: [],
      genres: [],
      lieuId: null,
      selectedDate: null,
      year: 2026,
      month: 8,
      recoUpcoming: true,
      recoProfile: null,
    },
    now,
  ).items;
}

function listSnapshotForScope(scope: RecoBootScope, now: Date): ScopeListSnapshot {
  const res = queryAgenda(
    {
      scope,
      commune: 'Toulouse',
      q: '',
      cats: [],
      genres: [],
      lieuId: null,
      selectedDate: null,
      year: 2026,
      month: 8,
      recoUpcoming: false,
    },
    now,
  );
  return {
    items: res.items,
    total: res.total,
    densifiedTotal: res.densifiedTotal,
    nouveautes: res.nouveautes,
    venues: res.venues,
    vivantItems: res.vivantItems,
    vivantTotal: res.vivantTotal,
    cineTotal: res.cineTotal,
  };
}

function computeHomeWindow(now = new Date()): HomeWindow {
  const scope = bootTimeScope();
  const boot = queryAgenda(
    {
      scope,
      commune: 'Toulouse',
      q: '',
      cats: [],
      genres: [],
      lieuId: null,
      selectedDate: null,
      year: 2026,
      month: 8,
      includeListMeta: true,
    },
    now,
  );
  const recoByScope = Object.fromEntries(
    RECO_BOOT_SCOPES.map((s) => [s, guestRecoForScope(s, now)]),
  ) as RecoByScope;
  const listByScope = Object.fromEntries(
    RECO_BOOT_SCOPES.map((s) => [s, listSnapshotForScope(s, now)]),
  ) as ListByScope;
  return { ...boot, recoByScope, listByScope };
}

/** Home boot: cached 5 min, keyed by Paris calendar day. Guest reco per scope rides along. */
export async function loadHomeWindow(
  now = new Date(),
): Promise<HomeWindow> {
  const day = parisParts(now).iso;
  return unstable_cache(
    async () => computeHomeWindow(new Date()),
    ['home-window', day],
    { revalidate: 300 },
  )();
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
  if (item.kind === 'programme') {
    const fid = filmIdOfItem(item);
    if (fid) {
      relatedItems = data.programmeWithContext
        .filter((p) => (p.programme.film_id || '').trim() === fid)
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
      relatedItems = filterSeancesForDisplay(
        filterItemsByCommune(
          hideSeancesBeforeToday(relatedItems, parisParts().iso),
          commune,
        ),
        {
          startIso: window?.dateFrom,
          endIso: window?.dateTo,
          soir: Boolean(window?.soir),
        },
      );
    }
  }

  let aussiCeSoir: DayItem[] = [];
  if (isCinemaDayItem(item)) {
    const cardDay =
      item.dayIso ||
      (item.kind === 'programme' ? item.programme.date : '');
    const tonight = cardDay
      ? itemsForDay(
          data.programmeWithContext,
          data.events,
          cardDay,
          [],
          [],
          [],
          true,
        ).filter(startsAtOrAfter19)
      : [];
    aussiCeSoir = filterItemsByCommune(
      pickAussiCeSoir(tonight, item, 3).map(slimDayItem),
      commune,
    );
  }

  return {
    item: detailDayItem(withCredits(item, data.artistes)),
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


/** First-page list cache: scope + cat + commune + Paris day. Skip search / phrase / reco. */
export async function queryAgendaListCached(
  input: AgendaQueryInput,
  now = new Date(),
): Promise<AgendaListResponse> {
  const searching = Boolean((input.q || '').trim());
  const phrase = hasPhraseFilters(input);
  if (searching || phrase || input.recoUpcoming || input.includeCounts) {
    return queryAgenda(input, now);
  }
  const day = parisParts(now).iso;
  const catKey = [...input.cats].map((c) => c.trim().toLowerCase()).filter(Boolean).sort().join(',');
  const commune = (input.commune || '').trim();
  const lieu = (input.lieuId || '').trim();
  const genreKey = [...input.genres].map((g) => g.trim()).filter(Boolean).sort().join(',');
  return unstable_cache(
    async () => queryAgenda(input, new Date()),
    [
      'agenda-list',
      'commune-exact-v1',
      day,
      input.scope,
      catKey,
      commune,
      lieu,
      genreKey,
      String(input.offset ?? 0),
      String(input.limit ?? ''),
      input.includeListMeta ? '1' : '0',
    ],
    { revalidate: 300 },
  )();
}
