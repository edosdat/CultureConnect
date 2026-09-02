/**
 * Cinema fiche / cine-pack seance picker.
 * Two controls: cinema (+ distance) then horaires of that cinema only.
 * Theatre / music must not import this.
 */

import { sortSeances } from './displayFilter';
import { formatHeure, formatLieuAffiche } from './labels';
import {
  itemKmLabel,
  itemSortKm,
  type GeoPos,
} from './nearMe';
import { TOULOUSE_ORIGIN } from './geo';
import { seanceDateIso } from './timeScope';
import type { DayItem } from './types';

export { TOULOUSE_ORIGIN };

export type CineVenueOption = {
  id: string;
  name: string;
  optionLabel: string;
  distanceKm: string | null;
  sortKm: number;
  seances: DayItem[];
};

export type CineSeancePick = {
  origin: GeoPos;
  venues: CineVenueOption[];
  venue: CineVenueOption | null;
  horaires: DayItem[];
  active: DayItem | null;
};

/** GPS if allowed, else Toulouse Capitole. Never invent a price or version. */
export function seanceDistanceOrigin(
  gps: GeoPos | null | undefined,
): GeoPos {
  return gps ?? TOULOUSE_ORIGIN;
}

export function cineVenueId(item: DayItem): string {
  const lieuId = item.lieu?.lieu_id || '';
  if (lieuId) return lieuId;
  const label = formatLieuAffiche(item.lieu) || item.lieu?.commune || 'Lieu';
  return `label:${label}`;
}

export function cineVenueName(item: DayItem): string {
  const nom = (item.lieu?.nom || '').trim();
  if (nom) return nom;
  return formatLieuAffiche(item.lieu) || item.lieu?.commune || 'Cinéma';
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  if (!m || !d) return iso;
  return `${d}/${m}`;
}

function seanceHeure(item: DayItem): string {
  return item.kind === 'programme'
    ? formatHeure(item.programme.heure_debut)
    : formatHeure(item.evenement.heure_debut);
}

/**
 * VF / VOST from the catalogue `langue` field only.
 * Empty or unknown → nothing. Never inferred from title / notes.
 */
export function seanceVersionLabel(
  raw: string | null | undefined,
): string | null {
  const t = (raw || '').trim().toLowerCase();
  if (!t) return null;
  const hasVost =
    t.includes('vost') ||
    t === 'vo' ||
    t.startsWith('vo ') ||
    t.startsWith('vo-') ||
    t.startsWith('vo;');
  const hasVf =
    /\bvf\b/.test(t) ||
    t === 'fr' ||
    t === 'français' ||
    t === 'francais' ||
    t.includes('version française') ||
    t.includes('version francaise');
  if (hasVf && hasVost) return 'VF/VOST';
  if (hasVost) return 'VOST';
  if (hasVf) return 'VF';
  return null;
}

export function seanceLangueOf(item: DayItem): string {
  if (item.kind === 'programme') return item.evenement?.langue || '';
  return item.evenement.langue || '';
}

/**
 * Catalogue price only. Empty prix / non-gratuit → null (never « Tarif non indiqué »).
 */
export function cataloguePriceLabel(item: DayItem): string | null {
  if (item.kind === 'programme') {
    const prixItem = (item.programme.prix_item || '').trim();
    if (prixItem) {
      return prixItem.toLowerCase() === 'gratuit' ? 'Gratuit' : prixItem;
    }
    const ev = item.evenement;
    if (!ev) return null;
    if ((ev.gratuit || '').toLowerCase() === 'oui') return 'Gratuit';
    const prix = (ev.prix || '').trim();
    return prix || null;
  }
  if ((item.evenement.gratuit || '').toLowerCase() === 'oui') return 'Gratuit';
  const prix = (item.evenement.prix || '').trim();
  return prix || null;
}

export function cineHoraireLabel(item: DayItem): string {
  const date = formatDateShort(seanceDateIso(item) || item.dayIso || '');
  const heure = seanceHeure(item);
  const version = seanceVersionLabel(seanceLangueOf(item));
  const price = cataloguePriceLabel(item);
  return [date, heure, version, price].filter(Boolean).join(' · ');
}

export function cineCinemaLabel(
  name: string,
  distanceKm: string | null,
): string {
  return [name, distanceKm].filter(Boolean).join(' · ');
}

export function groupCineVenues(
  seances: DayItem[],
  origin: GeoPos,
): CineVenueOption[] {
  const map = new Map<string, DayItem[]>();
  const order: string[] = [];
  for (const row of seances) {
    const id = cineVenueId(row);
    if (!map.has(id)) {
      map.set(id, []);
      order.push(id);
    }
    map.get(id)!.push(row);
  }
  const venues = order.map((id) => {
    const rows = sortSeances(map.get(id)!);
    const sample = rows[0]!;
    const name = cineVenueName(sample);
    const distanceKm = itemKmLabel(sample, origin);
    return {
      id,
      name,
      optionLabel: cineCinemaLabel(name, distanceKm),
      distanceKm,
      sortKm: Math.min(...rows.map((s) => itemSortKm(s, origin))),
      seances: rows,
    };
  });
  venues.sort((a, b) => {
    if (a.sortKm !== b.sortKm) return a.sortKm - b.sortKm;
    return a.name.localeCompare(b.name, 'fr');
  });
  return venues;
}

export function defaultCineDistanceKm(
  seances: DayItem[],
  gps: GeoPos | null | undefined,
): string | null {
  const venues = groupCineVenues(seances, seanceDistanceOrigin(gps));
  return venues[0]?.distanceKm ?? null;
}

export function pickCineSeance(
  seances: DayItem[],
  opts?: {
    origin?: GeoPos | null;
    venueId?: string | null;
    seanceKey?: string | null;
  },
): CineSeancePick {
  const origin = seanceDistanceOrigin(opts?.origin);
  const venues = groupCineVenues(seances, origin);
  const bySeance = opts?.seanceKey
    ? venues.find((v) => v.seances.some((s) => s.key === opts.seanceKey))
    : null;
  const venue =
    venues.find((v) => v.id === opts?.venueId) ??
    bySeance ??
    venues[0] ??
    null;
  const horaires = venue?.seances ?? [];
  const active =
    horaires.find((s) => s.key === opts?.seanceKey) ?? horaires[0] ?? null;
  return { origin, venues, venue, horaires, active };
}
