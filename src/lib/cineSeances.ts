/**
 * Ciné fiche: cinema first, then horaire for that salle.
 * Distance = same crow-flies as Près de moi; Toulouse/Capitole when GPS is off.
 * Theatre / musique do not use this.
 */

import { TOULOUSE_ORIGIN, type GeoPos } from './geo';
import {
  filmVersionLabel,
  formatDateFr,
  formatHeure,
  formatLieuAffiche,
  knownPrixLabel,
} from './labels';
import { itemKmLabel, itemSortKm } from './nearMe';
import { sortSeances } from './displayFilter';
import { seanceDateIso } from './timeScope';
import type { DayItem } from './types';

export { TOULOUSE_ORIGIN };

export function cineDistanceOrigin(
  gps: GeoPos | null | undefined,
): GeoPos {
  return gps ?? TOULOUSE_ORIGIN;
}

export function cinemaKeyOf(item: DayItem): string {
  const id =
    item.lieu?.lieu_id ||
    (item.kind === 'programme'
      ? item.programme.lieu_id
      : item.evenement.lieu_id);
  if (id) return id;
  const label =
    (item.lieu?.nom || '').trim() || formatLieuAffiche(item.lieu) || 'Lieu';
  return `label:${label}`;
}

export function cinemaNameOf(item: DayItem): string {
  return (item.lieu?.nom || '').trim() || formatLieuAffiche(item.lieu) || 'Cinéma';
}

export type CinemaVenueGroup = {
  lieuId: string;
  label: string;
  kmLabel: string | null;
  sortKm: number;
  seances: DayItem[];
};

export function groupCinemasForFilm(
  seances: DayItem[],
  origin: GeoPos,
): CinemaVenueGroup[] {
  const map = new Map<string, CinemaVenueGroup>();
  const order: string[] = [];
  for (const row of seances) {
    const lieuId = cinemaKeyOf(row);
    if (!map.has(lieuId)) {
      map.set(lieuId, {
        lieuId,
        label: cinemaNameOf(row),
        kmLabel: itemKmLabel(row, origin),
        sortKm: itemSortKm(row, origin),
        seances: [],
      });
      order.push(lieuId);
    }
    map.get(lieuId)!.seances.push(row);
  }
  return order
    .map((id) => {
      const g = map.get(id)!;
      return { ...g, seances: sortSeances(g.seances) };
    })
    .sort((a, b) => {
      if (a.sortKm !== b.sortKm) return a.sortKm - b.sortKm;
      return a.label.localeCompare(b.label, 'fr');
    });
}

/** Nearest salle that still has a séance; then soonest clock at that salle. */
export function defaultCineSeance(
  seances: DayItem[],
  gps: GeoPos | null | undefined,
): DayItem | null {
  const groups = groupCinemasForFilm(seances, cineDistanceOrigin(gps));
  return groups[0]?.seances[0] ?? null;
}

export function seancesAtCinema(
  seances: DayItem[],
  lieuId: string,
): DayItem[] {
  return sortSeances(seances.filter((row) => cinemaKeyOf(row) === lieuId));
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  if (!m || !d) return formatDateFr(iso);
  return `${d}/${m}`;
}

function seanceHeure(rel: DayItem): string {
  return rel.kind === 'programme'
    ? formatHeure(rel.programme.heure_debut)
    : formatHeure(rel.evenement.heure_debut);
}

/** Dropdown: « Cinéma ABC · 2,3 km » */
export function cinemaOptionLabel(group: CinemaVenueGroup): string {
  return [group.label, group.kmLabel].filter(Boolean).join(' · ');
}

/** Dropdown: « 02/09 · 13:20 » for the selected cinema only. */
export function horaireOptionLabel(rel: DayItem): string {
  const date = formatDateShort(seanceDateIso(rel) || rel.dayIso);
  return [date, seanceHeure(rel)].filter(Boolean).join(' · ');
}

export function seancePrixLabel(item: DayItem): string | null {
  if (item.kind === 'programme') {
    return knownPrixLabel(item.programme.prix_item, item.evenement);
  }
  return knownPrixLabel(undefined, item.evenement);
}

export function seanceVersionLabel(item: DayItem): string | null {
  if (item.kind === 'programme') {
    return filmVersionLabel(item.programme.langue, item.evenement?.langue);
  }
  return filmVersionLabel(item.evenement.langue);
}

/** Compact « 8,20€ · VOSTFR » — omit either part when the CSV is empty. */
export function seanceMetaLabel(item: DayItem): string {
  return [seancePrixLabel(item), seanceVersionLabel(item)]
    .filter(Boolean)
    .join(' · ');
}
