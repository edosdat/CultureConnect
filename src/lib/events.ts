import type {
  DayItem,
  Evenement,
  EventWithDetails,
  Lieu,
  ProgrammeWithContext,
} from './types';
import { matchesMainCategories } from './categories';

/** @deprecated Prefer MAIN_CATEGORIES — kept for callers that still list raw CSV values. */
export function getCategories(events: Evenement[]): string[] {
  return Array.from(new Set(events.map((e) => e.categorie).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, 'fr'),
  );
}

/** Inclusive YYYY-MM-DD range helper */
export function eventOccursOnDay(event: Evenement, dayIso: string): boolean {
  const start = event.date_debut;
  const end = event.date_fin || event.date_debut;
  if (!start) return false;
  return start <= dayIso && end >= dayIso;
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
  const programmeThatDay = programme.filter((p) => p.programme.date === dayIso);
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

  const all = [...programmeItems, ...fallbackItems];
  all.sort((a, b) => {
    const ha =
      a.kind === 'programme'
        ? sortKeyHeure(a.programme.heure_debut)
        : sortKeyHeure(a.evenement.heure_debut);
    const hb =
      b.kind === 'programme'
        ? sortKeyHeure(b.programme.heure_debut)
        : sortKeyHeure(b.evenement.heure_debut);
    if (ha !== hb) return ha.localeCompare(hb);
    const ta =
      a.kind === 'programme' ? a.programme.nom_item : a.evenement.titre;
    const tb =
      b.kind === 'programme' ? b.programme.nom_item : b.evenement.titre;
    return ta.localeCompare(tb, 'fr');
  });
  return all;
}

/**
 * Month agenda: all programme + fallback items for days in the month,
 * matching filters, sorted by date then heure.
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
  const all: DayItem[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    all.push(
      ...itemsForDay(programme, events, iso, categories, lieuIds, genres),
    );
  }
  all.sort((a, b) => {
    if (a.dayIso !== b.dayIso) return a.dayIso.localeCompare(b.dayIso);
    const ha =
      a.kind === 'programme'
        ? sortKeyHeure(a.programme.heure_debut)
        : sortKeyHeure(a.evenement.heure_debut);
    const hb =
      b.kind === 'programme'
        ? sortKeyHeure(b.programme.heure_debut)
        : sortKeyHeure(b.evenement.heure_debut);
    if (ha !== hb) return ha.localeCompare(hb);
    const ta =
      a.kind === 'programme' ? a.programme.nom_item : a.evenement.titre;
    const tb =
      b.kind === 'programme' ? b.programme.nom_item : b.evenement.titre;
    return ta.localeCompare(tb, 'fr');
  });
  return all;
}

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
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const n = itemsForDay(
      programme,
      events,
      iso,
      categories,
      lieuIds,
      genres,
    ).length;
    if (n > 0) counts.set(iso, n);
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
