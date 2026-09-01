import type { DayItem } from './types';
import { seanceDateIso } from './timeScope';
import { itemSortKm, type GeoPos } from './nearMe';

export type DenseRow = {
  item: DayItem;
  /** Filtered séances in this film/event group (source of truth for horaires). */
  seances: DayItem[];
  groupKey: string;
  extraSlots: number;
  salleCount: number;
  earliestHeure: string;
  citiesSummary: string;
  isFilmGroup: boolean;
};

function heureKey(item: DayItem): string {
  if (item.kind === 'programme') return item.programme.heure_debut || '99:99';
  return item.evenement.heure_debut || '99:99';
}

function hasImage(item: DayItem): boolean {
  if (item.kind === 'programme') {
    return Boolean(
      (item.programme.image_url || '').trim() ||
        (item.evenement?.image_url || '').trim(),
    );
  }
  return Boolean((item.evenement.image_url || '').trim());
}

/** Earliest Paris calendar séance in the group — never a later day with a nicer poster. */
function pickRepresentative(g: DayItem[], origin?: GeoPos | null): DayItem {
  if (origin) {
    const ranked = [...g].sort((a, b) => {
      const da = itemSortKm(a, origin);
      const db = itemSortKm(b, origin);
      if (da !== db) return da - db;
      const day = seanceDateIso(a).localeCompare(seanceDateIso(b));
      if (day !== 0) return day;
      return heureKey(a).localeCompare(heureKey(b));
    });
    return ranked[0];
  }
  const ranked = [...g].sort((a, b) => {
    const da = seanceDateIso(a);
    const db = seanceDateIso(b);
    if (da !== db) return da.localeCompare(db);
    const ha = heureKey(a).localeCompare(heureKey(b));
    if (ha !== 0) return ha;
    return Number(hasImage(b)) - Number(hasImage(a));
  });
  return ranked[0];
}

function earliestHeureOf(g: DayItem[]): string {
  let best = '';
  for (const item of g) {
    const h = heureKey(item);
    if (!h || h === '99:99') continue;
    const slice = h.slice(0, 5);
    if (!best || slice < best) best = slice;
  }
  return best;
}

function citiesSummaryOf(g: DayItem[]): string {
  const cities: string[] = [];
  const seen = new Set<string>();
  for (const item of g) {
    const c = (item.lieu?.commune || '').trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    cities.push(c);
  }
  if (cities.length <= 1) return cities[0] || '';
  if (cities.length <= 3) return cities.join(', ');
  return `${cities.slice(0, 2).join(', ')}…`;
}

/**
 * Soft-collapse:
 * - same film_id across the whole list → one card (N salles · dès HH:MM)
 * - else same event_id+day+title → +N créneaux
 */
export function densifyGroupKey(item: DayItem): string {
  if (item.kind === 'programme') {
    const filmId = (item.programme.film_id || '').trim();
    if (filmId) return `film:${filmId}`;
    if (item.programme.event_id) {
      return `p:${item.dayIso}:${item.programme.event_id}:${item.programme.nom_item}`;
    }
  }
  return item.key;
}

export function densify(
  items: DayItem[],
  opts?: { origin?: GeoPos | null },
): DenseRow[] {
  const groups = new Map<string, DayItem[]>();
  const order: string[] = [];
  const filmFlags = new Map<string, boolean>();
  const origin = opts?.origin ?? null;

  for (const item of items) {
    const groupKey = densifyGroupKey(item);
    const isFilm = groupKey.startsWith('film:');
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      order.push(groupKey);
      filmFlags.set(groupKey, isFilm);
    }
    groups.get(groupKey)!.push(item);
  }

  const rows = order.map((k) => {
    const g = groups.get(k)!;
    const isFilmGroup = filmFlags.get(k) === true;
    const item = isFilmGroup
      ? pickRepresentative(g, origin)
      : origin
        ? pickRepresentative(g, origin)
        : [...g].sort((a, b) => {
            const da = seanceDateIso(a).localeCompare(seanceDateIso(b));
            if (da !== 0) return da;
            return heureKey(a).localeCompare(heureKey(b));
          })[0];
    const venues = new Set(
      g.map((i) => i.lieu?.lieu_id).filter((id): id is string => Boolean(id)),
    );
    return {
      item,
      seances: g,
      groupKey: k,
      extraSlots: Math.max(0, g.length - 1),
      salleCount: isFilmGroup ? venues.size : 0,
      earliestHeure: isFilmGroup ? earliestHeureOf(g) : '',
      citiesSummary: isFilmGroup ? citiesSummaryOf(g) : '',
      isFilmGroup,
    };
  });
  if (!origin) return rows;
  return [...rows].sort((a, b) => {
    const da = Math.min(...a.seances.map((s) => itemSortKm(s, origin)));
    const db = Math.min(...b.seances.map((s) => itemSortKm(s, origin)));
    return da - db;
  });
}

/** Card count after film_id / créneau collapse (for agenda counters). */
export function densifiedCardCount(items: DayItem[]): number {
  if (items.length <= 1) return items.length;
  const keys = new Set<string>();
  for (const item of items) keys.add(densifyGroupKey(item));
  return keys.size;
}
