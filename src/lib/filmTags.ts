/**
 * Magasin de tags au niveau de l'œuvre.
 * Un film taggé une fois reste taggé sur toutes ses séances, y compris
 * celles ajoutées par un sync ultérieur.
 *
 * NE PAS confondre avec l'héritage parent (P0) : ici la source est une
 * AUTRE SÉANCE DU MÊME FILM (même film_id), jamais l'événement-saison.
 *
 * Une seule ligne source par film_id — pas l'union des lignes sœurs.
 */
import type { ProgrammeItem } from './types';

export type WorkTags = {
  moods: string;
  genres_mood: string;
  themes: string;
};

const CONFIDENCE_RANK: Record<string, number> = {
  haute: 3,
  moyenne: 2,
  basse: 1,
};

function text(value: string | undefined | null): string {
  return (value || '').trim();
}

function confidenceRank(value: string | undefined | null): number {
  return CONFIDENCE_RANK[text(value).toLowerCase()] ?? 0;
}

function cmp(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Better source first.
 * mood_confiance desc (haute > moyenne > basse > vide),
 * then scraped_at desc, then programme_id asc.
 */
function compareSourceRows(a: ProgrammeItem, b: ProgrammeItem): number {
  const byConf = confidenceRank(b.mood_confiance) - confidenceRank(a.mood_confiance);
  if (byConf !== 0) return byConf;
  const byScraped = cmp(text(b.scraped_at), text(a.scraped_at));
  if (byScraped !== 0) return byScraped;
  return cmp(text(a.programme_id), text(b.programme_id));
}

function isParentMoodSource(row: ProgrammeItem): boolean {
  return text(row.mood_source).toLowerCase() === 'parent';
}

function workTagsFromRow(row: ProgrammeItem): WorkTags {
  return {
    moods: text(row.moods),
    genres_mood: text(row.genres_mood),
    themes: text(row.themes),
  };
}

export function buildFilmTagStore(rows: ProgrammeItem[]): Map<string, WorkTags> {
  const best = new Map<string, ProgrammeItem>();
  for (const row of rows) {
    const filmId = text(row.film_id);
    if (!filmId) continue;
    if (!text(row.moods)) continue;
    if (isParentMoodSource(row)) continue;
    const current = best.get(filmId);
    if (!current || compareSourceRows(row, current) < 0) {
      best.set(filmId, row);
    }
  }
  const store = new Map<string, WorkTags>();
  for (const [filmId, row] of best) {
    store.set(filmId, workTagsFromRow(row));
  }
  return store;
}

/** Fill-empty uniquement — n'écrase jamais un tag déjà présent sur la ligne. */
export function fillEmptyWorkTags(
  row: ProgrammeItem,
  store: Map<string, WorkTags>,
): ProgrammeItem {
  const filmId = text(row.film_id);
  if (!filmId) return row;
  const tags = store.get(filmId);
  if (!tags) return row;

  const moodsEmpty = !text(row.moods);
  const genresEmpty = !text(row.genres_mood);
  const themesEmpty = !text(row.themes);

  const moods = moodsEmpty && tags.moods ? tags.moods : row.moods;
  const genresMood =
    genresEmpty && tags.genres_mood ? tags.genres_mood : row.genres_mood;
  const themes = themesEmpty && tags.themes ? tags.themes : row.themes;

  const filledMoods = moodsEmpty && Boolean(tags.moods);
  const filledGenres = genresEmpty && Boolean(tags.genres_mood);
  const filledThemes = themesEmpty && Boolean(tags.themes);
  if (!filledMoods && !filledGenres && !filledThemes) return row;

  return {
    ...row,
    moods,
    genres_mood: genresMood,
    themes,
    // Provenance of the moods cell. Sibling genres/themes filled onto a
    // row that already has its own moods keep that row's mood_source.
    mood_source: filledMoods ? 'work' : row.mood_source,
  };
}
