'use client';

import type { DayItem } from '@/lib/types';
import {
  catCssVarOfItem,
  catKeyOfItem,
  catLabelOfItem,
  catWashBackground,
} from '@/lib/categoryColor';
import { itemTitle, itemVenue } from '@/lib/displayHome';

function categoryLabelFor(item: DayItem): string {
  return catLabelOfItem(item);
}

type Props = {
  item: DayItem;
  className?: string;
  compact?: boolean;
};

/** Typographic poster when no photo — 8–12% cat wash on cream, never a grey block. */
export default function VisualFallback({
  item,
  className = '',
  compact = false,
}: Props) {
  const key = catKeyOfItem(item);
  const cssVar = catCssVarOfItem(item);
  const venue = itemVenue(item);
  const title = itemTitle(item);

  return (
    <div
      data-cat-wash={key}
      className={
        'relative flex h-full w-full flex-col justify-end overflow-hidden px-3 py-3 text-left ' +
        className
      }
      style={{
        background: catWashBackground(cssVar),
        color: 'var(--cc-ink)',
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
            'mt-1 font-medium uppercase tracking-wide text-culture-muted ' +
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
