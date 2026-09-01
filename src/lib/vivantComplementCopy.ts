/**
 * Same-day overlap + complement copy for cinema hero / fiche links.
 * Kept free of reco.ts so the cinema card can import it on the client.
 */

import { seanceDateIso } from './timeScope';
import type { DayItem } from './types';

const FILM_FALLBACK_MIN = 120;
const THEATRE_FALLBACK_MIN = 100;
const MUSIQUE_FALLBACK_MIN = 90;

const WEEKDAYS_FR = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
] as const;

function minutesOfHeure(raw: string | undefined | null): number | null {
  const h = (raw || '').trim();
  if (!/^\d{1,2}:\d{2}/.test(h)) return null;
  const [hh, mm] = h.slice(0, 5).split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function itemHeureDebutRaw(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.heure_debut || '').trim() ||
      (item.evenement?.heure_debut || '').trim()
    );
  }
  return (item.evenement.heure_debut || '').trim();
}

function itemHeureFinRaw(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.heure_fin || '').trim() ||
      (item.evenement?.heure_fin || '').trim()
    );
  }
  return (item.evenement.heure_fin || '').trim();
}

function itemDureeMin(item: DayItem): number | null {
  const raw =
    item.kind === 'programme'
      ? item.programme.duree_min || item.evenement?.duree_min || ''
      : item.evenement.duree_min || '';
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fallbackDuration(item: DayItem): number {
  const cat = (
    item.kind === 'programme'
      ? item.evenement?.categorie || ''
      : item.evenement.categorie || ''
  ).toLowerCase();
  if (cat.includes('theatre') || cat.includes('humour') || cat.includes('danse')) {
    return THEATRE_FALLBACK_MIN;
  }
  if (cat.includes('musique') || cat.includes('concert')) {
    return MUSIQUE_FALLBACK_MIN;
  }
  return FILM_FALLBACK_MIN;
}

export function itemIntervalMinutes(
  item: DayItem,
): { start: number; end: number } | null {
  const start = minutesOfHeure(itemHeureDebutRaw(item));
  if (start == null) return null;
  if (start === 0 && !itemHeureFinRaw(item) && itemDureeMin(item) == null) {
    return null;
  }
  const fin = minutesOfHeure(itemHeureFinRaw(item));
  const duree = itemDureeMin(item);
  let end = fin != null ? fin : start + (duree ?? fallbackDuration(item));
  if (end <= start) end += 24 * 60;
  return { start, end };
}

export function overlapsScreening(film: DayItem, show: DayItem): boolean {
  const a = itemIntervalMinutes(film);
  const b = itemIntervalMinutes(show);
  if (!a || !b) return true;
  return a.start < b.end && b.start < a.end;
}

export function startsAfterScreening(film: DayItem, show: DayItem): boolean {
  const a = itemIntervalMinutes(film);
  const b = itemIntervalMinutes(show);
  if (!a || !b) return false;
  return b.start >= a.end;
}

export function endsBeforeScreening(film: DayItem, show: DayItem): boolean {
  const a = itemIntervalMinutes(film);
  const b = itemIntervalMinutes(show);
  if (!a || !b) return false;
  return b.end <= a.start;
}

export function weekdayLongFr(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAYS_FR[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
}

export function vivantComplementLead(film: DayItem, item: DayItem): string {
  const filmDay = seanceDateIso(film) || film.dayIso;
  const itemDay = seanceDateIso(item) || item.dayIso;
  if (itemDay && filmDay && itemDay === filmDay) {
    if (startsAfterScreening(film, item)) return 'Après la séance';
    if (endsBeforeScreening(film, item)) return 'Avant la séance';
    return 'Après la séance';
  }
  const weekday = weekdayLongFr(itemDay);
  const commune = (item.lieu?.commune || '').trim() || 'Toulouse';
  if (weekday) return `${weekday} à ${commune}`;
  return `à ${commune}`;
}
