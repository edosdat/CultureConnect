/**
 * « Sorties cette semaine » pack + « Aussi ce soir » vivant picks.
 * films.csv has no date_sortie — novelty is inferred from programme dates only.
 * A film qualifies when its first séance (overall) falls in the current Paris
 * calendar week (Mon–Sun) and it still has an upcoming séance this week.
 */

import { mainFromCategorie, mainFromGenreSlug, type MainCategoryId } from './categories';
import {
  isCinemaPeriodAggregate,
  isPublishableEvent,
  isPublishableProgrammeName,
} from './publishable';
import { addDaysIso, parisParts } from './timeScope';
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

/**
 * 2–16 cinema DayItems, one per film_id (representative = first upcoming séance
 * this Paris calendar week). Empty when fewer than 2 films qualify — caller
 * must not render an orphan title.
 */
export function nouveautesCine(
  programme: ProgrammeWithContext[],
  now = new Date(),
): DayItem[] {
  const { iso: todayIso, weekday } = parisParts(now);
  const nowHeure = parisHeureMinute(now);
  // parisParts weekday: 0=Sun .. 6=Sat. Calendar week is Mon–Sun of `now`.
  const daysFromMon = weekday === 0 ? 6 : weekday - 1;
  const weekStart = addDaysIso(todayIso, -daysFromMon);
  const weekEnd = addDaysIso(weekStart, 6);

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

  type Candidate = {
    filmId: string;
    representative: ProgrammeWithContext;
    firstOverallDate: string;
    firstOverallHeure: string;
    salleCount: number;
  };

  const candidates: Candidate[] = [];

  for (const { filmId, rows } of byFilm.values()) {
    const sorted = [...rows].sort((a, b) => {
      const d = a.programme.date.localeCompare(b.programme.date);
      if (d !== 0) return d;
      return heureOfProgramme(a).localeCompare(heureOfProgramme(b));
    });
    const firstOverall = sorted[0];
    if (!firstOverall) continue;
    const firstOverallDate = firstOverall.programme.date;
    if (firstOverallDate < weekStart || firstOverallDate > weekEnd) continue;

    const firstUpcomingThisWeek = sorted.find(
      (p) =>
        p.programme.date >= weekStart &&
        p.programme.date <= weekEnd &&
        isUpcomingSeance(
          p.programme.date,
          heureOfProgramme(p),
          todayIso,
          nowHeure,
        ),
    );
    if (!firstUpcomingThisWeek) continue;

    const venues = new Set<string>();
    for (const p of sorted) {
      if (p.programme.date < weekStart || p.programme.date > weekEnd) continue;
      const lieuId = p.programme.lieu_id || p.lieu?.lieu_id || '';
      if (lieuId) venues.add(lieuId);
    }

    candidates.push({
      filmId,
      representative: firstUpcomingThisWeek,
      firstOverallDate,
      firstOverallHeure: heureOfProgramme(firstOverall),
      salleCount: venues.size,
    });
  }

  if (candidates.length < 2) return [];

  candidates.sort((a, b) => {
    const byDate = b.firstOverallDate.localeCompare(a.firstOverallDate);
    if (byDate !== 0) return byDate;
    const byHeure = b.firstOverallHeure.localeCompare(a.firstOverallHeure);
    if (byHeure !== 0) return byHeure;
    if (b.salleCount !== a.salleCount) return b.salleCount - a.salleCount;
    return a.filmId.localeCompare(b.filmId);
  });

  return candidates.slice(0, MAX_PACK).map((c) => toDayItem(c.representative));
}

/**
 * 1–3 vivant items from tonight's Ce soir list.
 * Same commune if any, else all. Empty → omit the section.
 */
export function pickAussiCeSoir(
  ceSoirItems: DayItem[],
  openItem: DayItem,
  limit = MAX_AUSSI,
): DayItem[] {
  const openFilmId = filmIdOfItem(openItem);
  const openKey = openItem.key;
  const openEventId =
    openItem.kind === 'programme'
      ? openItem.programme.event_id || ''
      : openItem.evenement.event_id || '';
  const openCommune = normalizeCommune(openItem.lieu?.commune);

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
    const ha = itemHeure(a) || '99:99';
    const hb = itemHeure(b) || '99:99';
    const byHeure = ha.localeCompare(hb);
    if (byHeure !== 0) return byHeure;
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
