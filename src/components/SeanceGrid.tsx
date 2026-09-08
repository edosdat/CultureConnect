'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { DayItem } from '@/lib/types';
import { densify, densifiedCardCount } from '@/lib/densify';
import { filmIdOfItem } from '@/lib/nouveautesCine';
import {
  TOP3_INDICATOR_CLASS,
  top3CardFrameClass,
  top3IndicatorLabel,
  top3SlideIndex,
  top3TrackClass,
  top3UsesMobileCarousel,
  visibleTop3Items,
  visibleTop3Nearest,
} from '@/lib/displayHome';
import { itemKmLabel, minKmLabel, type GeoPos } from '@/lib/nearMe';
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
  /** Reco why-line (Top 3 only). Catalogue grids omit this. */
  reasonFor?: (item: DayItem) => string | null;
  /** Tab-only GPS origin. Sort + « 2,3 km » when venue coords exist. */
  origin?: GeoPos | null;
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

function carouselStride(el: HTMLElement): number {
  const first = el.firstElementChild as HTMLElement | null;
  if (!first) return 0;
  const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0;
  return first.offsetWidth + gap;
}

function Top3CarouselIndicator({
  count,
  index,
  onSelect,
}: {
  count: number;
  index: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      className={TOP3_INDICATOR_CLASS}
      data-top3-indicator=""
      data-top3-slide={index + 1}
    >
      <div className="flex items-center gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}/${count}`}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => onSelect(i)}
            className={
              'h-2 rounded-full transition ' +
              (i === index
                ? 'w-4 bg-culture-terracotta'
                : 'w-2 bg-culture-line')
            }
          />
        ))}
      </div>
      <span className="text-xs tabular-nums text-culture-muted" aria-live="polite">
        {top3IndicatorLabel(index, count)}
      </span>
    </div>
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
  origin,
}: Pick<
  Props,
  | 'items'
  | 'showDate'
  | 'onSelectItem'
  | 'onSelectVenue'
  | 'nouveauFilmIds'
  | 'reasonFor'
  | 'origin'
>) {
  const visible = origin
    ? visibleTop3Nearest(items, origin)
    : visibleTop3Items(items);
  const count = visible.length;
  const carousel = top3UsesMobileCarousel(count);
  const scrollerRef = useRef<HTMLUListElement | null>(null);
  const [slide, setSlide] = useState(0);

  if (count === 0) return null;
  // Compact rail cards (1–3). <md: horizontal snap carousel with peek.
  // md+: existing top3GridClass row. source=top3 hides pitch.
  const cardVariant = 'rail';

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    setSlide(top3SlideIndex(el.scrollLeft, carouselStride(el), count));
  }

  function goTo(i: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const stride = carouselStride(el);
    if (stride <= 0) return;
    el.scrollTo({ left: i * stride, behavior: 'smooth' });
  }

  return (
    <div>
      <ul
        ref={scrollerRef}
        onScroll={carousel ? onScroll : undefined}
        className={top3TrackClass(count)}
        data-top3-count={count}
        data-top3-carousel={carousel ? '' : undefined}
        aria-roledescription={carousel ? 'carousel' : undefined}
        aria-label={carousel ? `Le top ${count} du moment` : undefined}
      >
        {visible.map((item) => (
          <li key={item.key} className={top3CardFrameClass(count)}>
            <SeanceCard
              item={item}
              showDate={showDate}
              onSelect={onSelectItem}
              onSelectVenue={onSelectVenue}
              nouveau={cardNouveau(item, nouveauFilmIds)}
              variant={cardVariant}
              source="top3"
              reason={reasonFor?.(item) ?? null}
              distanceKm={itemKmLabel(item, origin)}
            />
          </li>
        ))}
      </ul>
      {carousel ? (
        <Top3CarouselIndicator count={count} index={slide} onSelect={goTo} />
      ) : null}
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
  origin,
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
        origin={origin}
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
      origin={origin}
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
  origin,
}: Omit<Props, 'fixedSlots'>) {
  const rows = useMemo(
    () => densify(items, origin ? { origin } : undefined),
    [items, origin],
  );
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
            seances,
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
                distanceKm={
                  origin
                    ? minKmLabel(seances ?? [item], origin) ??
                      itemKmLabel(item, origin)
                    : null
                }
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
