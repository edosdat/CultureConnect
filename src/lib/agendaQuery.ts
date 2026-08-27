import 'server-only';

import { unstable_cache } from 'next/cache';
import type { Artiste, DayItem, Evenement, Lieu, ProgrammeItem, ProgrammeWithContext } from './types';
import { loadCultureData } from './data';
import { catsAllowCinemaPack, formFromCategorieAndForm } from './categories';
import { densifiedCardCount } from './densify';
import {
  countItemsByDay,
  genreOfItem,
  itemsForDateRange,
  itemsForDay,
  lieuxForDay,
} from './events';
import {
  filmIdOfItem,
  isCinemaDayItem,
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
  hideSeancesBeforeToday,
  parisParts,
  resolveScopeRange,
  upcomingRange,
  type TimeScopeId,
} from './timeScope';
import { mergeSlotPicks, pickSoonestPerSlot, profileHasChipWeight, recommendForProfile } from './reco';
import type { TasteEntry, TasteProfile } from './signals';

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
  /** Top 3: date scope window, never cat chips. tous = 90 days. */
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
  'nouveautes' | 'communes' | 'venues' | 'genreSlugs' | 'genresLegend' | 'nouveauFilmIds'
> {
  return {
    nouveautes: [],
    communes: [],
    venues: [],
    genreSlugs: [],
    genresLegend: [],
    nouveauFilmIds: [],
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
  const data = loadCultureData();
  const byId = new Map<string, Lieu>();
  for (const p of data.programmeWithContext) {
    if (p.lieu?.lieu_id) byId.set(p.lieu.lieu_id, p.lieu);
  }
  for (const e of data.events) {
    if (e.lieu?.lieu_id) byId.set(e.lieu.lieu_id, e.lieu);
  }
  return byId;
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
  const data = loadCultureData();
  let max = '';
  for (const p of data.programmeWithContext) {
    const d = (p.programme.date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > max) max = d;
  }
  for (const e of data.events) {
    for (const raw of [e.date_debut, e.date_fin]) {
      const d = (raw || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > max) max = d;
    }
  }
  return max;
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
    ? upcomingRange(paris.iso, dataMaxIso(), 90)
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

  let items: DayItem[];
  if (searching) {
    items = itemsForDateRange(
      data.programmeWithContext,
      data.events,
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
    const excludeLong =
      reco ||
      input.scope === 'tous' ||
      input.scope === 'aujourdhui' ||
      input.scope === 'soir' ||
      input.scope === 'weekend' ||
      input.scope === 'semaine';
    const seen = new Set<string>();
    items = [];
    for (const iso of range.days) {
      for (const item of itemsForDay(
        data.programmeWithContext,
        data.events,
        iso,
        cats,
        lieuIds,
        genres,
        excludeLong,
      )) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        items.push(item);
      }
    }
    if (input.scope === 'soir') {
      items = filterSoirItems(items, data.programmeWithContext);
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

function venuesForQuery(
  input: AgendaQueryInput,
  searching: boolean,
  now: Date,
): Lieu[] {
  const data = loadCultureData();
  const byId = lieuxByIdFromData();
  if (searching) {
    return Array.from(byId.values())
      .map((l) => slimLieu(l)!)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }
  const scopeRange = resolveScopeRange(input.scope, input.selectedDate, now, {
    year: input.year,
    month: input.month,
  });
  const map = new Map<string, Lieu>();
  for (const iso of scopeRange.days) {
    for (const lieu of lieuxForDay(
      data.programmeWithContext,
      data.events,
      iso,
      input.cats,
      input.year,
      input.month,
      input.genres,
    )) {
      map.set(lieu.lieu_id, lieu);
    }
  }
  let list = Array.from(map.values());
  if (input.commune) {
    const target = normalizeCommune(input.commune);
    list = list.filter((l) => normalizeCommune(l.commune) === target);
  }
  return list
    .map((l) => slimLieu(l)!)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

function genreSlugsForQuery(
  input: AgendaQueryInput,
  searching: boolean,
  now: Date,
): string[] {
  if (input.cats.length === 0) return [];
  const data = loadCultureData();
  const scopeRange = resolveScopeRange(input.scope, input.selectedDate, now, {
    year: input.year,
    month: input.month,
  });
  const lieuIds = searching
    ? []
    : resolveLieuIds(input.commune, input.lieuId, false);
  const set = new Set<string>();
  for (const iso of scopeRange.days) {
    const dayItems = itemsForDay(
      data.programmeWithContext,
      data.events,
      iso,
      input.cats,
      lieuIds,
      [],
    );
    for (const item of dayItems) {
      const g = genreOfItem(item);
      if (g) set.add(g);
    }
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
  const nouveautes = hideSeancesBeforeToday(
    showNouveautes ? nouveautesCine(data.programmeWithContext, now) : [],
    paris.iso,
  );

  const total = items.length;
  const densifiedTotal = densifiedCardCount(items);

  if (input.recoUpcoming) {
    const profile = input.recoProfile ?? null;
    const preferred =
      profile && profileHasChipWeight(profile)
        ? recommendForProfile(items, { signalsRecent: [], profile }, 3).map(
            (s) => s.item,
          )
        : pickSoonestPerSlot(items);
    const picked = mergeSlotPicks(preferred, pickSoonestPerSlot(items));
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

  let counts: Record<string, number> | undefined;
  if (input.includeCounts) {
    const lieuIds = resolveLieuIds(input.commune, input.lieuId, searching);
    const map = countItemsByDay(
      data.programmeWithContext,
      data.events,
      input.year,
      input.month,
      input.cats,
      searching ? [] : lieuIds,
      input.genres,
    );
    counts = Object.fromEntries(map);
  }

  void rangeDays;

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
    venues: input.includeListMeta ? venuesForQuery(input, searching, now) : [],
    genreSlugs: genreSlugsForQuery(input, searching, now),
    counts,
    parisIso: paris.iso,
    weekday: paris.weekday,
    genresLegend: input.includeListMeta ? data.genresLegend : [],
    nouveauFilmIds: Array.from(nouveauFilmIds(data.programmeWithContext, now)),
  };
}

const RECO_BOOT_SCOPES = ['tous', 'soir', 'aujourdhui', 'semaine'] as const;

export type RecoBootScope = (typeof RECO_BOOT_SCOPES)[number];

export type RecoByScope = Record<RecoBootScope, DayItem[]>;

export type HomeWindow = AgendaListResponse & {
  recoByScope: RecoByScope;
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
  return { ...boot, recoByScope };
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
  const data = loadCultureData();
  if (id.startsWith('p:')) {
    const pid = id.slice(2);
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
  if (id.startsWith('e:')) {
    const rest = id.slice(2);
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
      relatedItems = hideSeancesBeforeToday(
        relatedItems,
        parisParts().iso,
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
    aussiCeSoir = pickAussiCeSoir(tonight, item, 3).map(slimDayItem);
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
