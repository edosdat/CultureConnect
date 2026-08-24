import type {
  DayItem,
  Evenement,
  EventWithDetails,
  Lieu,
  ProgrammeWithContext,
} from './types';
import { matchesMainCategories } from './categories';
import {
  isCinemaPeriodAggregate,
  isPublishableEvent,
  isPublishableProgrammeName,
  normalizeForMatch,
} from './publishable';

/** @deprecated Prefer MAIN_CATEGORIES — kept for callers that still list raw CSV values. */
export function getCategories(events: Evenement[]): string[] {
  return Array.from(
    new Set(
      events
        .filter(isPublishableEvent)
        .map((e) => e.categorie)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Inclusive YYYY-MM-DD range helper */
export function eventOccursOnDay(event: Evenement, dayIso: string): boolean {
  const start = event.date_debut;
  const end = event.date_fin || event.date_debut;
  if (!start) return false;
  return start <= dayIso && end >= dayIso;
}

/** Inclusive day count between date_debut and date_fin (1 if same day / missing fin). */
export function eventSpanDays(ev: {
  date_debut: string;
  date_fin: string;
}): number {
  const start = ev.date_debut;
  const end = ev.date_fin || ev.date_debut;
  if (!start) return 0;
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  if (!ys || !ms || !ds || !ye || !me || !de) return 1;
  const t0 = Date.UTC(ys, ms - 1, ds);
  const t1 = Date.UTC(ye, me - 1, de);
  const diff = Math.floor((t1 - t0) / 86400000);
  return Math.max(1, diff + 1);
}

function categorieOf(item: ProgrammeWithContext): string {
  return item.evenement?.categorie ?? '';
}

function lieuIdOf(item: ProgrammeWithContext): string {
  return item.programme.lieu_id || item.evenement?.lieu_id || item.lieu?.lieu_id || '';
}

/** Prefer programme.genre for unitary items; evenements.genre for fallbacks. */
export function genreOfItem(item: DayItem): string {
  if (item.kind === 'programme') {
    return item.programme.genre || item.evenement?.genre || '';
  }
  return item.evenement.genre || '';
}

function genreOfProgramme(item: ProgrammeWithContext): string {
  return item.programme.genre || item.evenement?.genre || '';
}

/**
 * BOTH parent event (if any) AND nom_item must pass junk filters.
 * Previously returned early on parent event and never checked nom_item.
 */
function isProgrammePublishable(p: ProgrammeWithContext): boolean {
  if (
    !isPublishableProgrammeName(p.programme.nom_item, {
      notes: p.programme.notes,
      description: p.programme.description_item,
    })
  ) {
    return false;
  }
  if (
    p.evenement &&
    !isPublishableEvent(p.evenement) &&
    !isCinemaPeriodAggregate(p.evenement)
  ) {
    return false;
  }
  return true;
}

/**
 * Filter by main UI categories (mapped from categorie + genre), lieu, and genre slug.
 * `categories` is an array of MainCategoryId (6 UI buckets).
 */
function matchesFilters(
  categorie: string,
  lieuId: string,
  genre: string,
  categories: string[],
  lieuIds: string[],
  genres: string[],
): boolean {
  if (!matchesMainCategories(categorie, genre, categories)) return false;
  if (lieuIds.length > 0 && !lieuIds.includes(lieuId)) return false;
  if (genres.length > 0 && !genres.includes(genre)) return false;
  return true;
}

function sortKeyHeure(heure: string): string {
  // Empty times sort after timed items
  return heure && heure.trim() ? heure.slice(0, 5) : '99:99';
}

function itemHeureDebut(item: DayItem): string {
  if (item.kind === 'programme') return (item.programme.heure_debut || '').trim();
  return (item.evenement.heure_debut || '').trim();
}

function itemTitle(item: DayItem): string {
  if (item.kind === 'programme') return item.programme.nom_item || '';
  return item.evenement.titre || '';
}

function hasClockTime(heure: string): boolean {
  return /^\d{1,2}:\d{2}/.test((heure || '').trim());
}

/**
 * Period-aggregates, venue-hours / resto, and undated cards stay visible
 * but sort after real timed soirées.
 */
function isLowPriorityDayItem(item: DayItem): boolean {
  if (item.kind === 'fallback') return true;
  if (!hasClockTime(itemHeureDebut(item))) return true;
  const t = normalizeForMatch(itemTitle(item));
  if (/(resto|restaurant|bistrot|brasserie)/.test(t)) return true;
  if (/\bhoraires?\b/.test(t)) return true;
  if (/ouverture quotidienne|ouverture 7\s*\/\s*7/.test(t)) return true;
  if (/[—\-–]\s*ouverture/.test(t) && !/soiree d['’ ]?ouverture/.test(t)) return true;
  if (/pas de concerts? dat/.test(t) || /lineup non dat/.test(t)) return true;
  if (/terrasse/.test(t) && /restaurant/.test(t)) return true;
  return false;
}

/** Lower = higher priority when no category filter (cinema last among mains). */
function categorieSortRank(categorie: string): number {
  const c = (categorie || '').toLowerCase();
  if (c.includes('musique') || c.includes('concert')) return 0;
  if (c.includes('theatre') || c.includes('danse') || c.includes('humour'))
    return 1;
  if (c.includes('festival')) return 2;
  if (c.includes('expo') || c.includes('patrimoine') || c.includes('visite'))
    return 3;
  if (c.includes('enfant') || c.includes('famille')) return 4;
  if (c.includes('cinema') || c.includes('cinematheque')) return 8;
  return 5;
}

function categorieOfDayItem(item: DayItem): string {
  if (item.kind === 'programme') return item.evenement?.categorie ?? '';
  return item.evenement.categorie ?? '';
}

function sortDayItems(
  all: DayItem[],
  opts?: { deprioritizeCinema?: boolean },
): DayItem[] {
  const deprioritizeCinema = opts?.deprioritizeCinema ?? false;
  all.sort((a, b) => {
    if (a.dayIso !== b.dayIso) return a.dayIso.localeCompare(b.dayIso);
    const lowA = isLowPriorityDayItem(a) ? 1 : 0;
    const lowB = isLowPriorityDayItem(b) ? 1 : 0;
    if (lowA !== lowB) return lowA - lowB;
    const ha = sortKeyHeure(itemHeureDebut(a));
    const hb = sortKeyHeure(itemHeureDebut(b));
    if (ha !== hb) return ha.localeCompare(hb);
    if (deprioritizeCinema) {
      const ra = categorieSortRank(categorieOfDayItem(a));
      const rb = categorieSortRank(categorieOfDayItem(b));
      if (ra !== rb) return ra - rb;
    }
    const ta =
      a.kind === 'programme' ? a.programme.nom_item : a.evenement.titre;
    const tb =
      b.kind === 'programme' ? b.programme.nom_item : b.evenement.titre;
    return ta.localeCompare(tb, 'fr');
  });
  return all;
}

/**
 * Day agenda: unitary programme items for that date (preferred),
 * plus one fallback card per evenement covering the day with no programme rows that day.
 */
export function itemsForDay(
  programme: ProgrammeWithContext[],
  events: EventWithDetails[],
  dayIso: string,
  categories: string[] = [],
  lieuIds: string[] = [],
  genres: string[] = [],
): DayItem[] {
  const programmeThatDay = programme.filter(
    (p) => p.programme.date === dayIso && isProgrammePublishable(p),
  );
  const eventIdsWithProgramme = new Set(
    programmeThatDay.map((p) => p.programme.event_id).filter(Boolean),
  );

  const programmeItems: DayItem[] = programmeThatDay
    .filter((p) =>
      matchesFilters(
        categorieOf(p),
        lieuIdOf(p),
        genreOfProgramme(p),
        categories,
        lieuIds,
        genres,
      ),
    )
    .map((p) => ({
      kind: 'programme' as const,
      key: `p:${p.programme.programme_id}`,
      dayIso,
      programme: p.programme,
      evenement: p.evenement,
      lieu: p.lieu,
    }));

  const fallbackItems: DayItem[] = events
    .filter((ev) => {
      if (!isPublishableEvent(ev)) return false;
      if (!eventOccursOnDay(ev, dayIso)) return false;
      if (eventIdsWithProgramme.has(ev.event_id)) return false;
      const lieuId = ev.lieu_id || ev.lieu?.lieu_id || '';
      return matchesFilters(
        ev.categorie,
        lieuId,
        ev.genre || '',
        categories,
        lieuIds,
        genres,
      );
    })
    .map((ev) => ({
      kind: 'fallback' as const,
      key: `e:${ev.event_id}:${dayIso}`,
      dayIso,
      evenement: ev,
      lieu: ev.lieu,
    }));

  return sortDayItems([...programmeItems, ...fallbackItems], {
    deprioritizeCinema: categories.length === 0,
  });
}

/**
 * First day of the month that an event covers (or date_debut if it falls in month).
 * Returns null if the event does not intersect the month.
 */
function firstCoveredDayInMonth(
  ev: Evenement,
  year: number,
  month: number,
): string | null {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const start = ev.date_debut;
  const end = ev.date_fin || ev.date_debut;
  if (!start) return null;
  if (end < monthStart || start > monthEnd) return null;
  // Prefer date_debut when it falls in the month; else first day of month in span
  if (start >= monthStart && start <= monthEnd) return start;
  return monthStart;
}

/**
 * Month agenda: programme items for days in month + fallback events at most ONCE
 * per event_id (on the first day of the month that the event covers).
 */
export function itemsForMonth(
  programme: ProgrammeWithContext[],
  events: EventWithDetails[],
  year: number,
  month: number, // 1-12
  categories: string[] = [],
  lieuIds: string[] = [],
  genres: string[] = [],
): DayItem[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const programmeItems: DayItem[] = programme
    .filter((p) => {
      const d = p.programme.date;
      if (!d || d < monthStart || d > monthEnd) return false;
      return isProgrammePublishable(p);
    })
    .filter((p) =>
      matchesFilters(
        categorieOf(p),
        lieuIdOf(p),
        genreOfProgramme(p),
        categories,
        lieuIds,
        genres,
      ),
    )
    .map((p) => ({
      kind: 'programme' as const,
      key: `p:${p.programme.programme_id}`,
      dayIso: p.programme.date,
      programme: p.programme,
      evenement: p.evenement,
      lieu: p.lieu,
    }));

  // Event ids that already have at least one programme row in this month
  const eventIdsWithProgrammeInMonth = new Set(
    programmeItems.map((i) =>
      i.kind === 'programme' ? i.programme.event_id : '',
    ).filter(Boolean),
  );

  const fallbackItems: DayItem[] = [];
  for (const ev of events) {
    if (!isPublishableEvent(ev)) continue;
    if (eventIdsWithProgrammeInMonth.has(ev.event_id)) continue;
    const dayIso = firstCoveredDayInMonth(ev, year, month);
    if (!dayIso) continue;
    const lieuId = ev.lieu_id || ev.lieu?.lieu_id || '';
    if (
      !matchesFilters(
        ev.categorie,
        lieuId,
        ev.genre || '',
        categories,
        lieuIds,
        genres,
      )
    )
      continue;
    fallbackItems.push({
      kind: 'fallback',
      key: `e:${ev.event_id}:${dayIso}`,
      dayIso,
      evenement: ev,
      lieu: ev.lieu,
    });
  }

  return sortDayItems([...programmeItems, ...fallbackItems], {
    deprioritizeCinema: categories.length === 0,
  });
}

/** First YYYY-MM-DD of an event that intersects [rangeStart, rangeEnd], or null. */
function firstCoveredDayInRange(
  ev: Evenement,
  rangeStart: string,
  rangeEnd: string,
): string | null {
  const start = ev.date_debut;
  const end = ev.date_fin || ev.date_debut;
  if (!start) return null;
  if (end < rangeStart || start > rangeEnd) return null;
  if (start >= rangeStart && start <= rangeEnd) return start;
  return rangeStart;
}

/**
 * One-pass agenda for an inclusive YYYY-MM-DD range (search / multi-day).
 * Programme rows in range + at most one fallback card per event_id
 * (first covered day), same idea as itemsForMonth.
 */
export function itemsForDateRange(
  programme: ProgrammeWithContext[],
  events: EventWithDetails[],
  startIso: string,
  endIso: string,
  categories: string[] = [],
  lieuIds: string[] = [],
  genres: string[] = [],
): DayItem[] {
  if (!startIso || !endIso || endIso < startIso) return [];

  const programmeItems: DayItem[] = programme
    .filter((p) => {
      const d = p.programme.date;
      if (!d || d < startIso || d > endIso) return false;
      return isProgrammePublishable(p);
    })
    .filter((p) =>
      matchesFilters(
        categorieOf(p),
        lieuIdOf(p),
        genreOfProgramme(p),
        categories,
        lieuIds,
        genres,
      ),
    )
    .map((p) => ({
      kind: 'programme' as const,
      key: `p:${p.programme.programme_id}`,
      dayIso: p.programme.date,
      programme: p.programme,
      evenement: p.evenement,
      lieu: p.lieu,
    }));

  const eventIdsWithProgrammeInRange = new Set(
    programmeItems
      .map((i) => (i.kind === 'programme' ? i.programme.event_id : ''))
      .filter(Boolean),
  );

  const fallbackItems: DayItem[] = [];
  for (const ev of events) {
    if (!isPublishableEvent(ev)) continue;
    if (eventIdsWithProgrammeInRange.has(ev.event_id)) continue;
    const dayIso = firstCoveredDayInRange(ev, startIso, endIso);
    if (!dayIso) continue;
    const lieuId = ev.lieu_id || ev.lieu?.lieu_id || '';
    if (
      !matchesFilters(
        ev.categorie,
        lieuId,
        ev.genre || '',
        categories,
        lieuIds,
        genres,
      )
    )
      continue;
    fallbackItems.push({
      kind: 'fallback',
      key: `e:${ev.event_id}:${dayIso}`,
      dayIso,
      evenement: ev,
      lieu: ev.lieu,
    });
  }

  return sortDayItems([...programmeItems, ...fallbackItems], {
    deprioritizeCinema: categories.length === 0,
  });
}

/**
 * Calendar badges: programme items that day + fallback only if
 * spanDays <= 7 OR dayIso === date_debut (or first day in month).
 * Long expos don't put +1 on every day.
 */
export function countItemsByDay(
  programme: ProgrammeWithContext[],
  events: EventWithDetails[],
  year: number,
  month: number, // 1-12
  categories: string[] = [],
  lieuIds: string[] = [],
  genres: string[] = [],
): Map<string, number> {
  const counts = new Map<string, number>();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Programme counts per day
  for (const p of programme) {
    const d = p.programme.date;
    if (!d || d < monthStart || d > monthEnd) continue;
    if (!isProgrammePublishable(p)) continue;
    if (
      !matchesFilters(
        categorieOf(p),
        lieuIdOf(p),
        genreOfProgramme(p),
        categories,
        lieuIds,
        genres,
      )
    )
      continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  // Event ids with programme on a given day (for fallback exclusion that day)
  const programmeEventIdsByDay = new Map<string, Set<string>>();
  for (const p of programme) {
    const d = p.programme.date;
    if (!d || d < monthStart || d > monthEnd) continue;
    if (!isProgrammePublishable(p)) continue;
    if (!p.programme.event_id) continue;
    let set = programmeEventIdsByDay.get(d);
    if (!set) {
      set = new Set();
      programmeEventIdsByDay.set(d, set);
    }
    set.add(p.programme.event_id);
  }

  for (const ev of events) {
    if (!isPublishableEvent(ev)) continue;
    const lieuId = ev.lieu_id || ev.lieu?.lieu_id || '';
    if (
      !matchesFilters(
        ev.categorie,
        lieuId,
        ev.genre || '',
        categories,
        lieuIds,
        genres,
      )
    )
      continue;

    const span = eventSpanDays(ev);
    const firstInMonth = firstCoveredDayInMonth(ev, year, month);
    if (!firstInMonth) continue;

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (!eventOccursOnDay(ev, iso)) continue;
      if (programmeEventIdsByDay.get(iso)?.has(ev.event_id)) continue;

      // Count fallback only if short span OR this is date_debut / first day in month
      const isAnchor =
        iso === ev.date_debut || iso === firstInMonth;
      if (span > 7 && !isAnchor) continue;

      counts.set(iso, (counts.get(iso) ?? 0) + 1);
    }
  }

  return counts;
}

/** Lieux that appear in programme (or event fallback) for a given day or month, after category/genre filters. */
export function lieuxForDay(
  programme: ProgrammeWithContext[],
  events: EventWithDetails[],
  dayIso: string | null,
  categories: string[] = [],
  year?: number,
  month?: number,
  genres: string[] = [],
): Lieu[] {
  let items: DayItem[];
  if (dayIso) {
    items = itemsForDay(programme, events, dayIso, categories, [], genres);
  } else if (year != null && month != null) {
    items = itemsForMonth(
      programme,
      events,
      year,
      month,
      categories,
      [],
      genres,
    );
  } else {
    // Overall: unique lieux from programme with dates + events
    const map = new Map<string, Lieu>();
    for (const p of programme) {
      if (!p.lieu) continue;
      if (!isProgrammePublishable(p)) continue;
      if (
        !matchesMainCategories(
          categorieOf(p),
          genreOfProgramme(p),
          categories,
        )
      )
        continue;
      if (genres.length > 0 && !genres.includes(genreOfProgramme(p))) continue;
      map.set(p.lieu.lieu_id, p.lieu);
    }
    for (const ev of events) {
      if (!ev.lieu) continue;
      if (!isPublishableEvent(ev)) continue;
      if (!matchesMainCategories(ev.categorie, ev.genre || '', categories))
        continue;
      if (genres.length > 0 && !genres.includes(ev.genre || '')) continue;
      map.set(ev.lieu.lieu_id, ev.lieu);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.nom.localeCompare(b.nom, 'fr'),
    );
  }

  const map = new Map<string, Lieu>();
  for (const item of items) {
    if (item.lieu) map.set(item.lieu.lieu_id, item.lieu);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.nom.localeCompare(b.nom, 'fr'),
  );
}

/**
 * Genre slugs present in items matching category/lieu/date filters
 * (genre filter intentionally omitted so chips stay discoverable).
 */
export function genresForSelection(
  programme: ProgrammeWithContext[],
  events: EventWithDetails[],
  dayIso: string | null,
  categories: string[] = [],
  lieuIds: string[] = [],
  year?: number,
  month?: number,
): string[] {
  let items: DayItem[];
  if (dayIso) {
    items = itemsForDay(programme, events, dayIso, categories, lieuIds, []);
  } else if (year != null && month != null) {
    items = itemsForMonth(
      programme,
      events,
      year,
      month,
      categories,
      lieuIds,
      [],
    );
  } else {
    return [];
  }
  const set = new Set<string>();
  for (const item of items) {
    const g = genreOfItem(item);
    if (g) set.add(g);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}

/** @deprecated Use itemsForDay */
export function eventsForDay(
  events: EventWithDetails[],
  dayIso: string,
  categories: string[],
): EventWithDetails[] {
  return events.filter((ev) => {
    if (!isPublishableEvent(ev)) return false;
    if (!eventOccursOnDay(ev, dayIso)) return false;
    if (!matchesMainCategories(ev.categorie, ev.genre || '', categories))
      return false;
    return true;
  });
}

/** @deprecated Use countItemsByDay */
export function countEventsByDay(
  events: EventWithDetails[],
  year: number,
  month: number,
  categories: string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const n = eventsForDay(events, iso, categories).length;
    if (n > 0) counts.set(iso, n);
  }
  return counts;
}
