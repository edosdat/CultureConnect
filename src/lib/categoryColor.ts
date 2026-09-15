/**
 * S8 category colors — LOCK palette in globals.css (`--cat-*`).
 * Paint from slotFormOfItem / resolvedFormOfItem (post-B4), never raw form alone.
 * Accent: chip / badge / H2 / S8b section contour / fallback wash.
 * Do not paint whole cards. Hex LOCK — do not change.
 */

import {
  MAIN_CATEGORY_LABELS,
  mainFromCategorie,
  mainFromForm,
  mainFromGenreSlug,
  type MainCategoryId,
} from './categories';
import { resolvedFormOfItem } from './reco';
import type { DayItem } from './types';

export type CatTokenKey =
  | 'cine'
  | 'musique'
  | 'theatre'
  | 'festival'
  | 'expo'
  | 'enfants';

/** LOCK hex (Cinéma terracotta must not change). */
export const CAT_HEX = {
  cine: '#E85D3B',
  musique: '#6B3FA0',
  theatre: '#0D7377',
  festival: '#BE185D',
  expo: '#334155',
  enfants: '#CA8A04',
} as const;

/** VisualFallback wash — 8–12% cat color on cream, never dead gray. */
export const CAT_WASH_PCT = 10;

export const CAT_CSS_VAR: Record<CatTokenKey, `--cat-${CatTokenKey}`> = {
  cine: '--cat-cine',
  musique: '--cat-musique',
  theatre: '--cat-theatre',
  festival: '--cat-festival',
  expo: '--cat-expo',
  enfants: '--cat-enfants',
};

export const MAIN_CAT_CSS_VAR: Record<MainCategoryId, `--cat-${CatTokenKey}`> = {
  musique: '--cat-musique',
  theatre_danse: '--cat-theatre',
  festival: '--cat-festival',
  cinema: '--cat-cine',
  expo_patrimoine: '--cat-expo',
  enfants_famille: '--cat-enfants',
};

export const PACK_CAT_CSS_VAR = {
  cine: '--cat-cine',
  theatre: '--cat-theatre',
  musique: '--cat-musique',
  enfants: '--cat-enfants',
  expo: '--cat-expo',
  festival: '--cat-festival',
} as const;

const MAIN_TO_KEY: Record<MainCategoryId, CatTokenKey> = {
  musique: 'musique',
  theatre_danse: 'theatre',
  festival: 'festival',
  cinema: 'cine',
  expo_patrimoine: 'expo',
  enfants_famille: 'enfants',
};

const FORM_TO_KEY: Record<string, CatTokenKey> = {
  cine: 'cine',
  cinema: 'cine',
  'ciné': 'cine',
  'cinéma': 'cine',
  concert: 'musique',
  musique: 'musique',
  theatre: 'theatre',
  theatre_danse: 'theatre',
  'théatre': 'theatre',
  'théâtre': 'theatre',
  festival: 'festival',
  expo: 'expo',
  expo_patrimoine: 'expo',
  enfants: 'enfants',
  enfants_famille: 'enfants',
  famille: 'enfants',
};

const LABEL_TO_KEY: Record<string, CatTokenKey> = {
  musique: 'musique',
  'théâtre': 'theatre',
  theatre: 'theatre',
  'théâtre & danse': 'theatre',
  'theatre & danse': 'theatre',
  'théâtre & spectacle vivant': 'theatre',
  festival: 'festival',
  cinéma: 'cine',
  cinema: 'cine',
  ciné: 'cine',
  cine: 'cine',
  'expo & patrimoine': 'expo',
  expos: 'expo',
  expo: 'expo',
  'enfants / familles': 'enfants',
  enfants: 'enfants',
  familles: 'enfants',
};

function stripCatToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^--(?:cc-)?cat-/, '')
    .replace(/^cc-cat-(?:bg-|grad-|wash-)?/, '');
}

export function catKeyFromInput(raw: string | null | undefined): CatTokenKey | null {
  const q = (raw || '').trim().toLowerCase();
  if (!q) return null;
  const stripped = stripCatToken(q);
  if (stripped === 'cinema' || stripped === 'cine') return 'cine';
  if (stripped === 'famille' || stripped === 'enfants') return 'enfants';
  if (
    stripped === 'musique' ||
    stripped === 'theatre' ||
    stripped === 'festival' ||
    stripped === 'expo'
  ) {
    return stripped;
  }
  if (FORM_TO_KEY[q]) return FORM_TO_KEY[q];
  if (LABEL_TO_KEY[q]) return LABEL_TO_KEY[q];
  if (FORM_TO_KEY[stripped]) return FORM_TO_KEY[stripped];
  if (LABEL_TO_KEY[stripped]) return LABEL_TO_KEY[stripped];
  const fromForm = mainFromForm(q);
  if (fromForm) return MAIN_TO_KEY[fromForm];
  const fromCat = mainFromCategorie(q);
  if (fromCat) return MAIN_TO_KEY[fromCat];
  return null;
}

export function catKeyFromMain(id: MainCategoryId): CatTokenKey {
  return MAIN_TO_KEY[id];
}

/**
 * Color key for an item. Prefer resolved form (film_id → cine) over
 * raw `form` / categorie text.
 */
export function catKeyOfItem(item: DayItem): CatTokenKey {
  const fromResolved = catKeyFromInput(resolvedFormOfItem(item));
  if (fromResolved) return fromResolved;
  const ev = item.evenement;
  const prog = item.kind === 'programme' ? item.programme : null;
  const fromCat = mainFromCategorie(ev?.categorie || '');
  if (fromCat) return MAIN_TO_KEY[fromCat];
  const fromGenre = mainFromGenreSlug(
    `${prog?.genre || ''} ${ev?.genre || ''}`.trim(),
  );
  if (fromGenre) return MAIN_TO_KEY[fromGenre];
  return 'cine';
}

export function catLabelOfKey(key: CatTokenKey): string {
  switch (key) {
    case 'cine':
      return MAIN_CATEGORY_LABELS.cinema;
    case 'musique':
      return MAIN_CATEGORY_LABELS.musique;
    case 'theatre':
      return MAIN_CATEGORY_LABELS.theatre_danse;
    case 'festival':
      return MAIN_CATEGORY_LABELS.festival;
    case 'expo':
      return MAIN_CATEGORY_LABELS.expo_patrimoine;
    case 'enfants':
      return MAIN_CATEGORY_LABELS.enfants_famille;
  }
}

export function catLabelOfItem(item: DayItem): string {
  return catLabelOfKey(catKeyOfItem(item));
}

export function catCssVarOfKey(key: CatTokenKey): `--cat-${CatTokenKey}` {
  return CAT_CSS_VAR[key];
}

export function catCssVarOfItem(item: DayItem): `--cat-${CatTokenKey}` {
  return CAT_CSS_VAR[catKeyOfItem(item)];
}

/** Solid pastille class: white text on category color. */
export function catBg(label: string): string {
  const key = catKeyFromInput(label) ?? 'cine';
  return `cc-cat-bg-${key}`;
}

/** 8–12% wash class — never a saturated card fill. */
export function catWash(label: string): string {
  const key = catKeyFromInput(label) ?? 'cine';
  return `cc-cat-wash-${key}`;
}

/** @deprecated S8: cards are not painted; wash only. */
export function catGradient(label: string): string {
  return catWash(label);
}

/** CSS custom property name for inline styles (chip / badge / H2 / bar). */
export function catCssVar(label: string): string {
  return catKeyFromInput(label) ? CAT_CSS_VAR[catKeyFromInput(label)!] : CAT_CSS_VAR.cine;
}

export function catWashBackground(cssVar: string, pct = CAT_WASH_PCT): string {
  return `color-mix(in srgb, var(${cssVar}) ${pct}%, var(--cc-cream))`;
}

export function categoryLabelOfItem(item: DayItem): string {
  return catLabelOfItem(item);
}
