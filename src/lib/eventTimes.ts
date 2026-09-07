/**
 * Début / fin display. Never invent an end clock.
 * Fin only when heure_fin is present. If fin is empty, show début only.
 * No durée / 90-min concert fallback — research may fill later.
 */

import type { DayItem } from './types';
import { formatHeure } from './labels';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** HH:MM from a CSV clock. Empty / junk → ''. */
export function normalizeHeure(raw: string | null | undefined): string {
  const h = (raw || '').trim();
  if (!/^\d{1,2}:\d{2}/.test(h)) return '';
  return formatHeure(h);
}

/** Positive minutes from catalogue `duree_min` only. No fallbacks. */
export function reliableDureeMin(raw: string | null | undefined): number | null {
  const t = (raw || '').trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) return null;
  return n;
}

export function addMinutesToHeure(
  heure: string,
  minutes: number,
): string {
  const start = normalizeHeure(heure);
  if (!start) return '';
  const [hh, mm] = start.split(':').map(Number);
  const total = ((hh ?? 0) * 60 + (mm ?? 0) + minutes) % (24 * 60);
  const wrap = total < 0 ? total + 24 * 60 : total;
  return `${pad2(Math.floor(wrap / 60))}:${pad2(wrap % 60)}`;
}

function rawStartOf(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.heure_debut || '').trim() ||
      (item.evenement?.heure_debut || '').trim()
    );
  }
  return (item.evenement.heure_debut || '').trim();
}

function rawEndOf(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.heure_fin || '').trim() ||
      (item.evenement?.heure_fin || '').trim()
    );
  }
  return (item.evenement.heure_fin || '').trim();
}

export function itemStartHeure(item: DayItem): string {
  return normalizeHeure(rawStartOf(item));
}

/** Fin from heure_fin only. Duree_min is not displayed (0 invent). */
export function itemEndHeure(item: DayItem): string {
  return normalizeHeure(rawEndOf(item));
}

/** Compact card / dropdown: `18:00–20:30` or `18:00`. */
export function formatCompactTimeRange(
  start: string,
  end?: string | null,
): string {
  const a = normalizeHeure(start);
  const b = normalizeHeure(end);
  if (!a) return '';
  if (!b || b === a) return a;
  return `${a}–${b}`;
}

export function compactTimeRangeFromFields(
  heureDebut: string,
  heureFin?: string | null,
  dureeMin?: string | null,
): string {
  const start = normalizeHeure(heureDebut);
  if (!start) return '';
  void dureeMin;
  return formatCompactTimeRange(start, heureFin);
}

/** Home / carousel / cinema slot: start–end when data exists. */
export function seanceTimeLabel(item: DayItem): string {
  return formatCompactTimeRange(itemStartHeure(item), itemEndHeure(item));
}

/** Fiche: clear début–fin line. Empty when no start. */
export function formatFicheHoraires(item: DayItem): string {
  const start = itemStartHeure(item);
  const end = itemEndHeure(item);
  if (!start) return '';
  if (!end || end === start) return `Début ${start}`;
  return `Début ${start} – Fin ${end}`;
}
