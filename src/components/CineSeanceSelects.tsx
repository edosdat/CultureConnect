'use client';

import type { ReactNode } from 'react';
import type { CineVenueOption } from '@/lib/cineSeances';
import { cineHoraireLabel } from '@/lib/cineSeances';
import type { DayItem } from '@/lib/types';

const SELECT_CLASS =
  'h-11 min-w-0 w-full rounded-lg border border-culture-line bg-culture-surface px-3 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta';

type Props = {
  venues: CineVenueOption[];
  venueId: string;
  onVenueChange: (venueId: string) => void;
  horaires: DayItem[];
  seanceKey: string;
  onSeanceChange: (key: string) => void;
  reserve: ReactNode;
};

/**
 * Cinema + horaire. Réserver stays on the time row so it remains visible at 380px.
 */
export default function CineSeanceSelects({
  venues,
  venueId,
  onVenueChange,
  horaires,
  seanceKey,
  onSeanceChange,
  reserve,
}: Props) {
  if (venues.length === 0) return null;
  return (
    <div data-cine-seances="split">
      <span className="text-xs font-semibold uppercase tracking-wide text-culture-muted">
        Séances
      </span>
      <div className="mt-1 flex min-w-0 flex-col gap-2">
        <select
          value={venueId}
          onChange={(e) => onVenueChange(e.target.value)}
          aria-label="Choisir un cinéma"
          className={SELECT_CLASS}
        >
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.optionLabel}
            </option>
          ))}
        </select>
        <div className="flex min-w-0 items-center gap-2">
          <select
            value={seanceKey}
            onChange={(e) => onSeanceChange(e.target.value)}
            aria-label="Choisir un horaire"
            className={SELECT_CLASS + ' flex-1'}
          >
            {horaires.map((rel) => (
              <option key={rel.key} value={rel.key}>
                {cineHoraireLabel(rel)}
              </option>
            ))}
          </select>
          <span className="shrink-0">{reserve}</span>
        </div>
      </div>
    </div>
  );
}
