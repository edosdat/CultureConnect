'use client';

import { useEffect, useState } from 'react';
import type { DayItem } from '@/lib/types';
import type { GeoPos } from '@/lib/nearMe';
import { useShareVisit } from './ShareVisitProvider';
import EventCtaRow from './EventCtaRow';
import {
  cinemaOptionLabel,
  cineDistanceOrigin,
  cinePickerSelectState,
  groupCinemasForFilm,
  horaireOptionLabel,
  resolveActiveCineSeance,
  seanceMetaLabel,
  seanceVersionLabel,
  seancesAtCinema,
} from '@/lib/cineSeances';

type PickerProps = {
  seances: DayItem[];
  active: DayItem;
  origin: GeoPos | null;
  onPick: (key: string) => void;
  onReserve?: (item: DayItem) => void;
  onAgenda?: (item: DayItem) => void;
  onIcs?: (item: DayItem) => void;
  tagSource?: DayItem | null;
};

/** Cinema then horaire then Réserver. Never `hidden md` — must stay on 380. */
export default function CineSeancePicker({
  seances,
  active,
  origin,
  onPick,
  onReserve,
  onAgenda,
  onIcs,
  tagSource,
}: PickerProps) {
  const kmOrigin = cineDistanceOrigin(origin);
  const groups = groupCinemasForFilm(seances, kmOrigin);
  if (groups.length === 0) return null;
  const { cinemaValue, timeValue } = cinePickerSelectState(
    seances,
    active,
    origin,
  );
  const times = seancesAtCinema(seances, cinemaValue);
  const horaireRows = times.length ? times : [active];
  const meta = seanceMetaLabel(active);
  return (
    <div data-testid="cine-seance-picker">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-culture-muted">
          Séances
        </span>
        {meta ? (
          <span className="truncate text-xs text-culture-muted">{meta}</span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-col gap-2">
        <div className="grid w-full grid-cols-2 gap-2">
          <select
            value={cinemaValue}
            onChange={(e) => {
              const next = seancesAtCinema(seances, e.target.value)[0];
              if (next) onPick(next.key);
            }}
            aria-label="Choisir un cinéma"
            className="h-10 w-full min-w-0 rounded-lg border border-culture-line bg-culture-surface px-2.5 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta"
          >
            {groups.map((g) => (
              <option key={g.lieuId} value={g.lieuId}>
                {cinemaOptionLabel(g)}
              </option>
            ))}
          </select>
          <select
            value={timeValue}
            onChange={(e) => onPick(e.target.value)}
            aria-label="Choisir un horaire"
            className="h-10 w-full min-w-0 rounded-lg border border-culture-line bg-culture-surface px-2.5 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta"
          >
            {horaireRows.map((rel) => (
              <option
                key={rel.key}
                value={rel.key}
                data-testid="cine-horaire-option"
                data-langue={seanceVersionLabel(rel) ?? ''}
              >
                {horaireOptionLabel(rel)}
              </option>
            ))}
          </select>
        </div>
        <EventCtaRow
          item={active}
          seanceKey={active.key}
          onReserve={onReserve}
          onAgenda={onAgenda}
          onIcs={onIcs}
          tagSource={tagSource}
        />
      </div>
    </div>
  );
}

/** Uncontrolled wrapper: default nearest cinema + soonest horaire. */
export function CineFilmSeances({
  items,
  origin = null,
  onReserve,
  onAgenda,
  onIcs,
  onActiveChange,
  tagSource,
  initialSeanceKey = null,
}: {
  items: DayItem[];
  origin?: GeoPos | null;
  onReserve?: (item: DayItem) => void;
  onAgenda?: (item: DayItem) => void;
  onIcs?: (item: DayItem) => void;
  onActiveChange?: (item: DayItem) => void;
  tagSource?: DayItem | null;
  /** B3 shared token séance — same `DayItem.key` as the horaire `<select>`. */
  initialSeanceKey?: string | null;
}) {
  const { seanceKey: contextSeanceKey } = useShareVisit();
  // Visit context is the source of truth. Never treat a film/item key as seanceKey.
  const sharedSeanceKey = contextSeanceKey || initialSeanceKey || null;
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const active = resolveActiveCineSeance(
    items,
    pickedKey,
    sharedSeanceKey,
    origin,
  );
  useEffect(() => {
    if (active) onActiveChange?.(active);
  }, [active, onActiveChange]);
  if (!active) return null;
  return (
    <CineSeancePicker
      seances={items}
      active={active}
      origin={origin}
      onPick={setPickedKey}
      onReserve={onReserve}
      onAgenda={onAgenda}
      onIcs={onIcs}
      tagSource={tagSource}
    />
  );
}
