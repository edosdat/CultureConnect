'use client';

import type { DayItem } from '@/lib/types';
import { formatDateFr } from '@/lib/labels';
import SeanceGrid from './SeanceGrid';

type Props = {
  dayIso: string | null;
  monthLabel: string;
  items: DayItem[];
  showDateLabels?: boolean;
  onSelectItem: (key: string) => void;
  onSelectVenue?: (lieuId: string) => void;
  onClearDay?: () => void;
};

export default function DayEvents({
  dayIso,
  monthLabel,
  items,
  showDateLabels = false,
  onSelectItem,
  onSelectVenue,
  onClearDay,
}: Props) {
  const isRangeView = !dayIso;
  const title = isRangeView ? monthLabel : formatDateFr(dayIso);
  const rangeHint =
    monthLabel.toLowerCase().includes('week-end') ||
    monthLabel.toLowerCase().includes('weekend')
      ? 'ce week-end'
      : 'ce mois';
  const n = items.length;
  const subtitle =
    n === 0
      ? isRangeView
        ? `Aucune sortie ${rangeHint} (avec les filtres actuels).`
        : 'Aucune sortie ce jour-là (avec les filtres actuels).'
      : `${n} sortie${n > 1 ? 's' : ''}`;

  return (
    <div className="min-w-0 rounded-2xl border border-culture-line bg-culture-surface p-4 shadow-card sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl text-culture-ink sm:text-2xl">
            {title}
          </h2>
          <p className="mt-1 text-sm text-culture-muted">{subtitle}</p>
        </div>
        {onClearDay && (
          <button
            type="button"
            onClick={onClearDay}
            className="shrink-0 rounded-full border border-culture-line px-3 py-1.5 text-sm text-culture-ink hover:bg-culture-cream"
          >
            Tout le mois
          </button>
        )}
      </div>

      <SeanceGrid
        items={items}
        showDate={showDateLabels || isRangeView}
        onSelectItem={onSelectItem}
        onSelectVenue={onSelectVenue}
        empty={
          <p className="py-6 text-center text-sm text-culture-muted">
            {isRangeView
              ? `Aucune sortie ${rangeHint} avec ces filtres.`
              : 'Aucune sortie ce jour-là avec ces filtres.'}
          </p>
        }
      />
    </div>
  );
}
