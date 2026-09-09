import type { DayItem } from '@/lib/types';
import { packCardPressBadge } from '@/lib/pressCitation';

type Props = {
  item: DayItem;
  compact?: boolean;
  className?: string;
};

/**
 * White pill on the vignette — theatre + musique pack/rail, when a catalogue
 * quote exists (programme OR evenement). Compact for ~380 thumbs.
 */
export default function PressBadge({
  item,
  compact = false,
  className = '',
}: Props) {
  const badge = packCardPressBadge(item);
  if (!badge) return null;
  return (
    <span
      data-testid="press-badge"
      data-press-badge={badge.source ? 'media' : 'presse'}
      title={badge.source || 'Presse'}
      className={
        'inline-flex max-w-full min-w-0 items-start gap-0.5 rounded-full border border-culture-line bg-culture-surface/95 font-medium text-culture-terracotta shadow-sm ' +
        (compact
          ? 'px-1 py-px text-[9px] leading-[1.15] '
          : 'px-1.5 py-0.5 text-[10px] leading-tight sm:text-[11px] ') +
        className
      }
    >
      <span aria-hidden="true" className="font-display leading-none">
        {'\u201C'}
      </span>
      <span className="min-w-0 text-left whitespace-normal break-words">
        {badge.label}
      </span>
    </span>
  );
}
