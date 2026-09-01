'use client';

import type { DayItem } from '@/lib/types';
import { catCssVar } from '@/lib/categoryColor';
import { MAIN_CATEGORY_LABELS, mainFromCategorie, mainFromGenreSlug } from '@/lib/categories';
import { labelCategorie } from '@/lib/labels';
import { itemTitle, itemVenue, moodFallbackHex } from '@/lib/displayHome';

function categoryLabelFor(item: DayItem): string {
  if (item.kind === 'programme') {
    const cat = item.evenement?.categorie ?? '';
    const main = mainFromCategorie(cat) ?? mainFromGenreSlug(item.programme.genre);
    if (main) return MAIN_CATEGORY_LABELS[main];
    return labelCategorie(cat);
  }
  const main =
    mainFromCategorie(item.evenement.categorie) ??
    mainFromGenreSlug(item.evenement.genre);
  if (main) return MAIN_CATEGORY_LABELS[main];
  return labelCategorie(item.evenement.categorie);
}

type Props = {
  item: DayItem;
  className?: string;
  compact?: boolean;
};

/** Typographic poster when no photo — never a grey block. */
export default function VisualFallback({
  item,
  className = '',
  compact = false,
}: Props) {
  const catLabel = categoryLabelFor(item);
  const cssVar = catCssVar(catLabel);
  const hex = moodFallbackHex(item);
  const venue = itemVenue(item);
  const title = itemTitle(item);

  return (
    <div
      className={
        'relative flex h-full w-full flex-col justify-end overflow-hidden px-3 py-3 text-left ' +
        className
      }
      style={{
        background: `linear-gradient(145deg, color-mix(in srgb, ${hex} 88%, #1c1917), color-mix(in srgb, var(${cssVar}) 70%, #f3e8da))`,
        color: '#fffcf8',
      }}
      aria-hidden
    >
      <p
        className={
          'font-display leading-tight ' +
          (compact ? 'text-base line-clamp-2' : 'text-xl line-clamp-3 sm:text-2xl')
        }
      >
        {title}
      </p>
      {venue ? (
        <p
          className={
            'mt-1 font-medium uppercase tracking-wide text-white/90 ' +
            (compact ? 'text-[10px] line-clamp-1' : 'text-xs line-clamp-2')
          }
        >
          {venue}
        </p>
      ) : null}
    </div>
  );
}

export function categoryLabelOf(item: DayItem): string {
  return categoryLabelFor(item);
}
