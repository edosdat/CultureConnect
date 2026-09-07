/**
 * Living-arts suggestions on a cinema fiche (never theatre/music fiches).
 * Same civil evening (Europe/Paris): start after the séance clock, label « ce soir ».
 * Other calendar days: date chip, event start that day. Walking disk around the
 * selected séance cinema, optional GPS corridor bonus. Zero films. Hide when empty.
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
  livingSuggestionDateLabel,
  overlapsScreening,
  startsAfterScreening,
  vivantComplementLead,
  weekdayLongFr,
} from './vivantComplementCopy';

export const CINE_LIVING_RADIUS_KM = 1.2;
/** Extra civil days after each film-seance day sent in the living pool. */
export const CINE_LIVING_OTHER_DAY_HORIZON = 7;
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

/** Same civil evening; start strictly after the séance clock. No invented times. */
export function sameEveningStartOk(seance: DayItem, living: DayItem): boolean {
  if (civilDayOf(living) !== civilDayOf(seance)) return false;
  const seanceStart = itemStartMinutes(seance);
  const livingStart = itemStartMinutes(living);
  if (seanceStart == null || livingStart == null) return false;
  return livingStart > seanceStart;
}

/** Other calendar day with a real start clock (never labelled « ce soir »). */
export function otherDayStartOk(seance: DayItem, living: DayItem): boolean {
  const seanceDay = civilDayOf(seance);
  const livingDay = civilDayOf(living);
  if (!seanceDay || !livingDay || livingDay === seanceDay) return false;
  return itemStartMinutes(living) != null;
}

function livingTimeOk(seance: DayItem, living: DayItem): boolean {
  return sameEveningStartOk(seance, living) || otherDayStartOk(seance, living);
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
    sameEvening: boolean;
    livingDay: string;
    livingStart: number;
    timeDelta: number;
  }[] = [];

  for (const item of collectCinemaLivingCandidates(pool)) {
    if (item.key === film.key) continue;
    if (!livingTimeOk(film, item)) continue;
    const venue = itemVenueCoords(item);
    if (!venue) continue;
    const kmCinema = haversineKm(cinema, venue);
    const onCorridor = userGps
      ? isOnUserCinemaCorridor(venue, userGps, cinema, corridorKm)
      : false;
    if (kmCinema > radiusKm && !onCorridor) continue;
    const livingStart = itemStartMinutes(item);
    const sameEvening = sameEveningStartOk(film, item);
    const timeDelta =
      seanceStart == null || livingStart == null
        ? UNTIMED_DELTA
        : livingStart - seanceStart;
    ranked.push({
      item,
      kmCinema,
      onCorridor,
      sameEvening,
      livingDay: civilDayOf(item),
      livingStart: livingStart ?? UNTIMED_DELTA,
      timeDelta,
    });
  }

  ranked.sort((a, b) => {
    if (a.onCorridor !== b.onCorridor) return a.onCorridor ? -1 : 1;
    if (a.sameEvening !== b.sameEvening) return a.sameEvening ? -1 : 1;
    if (a.kmCinema !== b.kmCinema) return a.kmCinema - b.kmCinema;
    if (a.sameEvening && b.sameEvening && a.timeDelta !== b.timeDelta) {
      return a.timeDelta - b.timeDelta;
    }
    if (a.livingDay !== b.livingDay) return a.livingDay.localeCompare(b.livingDay);
    if (a.livingStart !== b.livingStart) return a.livingStart - b.livingStart;
    return a.item.key.localeCompare(b.item.key);
  });

  return ranked.slice(0, limit).map((r) => r.item);
}
