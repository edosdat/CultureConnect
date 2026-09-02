'use client';

import { useEffect, useState } from 'react';
import type { DayItem } from '@/lib/types';
import type { GeoPos } from '@/lib/nearMe';
import { reservePickOf } from '@/lib/reserve';
import {
  cinemaKeyOf,
  cinemaOptionLabel,
  cineDistanceOrigin,
  defaultCineSeance,
  groupCinemasForFilm,
  horaireOptionLabel,
  seanceMetaLabel,
  seancesAtCinema,
} from '@/lib/cineSeances';

function SeanceReserveLink({
  item,
  onReserve,
}: {
  item: DayItem;
  onReserve?: (item: DayItem) => void;
}) {
  const pick = reservePickOf(item);
  if (pick.soldOut) {
    return (
      <span
        aria-disabled="true"
        className="pointer-events-none inline-flex h-11 shrink-0 cursor-default items-center whitespace-nowrap rounded-full border border-culture-line bg-culture-cream px-3 text-sm font-medium text-culture-muted"
      >
        Sold out
      </span>
    );
  }
  if (!pick.url) return null;
  return (
    <a
      href={pick.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onReserve?.(item)}
      className="inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-culture-terracotta px-3 text-sm font-semibold text-white hover:bg-culture-clay sm:px-4"
    >
      Réserver
    </a>
  );
}

type PickerProps = {
  seances: DayItem[];
  active: DayItem;
  origin: GeoPos | null;
  onPick: (key: string) => void;
  onReserve?: (item: DayItem) => void;
};

/** Cinema then horaire then Réserver. Never `hidden md` — must stay on 380. */
export default function CineSeancePicker({
  seances,
  active,
  origin,
  onPick,
  onReserve,
}: PickerProps) {
  const kmOrigin = cineDistanceOrigin(origin);
  const groups = groupCinemasForFilm(seances, kmOrigin);
  if (groups.length === 0) return null;
  const cinemaId = cinemaKeyOf(active);
  const times = seancesAtCinema(seances, cinemaId);
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
      <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={
            groups.some((g) => g.lieuId === cinemaId)
              ? cinemaId
              : groups[0]!.lieuId
          }
          onChange={(e) => {
            const next = seancesAtCinema(seances, e.target.value)[0];
            if (next) onPick(next.key);
          }}
          aria-label="Choisir un cinéma"
          className="h-11 w-full min-w-0 rounded-lg border border-culture-line bg-culture-surface px-2.5 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta sm:flex-1 sm:basis-28"
        >
          {groups.map((g) => (
            <option key={g.lieuId} value={g.lieuId}>
              {cinemaOptionLabel(g)}
            </option>
          ))}
        </select>
        <div className="flex w-full min-w-0 items-center gap-2 sm:flex-1 sm:basis-36">
          <select
            value={
              times.some((s) => s.key === active.key)
                ? active.key
                : (times[0]?.key ?? active.key)
            }
            onChange={(e) => onPick(e.target.value)}
            aria-label="Choisir un horaire"
            className="h-11 min-w-0 flex-1 rounded-lg border border-culture-line bg-culture-surface px-2.5 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta"
          >
            {(times.length ? times : [active]).map((rel) => (
              <option key={rel.key} value={rel.key}>
                {horaireOptionLabel(rel)}
              </option>
            ))}
          </select>
          <SeanceReserveLink item={active} onReserve={onReserve} />
        </div>
      </div>
    </div>
  );
}

/** Uncontrolled wrapper: default nearest cinema + soonest horaire. */
export function CineFilmSeances({
  items,
  origin = null,
  onReserve,
}: {
  items: DayItem[];
  origin?: GeoPos | null;
  onReserve?: (item: DayItem) => void;
}) {
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const itemKeys = items.map((s) => s.key).join('|');
  useEffect(() => {
    setPickedKey(null);
  }, [itemKeys]);
  const active =
    items.find((s) => s.key === pickedKey) ??
    defaultCineSeance(items, origin) ??
    items[0];
  if (!active) return null;
  return (
    <CineSeancePicker
      seances={items}
      active={active}
      origin={origin}
      onPick={setPickedKey}
      onReserve={onReserve}
    />
  );
}
