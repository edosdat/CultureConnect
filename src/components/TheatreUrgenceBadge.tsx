'use client';

import type { DayItem } from '@/lib/types';
import { parisParts } from '@/lib/timeScope';
import { theatreUrgenceForItem } from '@/lib/theatreUrgence';

type Props = {
  item: DayItem;
  todayIso?: string;
  className?: string;
};

/** Compact terracotta pill. Renders nothing outside theatre_danse 0–7j. */
export default function TheatreUrgenceBadge({
  item,
  todayIso,
  className = '',
}: Props) {
  const label = theatreUrgenceForItem(item, todayIso ?? parisParts().iso);
  if (!label) return null;
  return (
    <span
      data-urgence-badge={label === 'Dernière' ? 'derniere' : 'jours'}
      className={
        'inline-flex max-w-full shrink-0 rounded-full border border-culture-terracotta/45 bg-culture-soft px-1.5 py-0.5 text-[10px] font-medium leading-none text-culture-clay sm:px-2 sm:text-[11px] ' +
        className
      }
    >
      {label}
    </span>
  );
}
