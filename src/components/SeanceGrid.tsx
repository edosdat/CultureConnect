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
import { top3GridClass, visibleTop3Items } from '@/lib/displayHome';
import SeanceCard, { type SeanceCardVariant } from './SeanceCard';

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
  /** Top 3: only real reco cards (1–3). Empty slots are omitted, not placeholders. */
  fixedSlots?: boolean;
  variant?: SeanceCardVariant;
  /** Reco why-line (Ton top 3 only). Catalogue grids omit this. */
  reasonFor?: (item: DayItem) => string | null;
};

export { densifiedCardCount };

const GRID_CLASS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';

function cardNouveau(
  item: DayItem,
  nouveauFilmIds: ReadonlySet<string> | undefined,
): boolean {
  return Boolean(
    nouveauFilmIds &&
      filmIdOfItem(item) &&
      nouveauFilmIds.has(filmIdOfItem(item)),
  );
}

/** 1–3 real reco cards. Omit empty slots — no placeholder cells. */
function FixedSlotsGrid({
  items,
  showDate,
  onSelectItem,
  onSelectVenue,
  nouveauFilmIds,
  reasonFor,
}: Pick<
  Props,
  | 'items'
  | 'showDate'
  | 'onSelectItem'
  | 'onSelectVenue'
  | 'nouveauFilmIds'
  | 'reasonFor'
>) {
  const visible = visibleTop3Items(items);
  if (visible.length === 0) return null;
  // 3-up keeps the compact rail. 1–2 cards use the stacked tile so they
  // actually fill the row (full width / 50-50) instead of a left-aligned strip.
  const cardVariant = visible.length === 3 ? 'rail' : 'default';
  return (
    <div className="space-y-4">
      <ul
        className={top3GridClass(visible.length)}
        data-top3-count={visible.length}
      >
        {visible.map((item) => (
          <li key={item.key} className="min-w-0 w-full">
            <SeanceCard
              item={item}
              showDate={showDate}
              onSelect={onSelectItem}
              onSelectVenue={onSelectVenue}
              nouveau={cardNouveau(item, nouveauFilmIds)}
              variant={cardVariant}
              reason={reasonFor?.(item) ?? null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  fixedSlots = false,
  variant,
  reasonFor,
}: Props) {
  if (fixedSlots) {
    return (
      <FixedSlotsGrid
        items={items}
        showDate={showDate}
        onSelectItem={onSelectItem}
        onSelectVenue={onSelectVenue}
        nouveauFilmIds={nouveauFilmIds}
        reasonFor={reasonFor}
      />
    );
  }

  return (
    <DensifiedGrid
      items={items}
      showDate={showDate}
      onSelectItem={onSelectItem}
      onSelectVenue={onSelectVenue}
      empty={empty}
      visibleCount={visibleCount}
      onLoadMore={onLoadMore}
      hasMoreRemote={hasMoreRemote}
      nouveauFilmIds={nouveauFilmIds}
      variant={variant}
      reasonFor={reasonFor}
    />
  );
}

function DensifiedGrid({
  items,
  showDate = false,
  onSelectItem,
  onSelectVenue,
  empty,
  visibleCount,
  onLoadMore,
  hasMoreRemote = false,
  nouveauFilmIds,
  variant,
  reasonFor,
}: Omit<Props, 'fixedSlots'>) {
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
      <ul className={GRID_CLASS}>
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
                nouveau={cardNouveau(item, nouveauFilmIds)}
                variant={variant}
                reason={reasonFor?.(item) ?? null}
              />
            </li>
          ),
        )}
      </ul>

      {hasMore ? (
        <div
          ref={sentinelRef}
          className="h-10 w-full"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
