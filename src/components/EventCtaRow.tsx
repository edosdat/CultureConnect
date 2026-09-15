'use client';

import type { DayItem } from '@/lib/types';
import { reservePickOf } from '@/lib/reserve';
import { useSignals } from './SignalsProvider';
import ShareButton from './ShareButton';
import MoreActionsMenu from './MoreActionsMenu';

type Props = {
  item: DayItem;
  seanceKey?: string | null;
  onReserve?: (item: DayItem) => void;
  onAgenda?: (item: DayItem) => void;
  onIcs?: (item: DayItem) => void;
  tagSource?: DayItem | null;
  showReserve?: boolean;
};

/** Prop A: [Réserver compact] [3-node share] [⋯]. Live-ref full-width Réserver = FAIL. */
export default function EventCtaRow({
  item,
  seanceKey = null,
  onReserve,
  onAgenda,
  onIcs,
  tagSource,
  showReserve = true,
}: Props) {
  const { trackItem } = useSignals();
  const pick = reservePickOf(item);

  return (
    <div
      data-testid="event-cta-row"
      className="flex min-w-0 shrink-0 items-center gap-2"
    >
      {showReserve && pick.soldOut ? (
        <span
          aria-disabled="true"
          className="inline-flex h-10 shrink-0 cursor-default items-center justify-center whitespace-nowrap rounded-lg border border-culture-line bg-culture-cream px-3 text-sm font-medium text-culture-muted"
        >
          Sold out
        </span>
      ) : null}
      {showReserve && !pick.soldOut && pick.url ? (
        <a
          href={pick.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="cine-reserve"
          onClick={() => {
            trackItem(item, 'outbound_click', tagSource);
            onReserve?.(item);
          }}
          className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-culture-terracotta px-3 text-sm font-semibold text-white hover:bg-culture-clay"
        >
          Réserver
        </a>
      ) : null}
      <ShareButton item={item} seanceKey={seanceKey} />
      <MoreActionsMenu item={item} onAgenda={onAgenda} onIcs={onIcs} />
    </div>
  );
}
