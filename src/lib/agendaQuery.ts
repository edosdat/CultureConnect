import 'server-only';

import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import { loadCultureData } from './data';
import { mainFromCategorie } from './categories';
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
  nouveautesCine,
  pickAussiCeSoir,
} from './nouveautesCine';
import {
  itemSearchBlob,
  matchesNormalizedHaystack,
  normalizeForMatch,
} from './searchText';
import {
  detailDayItem,
  slimDayItem,
  slimLieu,
  type AgendaDetailResponse,
  type AgendaListResponse,
} from './slim';
import {
  defaultTimeScope,
  parisParts,
  resolveScopeRange,
  upcomingRange,
  type TimeScopeId,
} from './timeScope';

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
  /** Phrase tags — AND with scope/commune. Do not title-search q when set. */
  form?: string | null;
  moods?: string[];
  tagGenres?: string[];
  date_from?: string | null;
  date_to?: string | null;
};

export type { AgendaListResponse, AgendaDetailResponse } from './slim';

function normalizeCommune(c: string | null | undefined): string {
  return (c || '').trim().toLocaleLowerCase('fr');
}

function itemHeureDebut(item: DayItem): string {
  if (item.kind === 'programme') return (item.programme.heure_debut || '').trim();
  return (item.evenement.heure_debut || '').trim();
}

/** Ce soir: heure_debut >= 19:00; exclude period cards without a clock time. */
export function startsAtOrAfter19(item: DayItem): boolean {
  const h = itemHeureDebut(item);
  if (!h || h.length < 4) return false;
  return h.slice(0, 5) >= '19:00';
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
  const raw = (p?.form || ev?.form || '').toString().trim().toLowerCase();
  if (raw) return raw;
  const cat = ev?.categorie || '';
  const main = mainFromCategorie(cat);
  if (main === 'cinema') return 'cine';
  if (main === 'theatre_danse') return 'theatre';
  if (main === 'musique') return 'concert';
  if (main === 'festival') return 'festival';
  if (main === 'enfants_famille') return 'enfants';
  const c = cat.trim().toLowerCase();
  if (c.includes('cinema') || c.includes('cine')) return 'cine';
  if (c.includes('theatre') || c.includes('humour') || c.includes('danse'))
    return 'theatre';
  if (c.includes('concert') || c.includes('musique') || c.includes('guinguette'))
    return 'concert';
  if (c.includes('festival')) return 'festival';
  if (c.includes('enfant') || c.includes('famille')) return 'enfants';
  return '';
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

function genresOverlap(query: string[], item: DayItem): boolean {
  if (query.length === 0) return true;
  const hay = genresHaystack(item);
  return query.some((q) => slugMatchesHay(q, hay));
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

export function itemMatchesPhraseTags(
  item: DayItem,
  query: {
    form?: string | null;
    moods?: string[];
    tagGenres?: string[];
    date_from?: string | null;
    date_to?: string | null;
  },
): boolean {
  const form = (query.form || '').trim();
  const moods = (query.moods || []).map((m) => m.trim().toLowerCase()).filter(Boolean);
  const genres = (query.tagGenres || []).map((g) => g.trim().toLowerCase()).filter(Boolean);
  const from = (query.date_from || '').trim();
  const to = (query.date_to || '').trim();
  const hasForm = Boolean(form);
  const hasMoods = moods.length > 0;
  const hasGenres = genres.length > 0;
  const hasDates = Boolean(from || to);
  if (!hasForm && !hasMoods && !hasGenres && !hasDates) return true;

  if (hasDates) {
    const d = (item.dayIso || '').trim();
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
  }
  if (hasForm && !formMatches(form, item)) return false;

  const moodOnly = hasMoods && !hasForm && !hasGenres;
  if (moodOnly) {
    if (isEmptyMoodRow(item)) return false;
    return moodsOverlap(moods, item);
  }

  const moodAndGenre = hasMoods && hasGenres;
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
  const phrase = hasPhraseFilters(input);
  const searching = !phrase && input.q.trim().length > 0;
  const scopeRange = resolveScopeRange(input.scope, input.selectedDate, now, {
    year: input.year,
    month: input.month,
  });
  const range = searching
    ? upcomingRange(paris.iso, dataMaxIso(), 90)
    : scopeRange;
  const lieuIds = resolveLieuIds(input.commune, input.lieuId, searching);

  let items: DayItem[];
  if (searching) {
    items = itemsForDateRange(
      data.programmeWithContext,
      data.events,
      range.startIso,
      range.endIso,
      input.cats,
      lieuIds,
      input.genres,
    );
    const q = input.q.trim();
    if (q) {
      items = items.filter((item) =>
        matchesNormalizedHaystack(
          normalizeForMatch(itemSearchBlob(item, data.genresLegend)),
          q,
        ),
      );
    }
  } else {
    const excludeLong =
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
        input.cats,
        lieuIds,
        input.genres,
        excludeLong,
      )) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        items.push(item);
      }
    }
    if (input.scope === 'soir') {
      items = items.filter(startsAtOrAfter19);
    }
  }

  if (phrase) {
    items = items.filter((item) =>
      itemMatchesPhraseTags(item, {
        form: input.form,
        moods: input.moods,
        tagGenres: input.tagGenres,
        date_from: input.date_from,
        date_to: input.date_to,
      }),
    );
  }

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
    paris.weekday === 3 &&
    !searching &&
    (input.scope === 'aujourdhui' ||
      input.scope === 'soir' ||
      input.scope === 'semaine');
  const nouveautes = showNouveautes
    ? nouveautesCine(data.programmeWithContext, paris.iso, now)
    : [];

  const total = items.length;
  const densifiedTotal = densifiedCardCount(items);

  const shortWindow =
    !searching &&
    (input.scope === 'aujourdhui' ||
      input.scope === 'soir' ||
      (input.scope === 'date' && Boolean(input.selectedDate)) ||
      input.scope === 'weekend' ||
      input.scope === 'semaine');
  const offset = Math.max(0, input.offset ?? 0);
  const requested = input.limit ?? (shortWindow ? items.length : AGENDA_PAGE_MAX);
  const cap = shortWindow
    ? Math.min(Math.max(requested, 0), 800)
    : Math.min(Math.max(requested, 0), AGENDA_PAGE_MAX);
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
    communes: collectCommunes(lieuxByIdFromData().values()),
    venues: venuesForQuery(input, searching, now),
    genreSlugs: genreSlugsForQuery(input, searching, now),
    counts,
    parisIso: paris.iso,
    weekday: paris.weekday,
    genresLegend: data.genresLegend,
  };
}

export function loadHomeWindow(now = new Date()): AgendaListResponse {
  const scope = defaultTimeScope(now);
  const paris = parisParts(now);
  return queryAgenda(
    {
      scope,
      commune: 'Toulouse',
      q: '',
      cats: [],
      genres: [],
      lieuId: null,
      selectedDate: paris.iso,
      year: 2026,
      month: 8,
    },
    now,
  );
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
        .map(slimDayItem);
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
    item: detailDayItem(item),
    relatedItems,
    aussiCeSoir,
  };
}

export function parseTimeScope(raw: string | null): TimeScopeId {
  if (
    raw === 'aujourdhui' ||
    raw === 'soir' ||
    raw === 'weekend' ||
    raw === 'semaine' ||
    raw === 'date'
  ) {
    return raw;
  }
  return defaultTimeScope();
}

export function parseCsvParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
