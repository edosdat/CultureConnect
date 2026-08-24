'use client';

import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import type { DayItem } from '@/lib/types';
import SeanceCard from './SeanceCard';

type Props = {
  items: DayItem[];
  showDate?: boolean;
  onSelectItem: (key: string) => void;
  onSelectVenue?: (lieuId: string) => void;
  empty?: ReactNode;
  /** After densify: show at most this many cards (infinite scroll). */
  visibleCount?: number;
  onLoadMore?: () => void;
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
function densify(items: DayItem[]): DenseRow[] {
  const groups = new Map<string, DayItem[]>();
  const order: string[] = [];
  const filmFlags = new Map<string, boolean>();

  for (const item of items) {
    let groupKey = item.key;
    let isFilm = false;
    if (item.kind === 'programme') {
      const filmId = (item.programme.film_id || '').trim();
      if (filmId) {
        groupKey = `film:${filmId}`;
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
      : [...g].sort((a, b) => heureKey(a).localeCompare(heureKey(b)))[0];
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

/** Card count after film_id / créneau collapse (for agenda counters). */
export function densifiedCardCount(items: DayItem[]): number {
  return densify(items).length;
}

export default function SeanceGrid({
  items,
  showDate = false,
  onSelectItem,
  onSelectVenue,
  empty,
  visibleCount,
  onLoadMore,
}: Props) {
  const rows = useMemo(() => densify(items), [items]);
  const limited =
    visibleCount != null ? rows.slice(0, Math.max(0, visibleCount)) : rows;
  const hasMore =
    visibleCount != null && onLoadMore != null && limited.length < rows.length;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    let locked = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) {
          locked = false;
          return;
        }
        if (locked) return;
        locked = true;
        // Defer so React can paint the next batch before we ask again.
        timer = setTimeout(() => {
          onLoadMoreRef.current?.();
        }, 50);
      },
      { root: null, rootMargin: '240px', threshold: 0 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [hasMore, visibleCount, limited.length]);

  if (items.length === 0) {
    return <div className="py-10">{empty}</div>;
  }

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {limited.map(
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
                showDate={showDate}
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

      {hasMore ? (
        <div className="flex flex-col items-center gap-3 pt-1">
          <div
            ref={sentinelRef}
            className="h-px w-full"
            aria-hidden
          />
          <button
            type="button"
            onClick={() => onLoadMore?.()}
            className="rounded-full border border-culture-line bg-culture-surface px-5 py-2.5 text-sm font-medium text-culture-ink shadow-sm hover:border-culture-terracotta/50"
          >
            Voir plus
          </button>
        </div>
      ) : null}
    </div>
  );
}