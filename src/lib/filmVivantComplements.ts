/**
 * Living-arts suggestions on a cinema fiche (never theatre/music fiches).
 * Same civil evening (Europe/Paris), walking disk around the selected séance
 * cinema, optional GPS corridor bonus. Zero films. Hide when empty.
 */

import { haversineKm, isOnUserCinemaCorridor, itemVenueCoords } from './geo';
import {
  isCinemaDayItem,
  mainOfDayItem,
} from './nouveautesCine';
import { seanceDateIso } from './timeScope';
import type { DayItem } from './types';
import { itemIntervalMinutes } from './vivantComplementCopy';

export type LivingSuggestionForm = 'theatre' | 'musique' | 'festival' | 'expo';
/** @deprecated Prefer LivingSuggestionForm — theatre/musique only. */
export type VivantArtsForm = 'theatre' | 'musique';

export {
  endsBeforeScreening,
  itemIntervalMinutes,
  overlapsScreening,
  startsAfterScreening,
  vivantComplementLead,
  weekdayLongFr,
} from './vivantComplementCopy';

export const CINE_LIVING_RADIUS_KM = 1.2;
/** Perpendicular half-width of the user→cinema corridor (GO: do not widen disk). */
export const CINE_LIVING_CORRIDOR_KM = 0.6;
const MAX_BLOCK = 3;
const UNTIMED_DELTA = 24 * 60;

function eventKeyOf(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      item.programme.event_id ||
      item.programme.programme_id ||
      item.key
    );
  }
  return item.evenement.event_id || item.key;
}

function civilDayOf(item: DayItem): string {
  return seanceDateIso(item) || item.dayIso || '';
}

export function livingSuggestionForm(
  item: DayItem,
): LivingSuggestionForm | null {
  if (isCinemaDayItem(item)) return null;
  const main = mainOfDayItem(item);
  if (main === 'theatre_danse') return 'theatre';
  if (main === 'musique') return 'musique';
  if (main === 'festival') return 'festival';
  if (main === 'expo_patrimoine') return 'expo';
  return null;
}

export function vivantArtsForm(item: DayItem): VivantArtsForm | null {
  const form = livingSuggestionForm(item);
  if (form === 'theatre' || form === 'musique') return form;
  return null;
}

function itemStartMinutes(item: DayItem): number | null {
  return itemIntervalMinutes(item)?.start ?? null;
}

/** Same civil day; start before or after the séance clock — never J+1. */
export function sameEveningStartOk(seance: DayItem, living: DayItem): boolean {
  if (civilDayOf(living) !== civilDayOf(seance)) return false;
  const seanceStart = itemStartMinutes(seance);
  const livingStart = itemStartMinutes(living);
  if (seanceStart == null || livingStart == null) return true;
  return livingStart !== seanceStart;
}

export function collectCinemaLivingCandidates(pool: DayItem[]): DayItem[] {
  const living: DayItem[] = [];
  const seen = new Set<string>();
  for (const item of pool) {
    if (isCinemaDayItem(item)) continue;
    if (!livingSuggestionForm(item)) continue;
    const k = `${eventKeyOf(item)}|${civilDayOf(item)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    living.push(item);
  }
  return living;
}

export type FilmVivantComplementOpts = {
  /** Real user GPS only. Null / omitted = no corridor (Toulouse fallback is not GPS). */
  userGps?: { lat: number; lng: number } | null;
  radiusKm?: number;
  corridorKm?: number;
  limit?: number;
};

/**
 * Up to 3 living suggestions for the active cinema séance.
 * Empty → caller hides the block.
 */
export function pickFilmVivantComplements(
  pool: DayItem[],
  film: DayItem,
  opts: FilmVivantComplementOpts = {},
): DayItem[] {
  const limit = Math.min(MAX_BLOCK, Math.max(1, opts.limit ?? MAX_BLOCK));
  const radiusKm = opts.radiusKm ?? CINE_LIVING_RADIUS_KM;
  const corridorKm = opts.corridorKm ?? CINE_LIVING_CORRIDOR_KM;
  const userGps = opts.userGps ?? null;
  const filmDay = civilDayOf(film);
  const cinema = itemVenueCoords(film);
  if (!filmDay || !cinema) return [];

  const seanceStart = itemStartMinutes(film);
  const ranked: {
    item: DayItem;
    kmCinema: number;
    onCorridor: boolean;
    timeDelta: number;
  }[] = [];

  for (const item of collectCinemaLivingCandidates(pool)) {
    if (item.key === film.key) continue;
    if (!sameEveningStartOk(film, item)) continue;
    const venue = itemVenueCoords(item);
    if (!venue) continue;
    const kmCinema = haversineKm(cinema, venue);
    const onCorridor = userGps
      ? isOnUserCinemaCorridor(venue, userGps, cinema, corridorKm)
      : false;
    if (kmCinema > radiusKm && !onCorridor) continue;
    const livingStart = itemStartMinutes(item);
    const timeDelta =
      seanceStart == null || livingStart == null
        ? UNTIMED_DELTA
        : Math.abs(livingStart - seanceStart);
    ranked.push({ item, kmCinema, onCorridor, timeDelta });
  }

  ranked.sort((a, b) => {
    if (a.onCorridor !== b.onCorridor) return a.onCorridor ? -1 : 1;
    if (a.kmCinema !== b.kmCinema) return a.kmCinema - b.kmCinema;
    if (a.timeDelta !== b.timeDelta) return a.timeDelta - b.timeDelta;
    return a.item.key.localeCompare(b.item.key);
  });

  return ranked.slice(0, limit).map((r) => r.item);
}
