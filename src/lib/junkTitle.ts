/**
 * Scrape / placeholder titles that must not surface in the UI.
 * Single definition for app loaders and scripts (tagAudit `titre_date`, L1 CSV).
 */

const DATE_TITLE =
  /^(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?\d{1,2}\s+(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{4}(?:\s*-\s*\d{1,2}\s*h(?:\s*\d{2})?)?$/;

const ISO_DATE_TITLE = /^\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2})?$/;

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

/** Exact normalised placeholders (not substring — « Bord de scène en LSF » stays). */
const PLACEHOLDERS = new Set([
  'complet',
  'bord de scene',
  'les infos pratiques',
]);

/** e.g. « 1 événement 11 », « 4 evenements 17 » */
const EVENT_COUNT_TITLE = /^\d+\s+evenements?(?:\s+\d+)?$/;

export type JunkTitleReason =
  | 'date_only'
  | 'pagination'
  | 'event_count'
  | 'bare_category'
  | 'placeholder';

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
 * Ex. « Vendredi 02 octobre 2026 - 20H30 », « 2026-10-02 ».
 */
export function isDateOnlyTitle(title: string): boolean {
  const t = squash(title);
  return DATE_TITLE.test(t) || ISO_DATE_TITLE.test(t);
}

/** Why this title is junk, or null if it looks like a real work title. */
export function junkTitleReason(title: string): JunkTitleReason | null {
  if (isDateOnlyTitle(title)) return 'date_only';
  const norm = normalizeJunkTitle(title);
  if (!norm) return null;
  if (norm.includes('pagination')) return 'pagination';
  if (EVENT_COUNT_TITLE.test(norm)) return 'event_count';
  if (BARE_CATEGORIES.has(norm)) return 'bare_category';
  if (PLACEHOLDERS.has(norm)) return 'placeholder';
  return null;
}

export function isJunkTitle(title: string): boolean {
  return junkTitleReason(title) !== null;
}
