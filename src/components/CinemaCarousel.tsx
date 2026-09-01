'use client';

import { useEffect, useRef, useState } from 'react';
import type { DayItem } from '@/lib/types';
import type { DenseRow } from '@/lib/densify';
import { formatHeure, formatLieuAffiche } from '@/lib/labels';
import { itemPitch, itemTitle } from '@/lib/displayHome';
import VisualFallback, { categoryLabelOf } from './VisualFallback';
import FavoriteButton from './FavoriteButton';

type Props = {
  rows: DenseRow[];
  onSelectItem: (key: string) => void;
  mobile?: boolean;
};

function posterUrl(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.image_url || '').trim() ||
      (item.evenement?.image_url || '').trim()
    );
  }
  return (item.evenement.image_url || '').trim();
}

function nextTime(row: DenseRow): string {
  if (row.earliestHeure) return formatHeure(row.earliestHeure);
  const item = row.item;
  if (item.kind === 'programme') return formatHeure(item.programme.heure_debut);
  return formatHeure(item.evenement.heure_debut);
}

function FilmThumb({
  row,
  onSelect,
  active,
}: {
  row: DenseRow;
  onSelect: (key: string) => void;
  active?: boolean;
}) {
  const item = row.item;
  const image = posterUrl(item);
  const time = nextTime(row);
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-current={active ? 'true' : undefined}
      className={
        'flex w-[7.5rem] shrink-0 flex-col text-left sm:w-[8.5rem] ' +
        (active ? 'opacity-100' : 'opacity-95')
      }
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-culture-line bg-culture-sand">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <VisualFallback item={item} compact />
        )}
        {time ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-culture-ink/85 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {time}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-culture-ink">
        {itemTitle(item)}
      </p>
      {itemPitch(item) ? (
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-culture-muted">
          {itemPitch(item)}
        </p>
      ) : null}
    </button>
  );
}

export default function CinemaCarousel({
  rows,
  onSelectItem,
  mobile = false,
}: Props) {
  const [heroIndex, setHeroIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const hero = rows[heroIndex] ?? rows[0];

  useEffect(() => {
    if (heroIndex > rows.length - 1) setHeroIndex(0);
  }, [heroIndex, rows.length]);

  function scrollStrip(dir: -1 | 1) {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 220, behavior: 'smooth' });
  }

  if (!hero) return null;

  if (mobile) {
    return (
      <div
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Films"
      >
        {rows.map((row) => (
          <div key={row.groupKey} className="snap-start">
            <FilmThumb row={row} onSelect={onSelectItem} />
          </div>
        ))}
      </div>
    );
  }

  const item = hero.item;
  const image = posterUrl(item);
  const time = nextTime(hero);
  const venue = formatLieuAffiche(item.lieu);
  const cat = categoryLabelOf(item);

  return (
    <div className="space-y-3">
      <div className="grid overflow-hidden rounded-card-lg border border-culture-line bg-culture-surface shadow-card md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
        <div className="relative min-h-[12rem] md:min-h-[18rem]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <VisualFallback item={item} />
          )}
        </div>
        <div className="flex flex-col gap-2 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex rounded bg-culture-terracotta px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              {cat || 'Cinéma'}
            </span>
            <FavoriteButton itemKey={item.key} />
          </div>
          <h3 className="font-display text-2xl leading-snug text-culture-ink">
            {itemTitle(item)}
          </h3>
          {itemPitch(item) ? (
            <p className="line-clamp-4 text-sm leading-relaxed text-culture-ink">
              {itemPitch(item)}
            </p>
          ) : null}
          <p className="mt-auto text-sm text-culture-muted">
            {[venue, time].filter(Boolean).join(' • ')}
          </p>
          <button
            type="button"
            onClick={() => onSelectItem(item.key)}
            className="mt-1 inline-flex min-h-10 w-fit items-center rounded-full bg-culture-terracotta px-5 py-2 text-sm font-semibold text-white hover:bg-culture-clay"
          >
            Voir les séances
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={stripRef}
          className="flex gap-3 overflow-x-auto scroll-px-2 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {rows.map((row, i) => (
            <FilmThumb
              key={row.groupKey}
              row={row}
              onSelect={(key) => {
                setHeroIndex(i);
                onSelectItem(key);
              }}
              active={i === heroIndex}
            />
          ))}
        </div>
        {rows.length > 4 ? (
          <>
            <button
              type="button"
              aria-label="Films précédents"
              onClick={() => scrollStrip(-1)}
              className="absolute left-0 top-1/3 hidden h-10 w-10 -translate-x-1 items-center justify-center rounded-full border border-culture-line bg-culture-surface/95 text-culture-ink shadow-sm md:flex"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Films suivants"
              onClick={() => scrollStrip(1)}
              className="absolute right-0 top-1/3 hidden h-10 w-10 translate-x-1 items-center justify-center rounded-full border border-culture-line bg-culture-surface/95 text-culture-ink shadow-sm md:flex"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
