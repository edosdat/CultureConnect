'use client';

import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import type { DayItem } from '@/lib/types';
import { densify, densifiedCardCount } from '@/lib/densify';
import { filmIdOfItem } from '@/lib/nouveautesCine';
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
  /** Server still has pages beyond the items already in memory. */
  hasMoreRemote?: boolean;
  nouveauFilmIds?: ReadonlySet<string>;
};

export { densifiedCardCount };

export default function SeanceGrid({
  items,
  showDate = false,
  onSelectItem,
  onSelectVenue,
  empty,
  visibleCount,
  onLoadMore,
  hasMoreRemote = false,
  nouveauFilmIds,
}: Props) {
  const rows = useMemo(() => densify(items), [items]);
  const limited =
    visibleCount != null ? rows.slice(0, Math.max(0, visibleCount)) : rows;
  const hasMore =
    visibleCount != null &&
    onLoadMore != null &&
    (limited.length < rows.length || hasMoreRemote);

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
  }, [hasMore, visibleCount, limited.length, hasMoreRemote]);

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
                nouveau={Boolean(
                  nouveauFilmIds &&
                    filmIdOfItem(item) &&
                    nouveauFilmIds.has(filmIdOfItem(item)),
                )}
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