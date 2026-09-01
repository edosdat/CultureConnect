/**
 * « Sorties cette semaine » pack + « Aussi ce soir » vivant picks.
 * films.csv has no date_sortie — novelty is inferred from programme dates only.
 * A film qualifies when its first BDD séance is the Wednesday of the current
 * Paris week and it still has an upcoming séance. No date_sortie. Sunday
 * repertory one-shots do not qualify.
 */

import { mainFromCategorie, mainFromGenreSlug, type MainCategoryId } from './categories';
import {
  isCinemaPeriodAggregate,
  isPublishableEvent,
  isPublishableProgrammeName,
} from './publishable';
import { addDaysIso, parisParts, weekendRange } from './timeScope';
import type { DayItem, ProgrammeWithContext } from './types';

const VIVANT_MAINS: ReadonlySet<MainCategoryId> = new Set([
  'musique',
  'theatre_danse',
  'festival',
  'enfants_famille',
]);

const MAX_PACK = 16;
const MAX_AUSSI = 3;

function isProgrammePublishable(p: ProgrammeWithContext): boolean {
  if (
    !isPublishableProgrammeName(p.programme.nom_item, {
      notes: p.programme.notes,
      description: p.programme.description_item,
    })
  ) {
    return false;
  }
  if (
    p.evenement &&
    !isPublishableEvent(p.evenement) &&
    !isCinemaPeriodAggregate(p.evenement)
  ) {
    return false;
  }
  return true;
}

function filmIdOfProgramme(p: ProgrammeWithContext): string {
  return (p.programme.film_id || '').trim();
}

function heureOfProgramme(p: ProgrammeWithContext): string {
  const h = (p.programme.heure_debut || '').trim();
  return h.length >= 4 ? h.slice(0, 5) : '';
}

function parisHeureMinute(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

function isUpcomingSeance(
  date: string,
  heure: string,
  todayIso: string,
  nowHeure: string,
): boolean {
  if (!date) return false;
  if (date > todayIso) return true;
  if (date < todayIso) return false;
  if (!heure) return true;
  return heure >= nowHeure;
}

function toDayItem(p: ProgrammeWithContext): DayItem {
  return {
    kind: 'programme',
    key: `p:${p.programme.programme_id}`,
    dayIso: p.programme.date,
    programme: p.programme,
    evenement: p.evenement,
    lieu: p.lieu,
  };
}

export function filmIdOfItem(item: DayItem): string {
  if (item.kind !== 'programme') return '';
  return (item.programme.film_id || '').trim();
}

export function mainOfDayItem(item: DayItem): MainCategoryId | null {
  const categorie =
    item.kind === 'programme'
      ? item.evenement?.categorie ?? ''
      : item.evenement.categorie;
  const genre =
    item.kind === 'programme'
      ? item.programme.genre || item.evenement?.genre || ''
      : item.evenement.genre || '';
  return mainFromCategorie(categorie) ?? mainFromGenreSlug(genre);
}

export function isCinemaDayItem(item: DayItem): boolean {
  if (filmIdOfItem(item)) return true;
  return mainOfDayItem(item) === 'cinema';
}

export function isVivantDayItem(item: DayItem): boolean {
  if (filmIdOfItem(item)) return false;
  const main = mainOfDayItem(item);
  return main != null && VIVANT_MAINS.has(main);
}

function itemHeure(item: DayItem): string {
  if (item.kind === 'programme') {
    const h = (item.programme.heure_debut || '').trim();
    return h.length >= 4 ? h.slice(0, 5) : '';
  }
  const h = (item.evenement.heure_debut || '').trim();
  return h.length >= 4 ? h.slice(0, 5) : '';
}

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

function normalizeCommune(c: string | null | undefined): string {
  return (c || '').trim().toLocaleLowerCase('fr');
}

type FilmBucket = {
  filmId: string;
  rows: ProgrammeWithContext[];
};


type Candidate = {
  filmId: string;
  representative: ProgrammeWithContext;
  salleCount: number;
  seanceCount: number;
};

function qualifyingNouveauFilms(
  programme: ProgrammeWithContext[],
  now: Date,
): Candidate[] {
  const { iso: todayIso, weekday } = parisParts(now);
  const nowHeure = parisHeureMinute(now);
  const daysFromMon = weekday === 0 ? 6 : weekday - 1;
  const weekStart = addDaysIso(todayIso, -daysFromMon);
  const weekEnd = addDaysIso(weekStart, 6);
  const wednesdayIso = addDaysIso(weekStart, 2);

  const byFilm = new Map<string, FilmBucket>();
  for (const p of programme) {
    const filmId = filmIdOfProgramme(p);
    if (!filmId) continue;
    if (!isProgrammePublishable(p)) continue;
    const date = (p.programme.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let bucket = byFilm.get(filmId);
    if (!bucket) {
      bucket = { filmId, rows: [] };
      byFilm.set(filmId, bucket);
    }
    bucket.rows.push(p);
  }

  const candidates: Candidate[] = [];
  for (const { filmId, rows } of byFilm.values()) {
    const sorted = [...rows].sort((a, b) => {
      const d = a.programme.date.localeCompare(b.programme.date);
      if (d !== 0) return d;
      return heureOfProgramme(a).localeCompare(heureOfProgramme(b));
    });
    const firstOverall = sorted[0];
    if (!firstOverall) continue;
    if (firstOverall.programme.date !== wednesdayIso) continue;

    const firstUpcoming = sorted.find((p) =>
      isUpcomingSeance(
        p.programme.date,
        heureOfProgramme(p),
        todayIso,
        nowHeure,
      ),
    );
    if (!firstUpcoming) continue;

    const weekRows = sorted.filter(
      (p) => p.programme.date >= weekStart && p.programme.date <= weekEnd,
    );
    const venues = new Set<string>();
    for (const p of weekRows) {
      const lieuId = p.programme.lieu_id || p.lieu?.lieu_id || '';
      if (lieuId) venues.add(lieuId);
    }

    candidates.push({
      filmId,
      representative: firstUpcoming,
      salleCount: venues.size,
      seanceCount: weekRows.length,
    });
  }
  return candidates;
}

/** film_ids whose first BDD séance is this week's Wednesday and still upcoming. */
export function nouveauFilmIds(
  programme: ProgrammeWithContext[],
  now = new Date(),
): Set<string> {
  return new Set(qualifyingNouveauFilms(programme, now).map((c) => c.filmId));
}

/**
 * 2–16 cinema DayItems, one per film_id (representative = first upcoming séance).
 * First BDD séance must be this week's Wednesday. Sort: more salles, then more
 * séances. Empty when fewer than 2 films qualify — no orphan title.
 */
export function nouveautesCine(
  programme: ProgrammeWithContext[],
  now = new Date(),
): DayItem[] {
  const candidates = qualifyingNouveauFilms(programme, now);

  if (candidates.length < 2) return [];

  candidates.sort((a, b) => {
    if (b.salleCount !== a.salleCount) return b.salleCount - a.salleCount;
    if (b.seanceCount !== a.seanceCount) return b.seanceCount - a.seanceCount;
    return a.filmId.localeCompare(b.filmId);
  });

  return candidates.slice(0, MAX_PACK).map((c) => toDayItem(c.representative));
}

/** Living rarity / desirability — never séance count, never earliest-hour. */
export function livingDesirability(
  item: DayItem,
  todayIso: string,
  weekday: number,
): number {
  let score = 0;
  const ev = item.evenement;
  const start = (ev?.date_debut || item.dayIso || '').trim();
  const end = (ev?.date_fin || item.dayIso || '').trim();
  if (start && end && start === end) score += 3;
  if (start && start === item.dayIso) score += 2;
  if (end && end === item.dayIso) score += 1;

  const we = weekendRange(todayIso, weekday);
  const isWeekend = item.dayIso >= we.startIso && item.dayIso <= we.endIso;
  const isTomorrow = item.dayIso === addDaysIso(todayIso, 1);
  if (isTomorrow || isWeekend) score += 4;
  if (item.dayIso > todayIso) score += 1;

  const h = itemHeure(item);
  if (h && h >= '19:00' && h <= '21:30') score += 1.5;
  else if (h && h < '19:00') score += 0.5;
  return score;
}

/**
 * 1–3 vivant items. Same commune if any, else all.
 * Sort by rarity / desirability (tomorrow / weekend / earlier evening),
 * not earliest hour.
 */
export function pickAussiCeSoir(
  ceSoirItems: DayItem[],
  openItem: DayItem,
  limit = MAX_AUSSI,
  now = new Date(),
): DayItem[] {
  const openFilmId = filmIdOfItem(openItem);
  const openKey = openItem.key;
  const openEventId =
    openItem.kind === 'programme'
      ? openItem.programme.event_id || ''
      : openItem.evenement.event_id || '';
  const openCommune = normalizeCommune(openItem.lieu?.commune);
  const paris = parisParts(now);

  const vivant = ceSoirItems.filter((item) => {
    if (item.key === openKey) return false;
    if (openFilmId && filmIdOfItem(item) === openFilmId) return false;
    if (openEventId && eventKeyOf(item) === openEventId) return false;
    if (!isVivantDayItem(item)) return false;
    return true;
  });

  const sameCommune = openCommune
    ? vivant.filter((item) => normalizeCommune(item.lieu?.commune) === openCommune)
    : [];
  const pool = sameCommune.length > 0 ? sameCommune : vivant;

  const sorted = [...pool].sort((a, b) => {
    const da = livingDesirability(a, paris.iso, paris.weekday);
    const db = livingDesirability(b, paris.iso, paris.weekday);
    if (db !== da) return db - da;
    return a.key.localeCompare(b.key);
  });

  const seen = new Set<string>();
  const out: DayItem[] = [];
  for (const item of sorted) {
    const k = eventKeyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
