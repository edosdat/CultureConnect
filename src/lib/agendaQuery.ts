import 'server-only';

import type { DayItem, Lieu } from './types';
import { loadCultureData } from './data';
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

function listForRange(
  input: AgendaQueryInput,
  now: Date,
): { items: DayItem[]; searching: boolean; rangeDays: string[] } {
  const data = loadCultureData();
  const paris = parisParts(now);
  const searching = input.q.trim().length > 0;
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
  now = new Date(),
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
    const paris = parisParts(now);
    const tonight = itemsForDay(
      data.programmeWithContext,
      data.events,
      paris.iso,
      [],
      [],
      [],
      true,
    ).filter(startsAtOrAfter19);
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
