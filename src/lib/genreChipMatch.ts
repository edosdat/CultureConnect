/**
 * Catalogue QUOI / genre chips — not the 89-tag scoring vocab.
 * Extra slugs (e.g. blindtest) may exist on evenements.genre or only in titre/pitch.
 * Do not add these to phrase/reco CLOSED_VOCAB.
 */

import type { DayItem, Evenement, ProgrammeWithContext } from './types';

export type GenreMatchFields = {
  genre: string;
  title?: string;
  pitch?: string;
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
  if (slugs.includes(q)) return true;
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
  };
}

export function genreFieldsFromEvent(
  ev: Pick<Evenement, 'genre' | 'titre' | 'description_courte'>,
): GenreMatchFields {
  return {
    genre: ev.genre || '',
    title: ev.titre || '',
    pitch: ev.description_courte || '',
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
