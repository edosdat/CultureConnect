/**
 * Ciné fiche: cinema first, then horaire for that salle.
 * Distance = same crow-flies as Près de moi; Toulouse/Capitole when GPS is off.
 * Theatre / musique do not use this.
 */

import { TOULOUSE_ORIGIN, type GeoPos } from './geo';
import {
  filmVersionLabel,
  formatDateFr,
  formatLieuAffiche,
  knownPrixLabel,
} from './labels';
import { seanceTimeLabel } from './eventTimes';
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
  return seanceTimeLabel(rel);
}

/** Dropdown: « Cinéma ABC · 2,3 km » */
export function cinemaOptionLabel(group: CinemaVenueGroup): string {
  return [group.label, group.kmLabel].filter(Boolean).join(' · ');
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

/** Unique catalogue versions on a film card (VF + VOSTFR if both exist). */
export function filmVersionLabels(items: DayItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of items) {
    const label = seanceVersionLabel(row);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** Time + catalogue version: « 21:15 VOST ». Empty langue → time only. */
export function seanceHeureLabel(rel: DayItem): string {
  return [seanceHeure(rel), seanceVersionLabel(rel)].filter(Boolean).join(' ');
}

/** Dropdown: « 02/09 · 10:30 VOST » for the selected cinema only. */
export function horaireOptionLabel(rel: DayItem): string {
  const date = formatDateShort(seanceDateIso(rel) || rel.dayIso);
  return [date, seanceHeureLabel(rel)].filter(Boolean).join(' · ');
}

/** B3: preselect the shared `DayItem.key` when it is in the film's séance list. */
export function resolveSharedSeanceKey(
  items: readonly { key: string }[],
  seanceKey?: string | null,
): string | null {
  const key = (seanceKey || '').trim();
  if (!key) return null;
  return items.some((s) => s.key === key) ? key : null;
}

/**
 * Keep the user's horaire (or the shared token séance) when the related
 * list hydrates. Never fall back to default soonest if a valid pick exists.
 */
export function nextPickedSeanceKey(
  items: readonly { key: string }[],
  prev: string | null | undefined,
  sharedSeanceKey?: string | null,
): string | null {
  const shared = resolveSharedSeanceKey(items, sharedSeanceKey);
  if (shared) return shared;
  const keep = (prev || '').trim();
  if (keep && items.some((s) => s.key === keep)) return keep;
  return null;
}

/**
 * Séance active du picker. Recalculée à chaque render (pas seulement en
 * useEffect) : si relatedItems hydratent après le visit, le token s’applique.
 * `pickedKey` = choix utilisateur (`onPick`) uniquement — jamais un itemKey/film key.
 * `sharedSeanceKey` = DayItem.key exact du token, jusqu’au override utilisateur.
 */
export function resolveActiveCineSeance(
  items: DayItem[],
  pickedKey: string | null | undefined,
  sharedSeanceKey: string | null | undefined,
  origin: GeoPos | null | undefined,
): DayItem | null {
  if (!items.length) return null;
  const user = (pickedKey || '').trim();
  if (user) {
    const picked = items.find((i) => i.key === user);
    if (picked) return picked;
  }
  const shared = resolveSharedSeanceKey(items, sharedSeanceKey);
  if (shared) {
    const match = items.find((i) => i.key === shared);
    if (match) return match;
  }
  return defaultCineSeance(items, origin) ?? items[0] ?? null;
}

/**
 * Valeurs des deux `<select>` (cinéma + horaire) pour `active`.
 * Même dérivation que `CineSeancePicker`.
 */
export function cinePickerSelectState(
  seances: DayItem[],
  active: DayItem,
  origin: GeoPos | null | undefined,
): { cinemaValue: string; timeValue: string } {
  const groups = groupCinemasForFilm(seances, cineDistanceOrigin(origin));
  const cinemaId = cinemaKeyOf(active);
  const cinemaValue = groups.some((g) => g.lieuId === cinemaId)
    ? cinemaId
    : (groups[0]?.lieuId ?? cinemaId);
  const times = seancesAtCinema(seances, cinemaId);
  const timeValue = times.some((s) => s.key === active.key)
    ? active.key
    : (times[0]?.key ?? active.key);
  return { cinemaValue, timeValue };
}

/**
 * Si le filtre commune (ex. Toulouse) masque la séance du token (ex. Blagnac),
 * on la réinjecte depuis le pool non filtré pour que les deux selects l’affichent.
 */
export function seancesIncludingShared(
  list: DayItem[],
  pool: readonly DayItem[],
  sharedSeanceKey?: string | null,
): DayItem[] {
  const shared = resolveSharedSeanceKey(pool, sharedSeanceKey);
  if (!shared || list.some((i) => i.key === shared)) return list;
  const extra = pool.find((i) => i.key === shared);
  return extra ? [...list, extra] : list;
}

function sameOpenedFilm(
  opened: DayItem,
  row: DayItem,
): boolean {
  if (row.key === opened.key) return true;
  const fid =
    opened.kind === 'programme' ? (opened.programme.film_id || '').trim() : '';
  if (fid && row.kind === 'programme' && (row.programme.film_id || '').trim() === fid) {
    return true;
  }
  const title =
    opened.kind === 'programme'
      ? (opened.programme.nom_item || '').trim()
      : '';
  return Boolean(
    title &&
      row.kind === 'programme' &&
      (row.programme.nom_item || '').trim() === title,
  );
}

/** Deduped pool for the picker: commune-stripped related + opened + fetched extras. */
export function shareSeancePool(
  relatedItems: readonly DayItem[],
  opened: DayItem | null | undefined,
  extras: readonly (DayItem | null | undefined)[] = [],
): DayItem[] {
  const filteredExtras = extras.filter((row): row is DayItem => {
    if (!row) return false;
    if (!opened) return true;
    return sameOpenedFilm(opened, row);
  });
  const out: DayItem[] = [];
  const seen = new Set<string>();
  for (const row of [...relatedItems, opened, ...filteredExtras]) {
    if (!row || seen.has(row.key)) continue;
    seen.add(row.key);
    out.push(row);
  }
  return out;
}

/** Compact « 8,20€ · VOSTFR » — omit either part when the CSV is empty. */
export function seanceMetaLabel(item: DayItem): string {
  return [seancePrixLabel(item), seanceVersionLabel(item)]
    .filter(Boolean)
    .join(' · ');
}
