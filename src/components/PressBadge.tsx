import type { DayItem } from '@/lib/types';
import { theatreCardPressBadge } from '@/lib/pressCitation';

type Props = {
  item: DayItem;
  compact?: boolean;
  className?: string;
};

function QuoteMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={'shrink-0 fill-current ' + className}
    >
      <path d="M6.8 13H3.2c-.2-1.7 0-3.3.5-4.6.6-1.4 1.6-2.4 3-3.1l.7 1.2c-.9.5-1.5 1.2-1.8 2.1h2.2V13zm6.6 0H9.8c-.2-1.7 0-3.3.5-4.6.6-1.4 1.6-2.4 3-3.1l.7 1.2c-.9.5-1.5 1.2-1.8 2.1h2.2V13z" />
    </svg>
  );
}

/**
 * White pill on the vignette — theatre cards only, when a catalogue quote exists.
 * Compact for Top 3 rail (~80px poster); default for pack thumbs.
 */
export default function PressBadge({
  item,
  compact = false,
  className = '',
}: Props) {
  const badge = theatreCardPressBadge(item);
  if (!badge) return null;
  return (
    <span
      data-testid="press-badge"
      data-press-badge={badge.source ? 'media' : 'presse'}
      title={badge.source || 'Presse'}
      className={
        'inline-flex max-w-full min-w-0 shrink items-center gap-0.5 rounded-full border border-culture-line bg-culture-surface/95 font-medium leading-none text-culture-terracotta shadow-sm ' +
        (compact
          ? 'px-1 py-px text-[9px] '
          : 'px-1.5 py-0.5 text-[10px] sm:text-[11px] ') +
        className
      }
    >
      <QuoteMark className={compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} />
      <span className="truncate">{badge.label}</span>
    </span>
  );
}
