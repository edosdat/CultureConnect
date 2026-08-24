'use client';

import type { ReactNode } from 'react';

import type { DayItem } from '@/lib/types';
import SeanceCard from './SeanceCard';

type Props = {
  items: DayItem[];
  showDate?: boolean;
  onSelectItem: (key: string) => void;
  onSelectVenue?: (lieuId: string) => void;
  empty?: ReactNode;
  /** Active search → 1 card per film_id. Agenda → per day (several Vaiana OK). */
  collapseFilmsById?: boolean;
};

type DenseRow = {
  item: DayItem;
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

function pickRepresentative(g: DayItem[]): DayItem {
  const ranked = [...g].sort((a, b) => {
    const img = Number(hasImage(b)) - Number(hasImage(a));
    if (img !== 0) return img;
    const day = a.dayIso.localeCompare(b.dayIso);
    if (day !== 0) return day;
    return heureKey(a).localeCompare(heureKey(b));
  });
  return ranked[0]!;
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
 * - search: one card per film_id across the list
 * - agenda: one card per film_id per day
 * - else: same event_id+day+title → +N créneaux
 */
function densify(items: DayItem[], collapseFilmsById: boolean): DenseRow[] {
  const groups = new Map<string, DayItem[]>();
  const order: string[] = [];
  const filmFlags = new Map<string, boolean>();

  for (const item of items) {
    let groupKey = item.key;
    let isFilm = false;
    if (item.kind === 'programme') {
      const filmId = (item.programme.film_id || '').trim();
      if (filmId) {
        groupKey = collapseFilmsById
          ? `film:${filmId}`
          : `film:${item.dayIso}:${filmId}`;
        isFilm = true;
      } else if (item.programme.event_id) {
        groupKey = `p:${item.dayIso}:${item.programme.event_id}:${item.programme.nom_item}`;
      }
    }
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      order.push(groupKey);
      filmFlags.set(groupKey, isFilm);
    }
    groups.get(groupKey)!.push(item);
  }

  return order.map((k) => {
    const g = groups.get(k)!;
    const isFilmGroup = filmFlags.get(k) === true;
    const item = isFilmGroup
      ? pickRepresentative(g)
      : [...g].sort((a, b) => heureKey(a).localeCompare(heureKey(b)))[0]!;
    const venues = new Set(
      g.map((i) => i.lieu?.lieu_id).filter((id): id is string => Boolean(id)),
    );
    return {
      item,
      groupKey: k,
      extraSlots: g.length - 1,
      salleCount: isFilmGroup ? venues.size : 0,
      earliestHeure: isFilmGroup ? earliestHeureOf(g) : '',
      citiesSummary: isFilmGroup ? citiesSummaryOf(g) : '',
      isFilmGroup,
    };
  });
}

export default function SeanceGrid({
  items,
  showDate = false,
  onSelectItem,
  onSelectVenue,
  empty,
  collapseFilmsById = false,
}: Props) {
  if (items.length === 0) {
    return <div className="py-10">{empty}</div>;
  }

  const rows = densify(items, collapseFilmsById);

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(
        ({
          item,
          groupKey,
          extraSlots,
          salleCount,
          earliestHeure,
          citiesSummary,
          isFilmGroup,
        }) => (
          <li key={groupKey} className="min-w-0">
            <SeanceCard
              item={item}
              showDate={isFilmGroup ? false : showDate}
              onSelect={onSelectItem}
              onSelectVenue={onSelectVenue}
              extraSlots={isFilmGroup ? 0 : extraSlots}
              salleCount={salleCount}
              earliestHeure={earliestHeure}
              citiesSummary={citiesSummary}
            />
          </li>
        ),
      )}
    </ul>
  );
}
