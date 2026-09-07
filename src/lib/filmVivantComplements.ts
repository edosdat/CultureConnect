/**
 * Living-arts suggestions on a cinema fiche (never theatre/music fiches).
 * Same civil evening (Europe/Paris): start at or after the screening end
 * (heure_fin, else début+duree_min, else FILM_FALLBACK_MIN), label « ce soir ».
 * Other calendar days: date chip, event start that day. Walking disk around the
 * selected séance cinema, optional GPS corridor bonus. Default pool: expo /
 * théâtre / musique / festival. Enfants only after a daytime kids film
 * (not after a soir adult screening). Zero films. Hide when empty.
 */

import { mainFromCategorie, mainFromGenreSlug } from './categories';
import { haversineKm, isOnUserCinemaCorridor, itemVenueCoords } from './geo';
import {
  isCinemaDayItem,
  isEnfantsDayItem,
  mainOfDayItem,
} from './nouveautesCine';
import { isSoirSeance, seanceDateIso } from './timeScope';
import type { DayItem } from './types';
import { itemIntervalMinutes, startsAfterScreening } from './vivantComplementCopy';

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

function itemCatGenre(item: DayItem): { categorie: string; genre: string } {
  if (item.kind === 'programme') {
    return {
      categorie: item.evenement?.categorie ?? '',
      genre: item.programme.genre || item.evenement?.genre || '',
    };
  }
  return {
    categorie: item.evenement.categorie,
    genre: item.evenement.genre || '',
  };
}

/** Enfants pack + festival/genre tagged enfants_famille. Theatre/concert stay. */
export function isEnfantsLivingItem(item: DayItem): boolean {
  if (isEnfantsDayItem(item)) return true;
  const { categorie, genre } = itemCatGenre(item);
  if (mainFromCategorie(categorie) === 'enfants_famille') return true;
  return genre
    .split(/[|,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((slug) => mainFromGenreSlug(slug) === 'enfants_famille');
}

const KIDS_FILM_TOKENS = new Set([
  'animation_jeune_public',
  'jeune_public',
  'enfants_famille',
  'enfants',
  'famille',
  'familles',
  'jeunesse',
]);

function itemTagTokens(item: DayItem): string[] {
  const bits =
    item.kind === 'programme'
      ? [
          item.programme.genre,
          item.programme.genres_mood,
          item.programme.themes,
          item.programme.public_cible,
          item.evenement?.genre,
          item.evenement?.genres_mood,
          item.evenement?.themes,
          item.evenement?.public_cible,
        ]
      : [
          item.evenement.genre,
          item.evenement.genres_mood,
          item.evenement.themes,
          item.evenement.public_cible,
        ];
  return bits
    .filter(Boolean)
    .join('|')
    .split(/[|,/\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Kids cinema séance: animation_jeune_public / famille tags / jeune public. */
export function isKidsCinemaSeance(item: DayItem): boolean {
  if (!isCinemaDayItem(item)) return false;
  return itemTagTokens(item).some((t) => KIDS_FILM_TOKENS.has(t));
}

/** Enfants suggestions only after a daytime kids film — never after soir adult. */
export function seanceAllowsEnfantsSuggestions(film: DayItem): boolean {
  return isKidsCinemaSeance(film) && !isSoirSeance(film);
}

export function livingSuggestionForm(
  item: DayItem,
): LivingSuggestionForm | null {
  if (isCinemaDayItem(item)) return null;
  if (isEnfantsLivingItem(item)) return null;
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

/** Same civil evening; start at or after the film screening end. */
export function sameEveningStartOk(seance: DayItem, living: DayItem): boolean {
  if (civilDayOf(living) !== civilDayOf(seance)) return false;
  return startsAfterScreening(seance, living);
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
    if (!livingSuggestionForm(item) && !isEnfantsLivingItem(item)) continue;
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
  const allowEnfants = seanceAllowsEnfantsSuggestions(film);
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
    if (isEnfantsLivingItem(item) && !allowEnfants) continue;
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
