/**
 * Admin-only home debug totals + `/admin` gate. Session email only.
 * Never a query param, never analytics, never rendered on the page.
 */

export const ADMIN_EMAILS = [
  'edosdat@gmail.com',
  'katimostef@gmail.com',
] as const;

export const ADMIN_EMAIL_SET: ReadonlySet<string> = new Set(ADMIN_EMAILS);

/** First allowlisted address — prefer `ADMIN_EMAILS` / `showHomeEventsCounter`. */
export const HOME_EVENTS_COUNTER_EMAIL = ADMIN_EMAILS[0];

export function showHomeEventsCounter(
  email: string | null | undefined,
): boolean {
  if (typeof email !== 'string') return false;
  return ADMIN_EMAIL_SET.has(email.trim().toLowerCase());
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
