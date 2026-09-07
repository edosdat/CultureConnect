/**
 * Compact « fin de série » badge for theatre_danse (incl. Capitole / opéra).
 * Calendar days in Europe/Paris. Hide when dates are missing / ambiguous.
 */

import { mainFromCategorie } from './categories';
import type { DayItem, Evenement } from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict YYYY-MM-DD that is a real calendar day. Anything else is ambiguous. */
export function parseCalendarIso(raw: string | null | undefined): string | null {
  const s = (raw || '').trim();
  const m = ISO_DATE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return s;
}

/** Inclusive calendar-day delta (to − from). Null if either date is invalid. */
export function calendarDaysBetween(
  fromIso: string,
  toIso: string,
): number | null {
  const from = parseCalendarIso(fromIso);
  const to = parseCalendarIso(toIso);
  if (!from || !to) return null;
  const [yf, mf, df] = from.split('-').map(Number);
  const [yt, mt, dt] = to.split('-').map(Number);
  const a = Date.UTC(yf, mf - 1, df);
  const b = Date.UTC(yt, mt - 1, dt);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Last date of the run.
 * Prefer max valid programme séance date for the event; else series `date_fin`.
 * Invalid / empty dates are skipped — never invented.
 */
export function lastDateOfSeries(opts: {
  programmeDates?: readonly (string | null | undefined)[];
  dateFin?: string | null;
}): string | null {
  let max: string | null = null;
  for (const raw of opts.programmeDates ?? []) {
    const iso = parseCalendarIso(raw);
    if (iso && (!max || iso > max)) max = iso;
  }
  if (max) return max;
  return parseCalendarIso(opts.dateFin);
}

/** theatre_danse bucket only. Capitole / opéra use that categorie. */
export function isTheatreUrgenceEligible(item: DayItem): boolean {
  if (item.kind === 'programme' && (item.programme.film_id || '').trim()) {
    return false;
  }
  const categorie =
    item.kind === 'programme'
      ? item.evenement?.categorie ?? ''
      : item.evenement.categorie;
  return mainFromCategorie(categorie) === 'theatre_danse';
}

export function lastDateForDayItem(item: DayItem): string | null {
  const ev: Evenement | null = item.evenement;
  const fromLoad = parseCalendarIso(ev?.last_seance_date);
  if (fromLoad) return fromLoad;
  return lastDateOfSeries({
    programmeDates: [],
    dateFin: ev?.date_fin,
  });
}

/**
 * j0/j1 → `Dernière`; 2–7 → `Plus que X jours`; else hide.
 * X = calendar days remaining until the last date (Paris).
 */
export function theatreUrgenceLabel(
  lastDate: string | null,
  todayIso: string,
): string | null {
  if (!lastDate) return null;
  const days = calendarDaysBetween(todayIso, lastDate);
  if (days == null || days < 0 || days > 7) return null;
  if (days <= 1) return 'Dernière';
  return `Plus que ${days} jours`;
}

export function theatreUrgenceForItem(
  item: DayItem,
  todayIso: string,
): string | null {
  if (!isTheatreUrgenceEligible(item)) return null;
  return theatreUrgenceLabel(lastDateForDayItem(item), todayIso);
}
