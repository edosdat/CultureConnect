/**
 * Catalogue QUOI / genre chips — not the 89-tag scoring vocab.
 * Extra slugs (e.g. blindtest) may exist on evenements.genre or only in titre/pitch.
 * Do not add these to phrase/reco CLOSED_VOCAB.
 */

import { genreBelongsToMains, mainFromGenreSlug } from './categories';
import type { DayItem, Evenement, GenreLegend, ProgrammeWithContext } from './types';

export type GenreMatchFields = {
  genre: string;
  title?: string;
  pitch?: string;
  tags?: string;
  publicCible?: string;
};

/** Closed UI chip labels, separate from vocab 89. */
export const EXTRA_GENRE_CHIP_LABELS: Record<string, string> = {
  blindtest: 'Blind test',
};

const BLINDTEST_SLUGS = new Set(['blindtest', 'blind_test', 'blind-test']);

export function isBlindTestChip(slug: string): boolean {
  return BLINDTEST_SLUGS.has(slug.trim().toLowerCase());
}

/** Accents off, lowercase — hyphens/underscores kept for the blind-test regex. */
export function normalizeGenreChipText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Titre/pitch/genre: "Blind-Test", "Blindtest", "blind test". Karaoke does not match. */
export function looksLikeBlindTest(text: string): boolean {
  const n = normalizeGenreChipText(text);
  if (!n) return false;
  return /blind[\s_\-]?test/.test(n);
}

export function splitGenreField(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[|,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Jazz chip vs `jazz_blues` column (and raw `jazz` on some bar séances). */
const GENRE_CHIP_ALIASES: Record<string, readonly string[]> = {
  jazz: ['jazz_blues'],
  jazz_blues: ['jazz'],
};

function genreTokens(slug: string): string[] {
  return slug
    .toLowerCase()
    .split(/[|_]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Chip slug + aliases + underscore tokens (`jazz_blues` → jazz, blues). */
export function genreChipMatchKeys(chip: string): string[] {
  const q = chip.trim().toLowerCase();
  if (!q) return [];
  const keys = new Set<string>([q, ...(GENRE_CHIP_ALIASES[q] ?? [])]);
  for (const token of genreTokens(q)) {
    keys.add(token);
    for (const alias of GENRE_CHIP_ALIASES[token] ?? []) keys.add(alias);
  }
  return Array.from(keys);
}

export function genreChipHaystack(fields: GenreMatchFields): string {
  return [fields.genre, fields.title, fields.pitch].filter(Boolean).join(' ');
}

export function itemMatchesGenreChip(
  fields: GenreMatchFields,
  chip: string,
): boolean {
  const q = chip.trim().toLowerCase();
  if (!q) return true;
  const slugs = splitGenreField(fields.genre);
  const keys = new Set(genreChipMatchKeys(q));
  for (const slug of slugs) {
    if (keys.has(slug)) return true;
    if (genreTokens(slug).some((t) => keys.has(t))) return true;
  }
  if (isBlindTestChip(q) && looksLikeBlindTest(genreChipHaystack(fields))) {
    return true;
  }
  return false;
}

export function matchesSelectedGenres(
  fields: GenreMatchFields,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  return selected.some((chip) => itemMatchesGenreChip(fields, chip));
}

/**
 * Keep a tapped genre chip even when the filtered page no longer lists it.
 * Only drop chips when the QUOI category is cleared or the slug leaves that main.
 */
export function retainSelectedGenreChips(
  selected: string[],
  selectedMains: string[],
  legend: Pick<GenreLegend, 'slug' | 'famille'>[],
): string[] {
  if (selected.length === 0) return selected;
  if (selectedMains.length === 0) return [];
  const legendBySlug = new Map(legend.map((g) => [g.slug, g]));
  const next = selected.filter((slug) => {
    const g = legendBySlug.get(slug);
    if (g) return genreBelongsToMains(g, selectedMains);
    const m = mainFromGenreSlug(slug);
    if (m != null) return selectedMains.includes(m);
    // Raw catalogue slugs (`jazz`, `jam`) are not in GENRE_SLUG_TO_MAIN.
    return selectedMains.includes('musique');
  });
  return next.length === selected.length ? selected : next;
}

/** Selected chips stay visible even if the API slug list shrank. */
export function visibleGenreChipSlugs(
  available: string[],
  selected: string[],
): string[] {
  if (selected.length === 0) return available;
  const set = new Set(available);
  for (const slug of selected) {
    const s = slug.trim();
    if (s) set.add(s);
  }
  return Array.from(set);
}

/** Raw genre column plus inferred catalogue chips (blindtest from title/pitch). */
export function genreSlugsOfFields(fields: GenreMatchFields): string[] {
  const slugs = splitGenreField(fields.genre);
  if (looksLikeBlindTest(genreChipHaystack(fields)) && !slugs.includes('blindtest')) {
    slugs.push('blindtest');
  }
  return slugs;
}

export function genreFieldsFromProgramme(
  p: ProgrammeWithContext,
): GenreMatchFields {
  return {
    genre: p.programme.genre || p.evenement?.genre || '',
    title: [p.programme.nom_item, p.evenement?.titre].filter(Boolean).join(' '),
    pitch: [
      p.programme.description_item,
      p.evenement?.description_courte,
    ]
      .filter(Boolean)
      .join(' '),
    tags: p.evenement?.tags || '',
    publicCible:
      p.programme.public_cible || p.evenement?.public_cible || '',
  };
}

export function genreFieldsFromEvent(
  ev: Pick<
    Evenement,
    'genre' | 'titre' | 'description_courte' | 'tags' | 'public_cible'
  >,
): GenreMatchFields {
  return {
    genre: ev.genre || '',
    title: ev.titre || '',
    pitch: ev.description_courte || '',
    tags: ev.tags || '',
    publicCible: ev.public_cible || '',
  };
}

export function genreFieldsFromDayItem(item: DayItem): GenreMatchFields {
  if (item.kind === 'programme') {
    return {
      genre: item.programme.genre || item.evenement?.genre || '',
      title: [item.programme.nom_item, item.evenement?.titre]
        .filter(Boolean)
        .join(' '),
      pitch: [
        item.programme.description_item,
        item.evenement?.description_courte,
      ]
        .filter(Boolean)
        .join(' '),
      tags: item.evenement?.tags || '',
      publicCible:
        item.programme.public_cible || item.evenement?.public_cible || '',
    };
  }
  return genreFieldsFromEvent(item.evenement);
}

export function genreSlugsFromItems(items: DayItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const g of genreSlugsOfFields(genreFieldsFromDayItem(item))) {
      set.add(g);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}
