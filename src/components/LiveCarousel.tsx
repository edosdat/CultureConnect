'use client';

import { useRef } from 'react';
import type { DenseRow } from '@/lib/densify';
import { formatLieuAffiche } from '@/lib/labels';
import { itemPitch, itemTitle, seanceWhen } from '@/lib/displayHome';
import VisualFallback, { categoryLabelOf } from './VisualFallback';
import FavoriteButton from './FavoriteButton';

type Props = {
  rows: DenseRow[];
  onSelectItem: (key: string) => void;
  reasonFor?: (item: DenseRow['item']) => string | null;
};

function imageUrl(row: DenseRow): string {
  const item = row.item;
  if (item.kind === 'programme') {
    return (
      (item.programme.image_url || '').trim() ||
      (item.evenement?.image_url || '').trim()
    );
  }
  return (item.evenement.image_url || '').trim();
}

export default function LiveCarousel({ rows, onSelectItem, reasonFor }: Props) {
  const stripRef = useRef<HTMLUListElement | null>(null);

  function scroll(dir: -1 | 1) {
    stripRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  }

  return (
    <div className="relative">
      <ul
        ref={stripRef}
        aria-label="En live"
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rows.map((row) => {
          const item = row.item;
          const image = imageUrl(row);
          const cat = categoryLabelOf(item);
          const when = seanceWhen(item, row.earliestHeure);
          const reason = reasonFor?.(item);
          return (
            <li
              key={row.groupKey}
              className="w-[17.5rem] shrink-0 snap-start sm:w-[21rem]"
            >
              <button
                type="button"
                onClick={() => onSelectItem(item.key)}
                className="group flex w-full flex-col overflow-hidden rounded-card border border-culture-line bg-culture-surface text-left shadow-card"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <VisualFallback item={item} />
                  )}
                  {cat ? (
                    <span className="absolute left-2 top-2 rounded bg-culture-terracotta px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                      {cat}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-culture-terracotta">
                      {when}
                    </p>
                    <span onClick={(e) => e.stopPropagation()}>
                      <FavoriteButton itemKey={item.key} className="h-9 w-9" />
                    </span>
                  </div>
                  <h3 className="font-display text-xl leading-snug text-culture-ink line-clamp-2">
                    {itemTitle(item)}
                  </h3>
                  {itemPitch(item) ? (
                    <p className="line-clamp-3 text-sm leading-snug text-culture-ink">
                      {itemPitch(item)}
                    </p>
                  ) : null}
                  {item.lieu ? (
                    <p className="text-sm font-semibold text-culture-ink">
                      {formatLieuAffiche(item.lieu)}
                    </p>
                  ) : null}
                  {reason ? (
                    <p className="text-xs italic text-culture-terracotta">{reason}</p>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length > 2 ? (
        <>
          <button
            type="button"
            aria-label="Précédent"
            onClick={() => scroll(-1)}
            className="absolute left-0 top-1/3 hidden h-10 w-10 -translate-x-1 items-center justify-center rounded-full border border-culture-line bg-culture-surface/95 shadow-sm md:flex"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Suivant"
            onClick={() => scroll(1)}
            className="absolute right-0 top-1/3 hidden h-10 w-10 translate-x-1 items-center justify-center rounded-full border border-culture-line bg-culture-surface/95 shadow-sm md:flex"
          >
            ›
          </button>
        </>
      ) : null}
    </div>
  );
}
