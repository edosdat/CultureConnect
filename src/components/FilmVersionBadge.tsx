'use client';

import type { DayItem } from '@/lib/types';
import { filmVersionLabels, seanceVersionLabel } from '@/lib/cineSeances';

type Props = {
  item?: DayItem | null;
  /** Several séances — show each distinct catalogue version once. */
  items?: DayItem[];
  className?: string;
};

/**
 * Compact VF / VOST / VOSTFR pill from existing CSV `langue` only.
 * Renders nothing when the catalogue left langue empty or unknown (`fr`).
 */
export default function FilmVersionBadge({
  item,
  items,
  className = '',
}: Props) {
  const labels = items
    ? filmVersionLabels(items)
    : item
      ? [seanceVersionLabel(item)].filter((v): v is string => Boolean(v))
      : [];
  if (labels.length === 0) return null;
  return (
    <>
      {labels.map((label) => (
        <span
          key={label}
          data-testid="film-version-badge"
          data-langue={label}
          className={
            'inline-flex max-w-full shrink-0 rounded bg-culture-ink/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-white sm:text-[11px] ' +
            className
          }
        >
          {label}
        </span>
      ))}
    </>
  );
}
