/**
 * Admin-only home debug totals. Gate on NextAuth session email only.
 * Never a query param, never analytics, never rendered on the page.
 */

export const HOME_EVENTS_COUNTER_EMAIL = 'edosdat@gmail.com';

export function showHomeEventsCounter(
  email: string | null | undefined,
): boolean {
  if (typeof email !== 'string') return false;
  return email.trim().toLowerCase() === HOME_EVENTS_COUNTER_EMAIL;
}

export type HomeEventsCounterTotals = {
  /** Densified cards after upcoming + commune + chips. */
  cards: number;
  /** Séances after the same filters (not page size). */
  seances: number;
  /** Raw evenements.csv row count (unfiltered). */
  csvEvents: number;
  /** Raw programme.csv row count (unfiltered). */
  csvProgramme: number;
  rangeLabel: string;
};

function floorCount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Debug label. Never interpolates email. Never "N sur M" page size. */
export function formatHomeEventsCounter(t: HomeEventsCounterTotals): string {
  const cards = floorCount(t.cards);
  const seances = floorCount(t.seances);
  const csvEvents = floorCount(t.csvEvents);
  const csvProgramme = floorCount(t.csvProgramme);
  const range = t.rangeLabel.trim();
  const core = `cartes ${cards} · séances ${seances} · csv ${csvEvents}/${csvProgramme}`;
  return range ? `${core} · ${range}` : core;
}
