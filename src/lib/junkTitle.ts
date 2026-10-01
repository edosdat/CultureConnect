/**
 * Scrape / placeholder titles that must not surface in the UI.
 * Single definition for app loaders and scripts (tagAudit `titre_date`, L1 CSV).
 */

/** Folded month names — shared by DATE_TITLE, bare_month, month_time (one list). */
const MONTH_NAMES = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
] as const;

/**
 * Common scrape typos for month names (La Comédie de Toulouse etc.).
 * Kept beside MONTH_NAMES so DATE_TITLE stays one regex; bare_month still
 * only matches the canonical list.
 */
const MONTH_TYPOS = ['fvrier', 'dcembre'] as const;

const MONTH_ALT = [...MONTH_NAMES, ...MONTH_TYPOS].join('|');

const WEEKDAY_ALT = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';

/** One weekday? + day + month + year + optional « - 20H30 ». */
const DATE_SEGMENT = `(?:(?:${WEEKDAY_ALT})\\s+)?\\d{1,2}\\s+(?:${MONTH_ALT})\\s+\\d{4}(?:\\s*-\\s*\\d{1,2}\\s*h(?:\\s*\\d{2})?)?`;

/**
 * One or more date(+time) segments, optional trailing « + de dates ».
 * Catches single-date (L1), multi-date concatenations (M1 hole), and
 * typo months (fvrier / dcembre).
 */
const DATE_TITLE = new RegExp(
  `^(?:${DATE_SEGMENT}\\s*)+(?:\\+\\s*de\\s*dates)?$`,
);

const ISO_DATE_TITLE = /^\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2})?$/;

/**
 * Truncated scrape date fragments (Grand Rond / Fil à Plomb txt_sweep).
 * Matched on normalizeJunkTitle (alnum tokens) so en-dash / punctuation drop out.
 *
 * Pure titles: « Mercredi 30 septembre et », « Vendredi 25 et », « Du jeudi 8 au ».
 * Suffix on a real name: « … – Du jeudi 01 au », « … – Du mercredi 30 septembre au »,
 * « … – Les mercredi 21 et ».
 */
const TRUNCATED_DATE_CORE = [
  // « du jeudi 8 au » / « du mercredi 30 septembre au »
  `du\\s+(?:${WEEKDAY_ALT})\\s+\\d{1,2}(?:\\s+(?:${MONTH_ALT}))?\\s+au`,
  // « mercredi 30 septembre et » / « vendredi 25 et »
  `(?:${WEEKDAY_ALT})\\s+\\d{1,2}(?:\\s+(?:${MONTH_ALT}))?\\s+et`,
  // « les mercredi 21 et »
  `les\\s+(?:${WEEKDAY_ALT})\\s+\\d{1,2}\\s+et`,
].join('|');

const TRUNCATED_DATE_ONLY = new RegExp(`^(?:${TRUNCATED_DATE_CORE})$`);
const TRUNCATED_DATE_SUFFIX = new RegExp(`(?:${TRUNCATED_DATE_CORE})$`);

/** Exact normalised title ∈ bare scrape category labels (not real works). */
const BARE_CATEGORIES = new Set([
  'theatre',
  'danse',
  'concert',
  'cirque',
  'musique',
  'musiques',
  'cinema',
  'spectacle',
  'humour',
  'festival',
  'expo',
  'evenement',
  'evenements',
]);

/** Exact normalised title ∈ bare month name (e.g. scrape leftover « septembre »). */
const BARE_MONTHS = new Set<string>(MONTH_NAMES);

/**
 * Month-led placeholders: « octobre à 19h et », « OCTOBRE au BUV'ART ».
 * Anchored at start of normalised title — never substring (keeps real ateliers
 * like « Atelier … 29 septembre - 18h30 »).
 */
const MONTH_THEN_A = new RegExp(`^(?:${MONTH_ALT})\\s+(?:a|au)\\b`);
const MONTH_AT_START = new RegExp(`^(?:${MONTH_ALT})\\b`);
const TIME_IN_TITLE = /\d{1,2}\s?h(?:\d{2})?/;

/** Exact normalised placeholders (not substring). « Bord de scène » is a real catalogue series — not junk. */
const PLACEHOLDERS = new Set([
  'complet',
  'les infos pratiques',
]);

/** e.g. « 1 événement 11 », « 4 evenements 17 » */
const EVENT_COUNT_TITLE = /^\d+\s+evenements?(?:\s+\d+)?$/;

export type JunkTitleReason =
  | 'date_only'
  | 'truncated_date'
  | 'pagination'
  | 'event_count'
  | 'bare_category'
  | 'placeholder'
  | 'bare_month'
  | 'month_time'
  | 'empty_title';

function foldText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’ʼ]/g, "'")
    .toLowerCase();
}

function squash(raw: string): string {
  return foldText(raw).replace(/\s+/g, ' ').trim();
}

/** Accent-fold + alnum tokens for exact category / placeholder match. */
export function normalizeJunkTitle(title: string): string {
  return foldText(title)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Date-only titles (former `scripts/tagAudit` `isDateOnlyTitle` / error `titre_date`).
 * Ex. « Vendredi 02 octobre 2026 - 20H30 », « 2026-10-02 »,
 * « Jeudi 17 septembre 2026 - 20H30 Jeudi 12 novembre 2026 - 20H30 »,
 * « Mardi 29 septembre 2026 - 20H30 … + de dates ».
 */
export function isDateOnlyTitle(title: string): boolean {
  const t = squash(title);
  return DATE_TITLE.test(t) || ISO_DATE_TITLE.test(t);
}

/**
 * Incomplete date-range scrape leftovers (pure fragment or trailing suffix).
 * Ex. « Mercredi 30 septembre et », « Du jeudi 8 au »,
 * « Les Lancers de Fil : Triplicata – Du jeudi 01 au ».
 */
export function isTruncatedDateTitle(title: string): boolean {
  const norm = normalizeJunkTitle(title);
  if (!norm) return false;
  return TRUNCATED_DATE_ONLY.test(norm) || TRUNCATED_DATE_SUFFIX.test(norm);
}

function isMonthTimeTitle(norm: string): boolean {
  if (MONTH_THEN_A.test(norm)) return true;
  return MONTH_AT_START.test(norm) && TIME_IN_TITLE.test(norm);
}

/** Why this title is junk, or null if it looks like a real work title. */
export function junkTitleReason(title: string): JunkTitleReason | null {
  if (isDateOnlyTitle(title)) return 'date_only';
  if (isTruncatedDateTitle(title)) return 'truncated_date';
  const norm = normalizeJunkTitle(title);
  if (!norm) return 'empty_title';
  if (norm.includes('pagination')) return 'pagination';
  if (EVENT_COUNT_TITLE.test(norm)) return 'event_count';
  if (BARE_CATEGORIES.has(norm)) return 'bare_category';
  if (PLACEHOLDERS.has(norm)) return 'placeholder';
  if (BARE_MONTHS.has(norm)) return 'bare_month';
  if (isMonthTimeTitle(norm)) return 'month_time';
  return null;
}

export function isJunkTitle(title: string): boolean {
  return junkTitleReason(title) !== null;
}
