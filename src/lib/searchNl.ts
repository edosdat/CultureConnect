/**
 * Natural-language search → Plan C filter chips (preview, then Confirmer).
 * Local rules + dictionary only. No LLM, no remote suggest.
 *
 * 0 date chip → confirm scope `tous` (full catalogue ≥ today Europe/Paris).
 * A QUAND chip appears only when the phrase itself names a date.
 * Salle / lieu is out of this path: lieuId stays null, no salle chip.
 * Ville only when the phrase names a commune — never inferred from a venue.
 */

import type { MainCategoryId } from './categories';
import { mainFromGenreSlug } from './categories';
import { normalizePhrase } from './phraseTags';
import {
  parseSearchChips,
  type SearchChipParse,
} from './parseSearchChips';
import { normalizeSearch } from './searchText';
import { bootTimeScope, type TimeScopeId } from './timeScope';

export const SEARCH_NL_DEBOUNCE_MS = 200;
export const SEARCH_NL_MIN_CHARS = 2;

/**
 * Bare venue text (« taquin ») names a known salle.
 * Used to list that venue's events under the field — never as a salle chip.
 * Short fragments (« le », « les ») stay on the normal search path.
 */
export function queryNamesKnownLieu(
  query: string,
  lieux: readonly SearchNlLieu[],
): boolean {
  const q = normalizeSearch(query);
  if (q.length < 4) return false;
  return lieux.some((lieu) => {
    const nom = normalizeSearch(lieu.nom);
    const label = normalizeSearch(lieu.label);
    return (nom.length > 0 && nom.includes(q)) || (label.length > 0 && label.includes(q));
  });
}

/** Muted one-liner when nothing maps and the query is not a catalogue title. */
export const SEARCH_NL_HINT =
  'On n’a pas trouvé de filtre — précise une date, un type ou une ville';

export type SearchNlGenre = { slug: string; label: string };

export type SearchNlLieu = {
  id: string;
  nom: string;
  label: string;
  commune: string;
};

export type SearchNlDict = {
  genres: readonly SearchNlGenre[];
  communes: readonly string[];
  lieux: readonly SearchNlLieu[];
};

export type SearchNlParse = SearchChipParse & {
  genres: string[];
  commune: string | null;
  lieuId: string | null;
  lieuLabel: string | null;
};

export type SearchNlChipAxis = 'quand' | 'quoi' | 'genre' | 'ville';

export type SearchNlChip = {
  key: string;
  axis: SearchNlChipAxis;
  label: string;
};

const HOME_CAT_LABEL: Record<MainCategoryId, string> = {
  cinema: 'Cinéma',
  musique: 'Musique',
  theatre_danse: 'Théâtre',
  festival: 'Festival',
  expo_patrimoine: 'Expo & patrimoine',
  enfants_famille: 'Enfants',
};

/** Single tokens that are QUOI words or too vague to be a genre chip. */
const SKIP_GENRE_PHRASE = new Set([
  'musique',
  'theatre',
  'danse',
  'cinema',
  'cine',
  'film',
  'films',
  'concert',
  'concerts',
  'festival',
  'expo',
  'exposition',
  'enfant',
  'enfants',
  'famille',
  'humour',
  'cirque',
  'opera',
  'autre',
  'public',
  'jeune',
  'standup',
  'live',
]);

const MONTH_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

function hasPhrase(norm: string, phrase: string): boolean {
  const p = normalizePhrase(phrase);
  if (!p) return false;
  const re = new RegExp(`(?:^|\\s)${p.replace(/\s+/g, '\\s+')}(?:\\s|$)`);
  return re.test(norm);
}

function stripPhrase(norm: string, phrase: string): string {
  const p = normalizePhrase(phrase);
  if (!p) return norm;
  const re = new RegExp(`(?:^|\\s)${p.replace(/\s+/g, '\\s+')}(?=\\s|$)`, 'g');
  return norm.replace(re, ' ').replace(/\s+/g, ' ').trim();
}

function genrePhraseIndex(
  genres: readonly SearchNlGenre[],
): Map<string, SearchNlGenre> {
  const claims = new Map<string, SearchNlGenre | null>();
  const claim = (raw: string, genre: SearchNlGenre) => {
    const phrase = normalizePhrase(raw);
    if (phrase.length < 3 || SKIP_GENRE_PHRASE.has(phrase)) return;
    const prev = claims.get(phrase);
    if (prev === undefined) claims.set(phrase, genre);
    else if (prev && prev.slug !== genre.slug) claims.set(phrase, null);
  };
  for (const genre of genres) {
    claim(genre.label, genre);
    for (const part of genre.label.split('/')) claim(part, genre);
    for (const token of genre.slug.split(/[|_]+/)) {
      if (token.length >= 4) claim(token.replace(/_/g, ' '), genre);
    }
  }
  const out = new Map<string, SearchNlGenre>();
  for (const [phrase, genre] of claims) {
    if (genre) out.set(phrase, genre);
  }
  return out;
}

function matchGenres(
  norm: string,
  genres: readonly SearchNlGenre[],
): { genres: SearchNlGenre[]; phrases: string[] } {
  const index = genrePhraseIndex(genres);
  const phrases = [...index.keys()].sort((a, b) => b.length - a.length);
  const found: SearchNlGenre[] = [];
  const used = new Set<string>();
  const consumed: string[] = [];
  let rest = norm;
  for (const phrase of phrases) {
    if (!hasPhrase(rest, phrase)) continue;
    const genre = index.get(phrase);
    if (!genre || used.has(genre.slug)) {
      rest = stripPhrase(rest, phrase);
      continue;
    }
    used.add(genre.slug);
    found.push(genre);
    consumed.push(phrase);
    rest = stripPhrase(rest, phrase);
  }
  return { genres: found, phrases: consumed };
}

function matchCommune(
  norm: string,
  communes: readonly string[],
): { commune: string; phrase: string } | null {
  let best: { commune: string; phrase: string } | null = null;
  for (const commune of communes) {
    const phrase = normalizePhrase(commune);
    if (phrase.length < 3 || !hasPhrase(norm, phrase)) continue;
    if (!best || phrase.length > best.phrase.length) best = { commune, phrase };
  }
  return best;
}

function shortDayLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return 'Date…';
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

function quandLabel(parsed: SearchChipParse): string | null {
  if (parsed.scope === 'soir') return 'Ce soir';
  if (parsed.scope === 'aujourdhui') return "Aujourd'hui";
  if (parsed.scope === 'weekend') return 'Ce WE';
  if (parsed.scope === 'semaine') return 'Cette semaine';
  if (parsed.scope === 'date') {
    return parsed.selectedDate ? shortDayLabel(parsed.selectedDate) : 'Date…';
  }
  return null;
}

export function parseSearchNl(
  query: string,
  dict: SearchNlDict,
  now = new Date(),
): SearchNlParse {
  const raw = (query || '').trim();
  const empty: SearchNlParse = {
    scope: null,
    selectedDate: null,
    categories: [],
    titleQuery: '',
    genres: [],
    commune: null,
    lieuId: null,
    lieuLabel: null,
  };
  if (!raw) return empty;

  const base = parseSearchChips(raw, now);
  const norm = normalizePhrase(raw);
  const genreHit = matchGenres(norm, dict.genres);
  const communeHit = matchCommune(norm, dict.communes);

  let title = base.titleQuery;
  for (const phrase of genreHit.phrases) title = stripPhrase(title, phrase);
  if (communeHit) title = stripPhrase(title, communeHit.phrase);
  title = title.replace(/\s+/g, ' ').trim();

  return {
    scope: base.scope,
    selectedDate: base.selectedDate,
    categories: base.categories,
    titleQuery: title,
    genres: genreHit.genres.map((g) => g.slug),
    commune: communeHit?.commune ?? null,
    lieuId: null,
    lieuLabel: null,
  };
}

/** QUOI chips to turn on, including the parent of a genre (Jazz → Musique). */
export function nlCategoriesToApply(parsed: SearchNlParse): MainCategoryId[] {
  const set = new Set<MainCategoryId>(parsed.categories);
  for (const slug of parsed.genres) {
    const main = mainFromGenreSlug(slug);
    if (main) set.add(main);
  }
  return [...set];
}

/**
 * Scope written on Confirmer.
 * A named date stays that QUAND chip. No date chip → `tous`
 * (full catalogue ≥ today Paris — not semaine, mois, or 14 days).
 */
export function nlTimeScope(parsed: SearchNlParse): TimeScopeId {
  return parsed.scope ?? bootTimeScope();
}

export function nlHasFilter(parsed: SearchNlParse): boolean {
  return Boolean(
    parsed.scope ||
      parsed.categories.length ||
      parsed.genres.length ||
      parsed.commune,
  );
}

export function previewChips(
  parsed: SearchNlParse,
  dict: SearchNlDict,
): SearchNlChip[] {
  const chips: SearchNlChip[] = [];
  const quand = quandLabel(parsed);
  if (parsed.scope && quand) {
    chips.push({ key: `quand:${parsed.scope}`, axis: 'quand', label: quand });
  }
  const seenQuoi = new Set<string>();
  for (const id of nlCategoriesToApply(parsed)) {
    if (seenQuoi.has(id)) continue;
    seenQuoi.add(id);
    chips.push({
      key: `quoi:${id}`,
      axis: 'quoi',
      label: HOME_CAT_LABEL[id],
    });
  }
  const bySlug = new Map(dict.genres.map((g) => [g.slug, g.label]));
  for (const slug of parsed.genres) {
    chips.push({
      key: `genre:${slug}`,
      axis: 'genre',
      label: bySlug.get(slug) || slug,
    });
  }
  if (parsed.commune) {
    chips.push({
      key: `ville:${parsed.commune}`,
      axis: 'ville',
      label: parsed.commune,
    });
  }
  return chips;
}

export type SearchNlMode = 'closed' | 'chips' | 'catalogue' | 'hint';

/** What sits under the field once the debounce has settled. */
export function searchNlMode(opts: {
  query: string;
  settled: boolean;
  chipCount: number;
  hitCount: number;
  dismissed: boolean;
}): SearchNlMode {
  const q = (opts.query || '').trim();
  if (q.length < SEARCH_NL_MIN_CHARS || !opts.settled || opts.dismissed) {
    return 'closed';
  }
  if (opts.chipCount > 0) return 'chips';
  if (opts.hitCount > 0) return 'catalogue';
  return 'hint';
}
