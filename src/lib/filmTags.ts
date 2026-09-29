/**
 * Magasin de tags au niveau de l'œuvre.
 * Un film taggé une fois reste taggé sur toutes ses séances, y compris
 * celles ajoutées par un sync ultérieur.
 *
 * Priorité, pour un film_id :
 *   1. films.csv (saisie humaine, source durable)
 *   2. sinon, la meilleure ligne sœur de programme.csv (règle T1)
 *   3. sinon, rien
 *
 * NE PAS confondre avec l'héritage parent (P0 / L2) : la source sœur est une
 * AUTRE SÉANCE DU MÊME FILM (même film_id), jamais l'événement-saison.
 *
 * Une seule source par film_id — pas l'union des lignes sœurs, ni un
 * mélange films.csv + sœur.
 */
import type { ProgrammeItem } from './types';

export type WorkTags = {
  moods: string;
  genres_mood: string;
  themes: string;
};

/** Ligne de programme réduite aux champs lus par le magasin. */
export type TagSourceRow = {
  programme_id?: string;
  film_id?: string;
  nom_item?: string;
  date?: string;
  form?: string;
  moods?: string;
  genres_mood?: string;
  themes?: string;
  mood_source?: string;
  mood_confiance?: string;
  scraped_at?: string;
};

/** Ligne films.csv réduite aux champs lus par le magasin. */
export type FilmTagRecord = {
  film_id?: string;
  titre?: string;
  nb_seances?: string;
  moods?: string;
  genres_mood?: string;
  themes?: string;
};

export type FilmATaggerRow = {
  film_id: string;
  titre: string;
  nb_seances: string;
};

/** Horizon des mesures du constat (séances de date ≥ ce jour). */
export const FILMS_A_TAGGER_HORIZON = '2026-09-27';

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
function compareSourceRows(a: TagSourceRow, b: TagSourceRow): number {
  const byConf = confidenceRank(b.mood_confiance) - confidenceRank(a.mood_confiance);
  if (byConf !== 0) return byConf;
  const byScraped = cmp(text(b.scraped_at), text(a.scraped_at));
  if (byScraped !== 0) return byScraped;
  return cmp(text(a.programme_id), text(b.programme_id));
}

function isParentMoodSource(row: TagSourceRow): boolean {
  return text(row.mood_source).toLowerCase() === 'parent';
}

function workTagsFromRow(row: TagSourceRow): WorkTags {
  return {
    moods: text(row.moods),
    genres_mood: text(row.genres_mood),
    themes: text(row.themes),
  };
}

function workTagsFromFilm(film: FilmTagRecord): WorkTags | null {
  const tags = workTagsFromRow(film);
  if (!tags.moods && !tags.genres_mood && !tags.themes) return null;
  return tags;
}

export function buildFilmTagStore(
  rows: readonly TagSourceRow[],
  films: readonly FilmTagRecord[] = [],
): Map<string, WorkTags> {
  const best = new Map<string, TagSourceRow>();
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
  // films.csv wins as a whole set, even against a haute sibling line.
  // A blank films.csv row does not count: the sibling set stays.
  const seenHuman = new Set<string>();
  for (const film of films) {
    const filmId = text(film.film_id);
    if (!filmId || seenHuman.has(filmId)) continue;
    const tags = workTagsFromFilm(film);
    if (!tags) continue;
    seenHuman.add(filmId);
    store.set(filmId, tags);
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

/**
 * Copy the T1 sibling set into empty films.csv cells.
 * Never overwrites a non-empty moods / genres_mood / themes value.
 * Does not insert film_id rows that exist only in programme.csv.
 */
export function backfillFilmTagRows<T extends FilmTagRecord>(
  films: readonly T[],
  programme: readonly TagSourceRow[],
): { rows: T[]; filled: number } {
  const store = buildFilmTagStore(programme);
  let filled = 0;
  const rows = films.map((film) => {
    const filmId = text(film.film_id);
    const tags = filmId ? store.get(filmId) : undefined;
    if (!tags) return film;
    const next = {
      moods: text(film.moods) ? (film.moods ?? '') : tags.moods,
      genres_mood: text(film.genres_mood)
        ? (film.genres_mood ?? '')
        : tags.genres_mood,
      themes: text(film.themes) ? (film.themes ?? '') : tags.themes,
    };
    if (
      next.moods === (film.moods ?? '') &&
      next.genres_mood === (film.genres_mood ?? '') &&
      next.themes === (film.themes ?? '')
    ) {
      return film;
    }
    filled += 1;
    return { ...film, ...next };
  });
  return { rows, filled };
}

/**
 * Films ciné à venir jamais taggés (ni films.csv, ni ligne sœur hors parent).
 * `nb_seances` est la colonne de films.csv. Si l'œuvre n'y figure pas, on
 * compte les séances ciné à venir — on n'invente pas de titre au-delà de
 * nom_item déjà présent sur la séance.
 */
export function listFilmsATagger(
  programme: readonly TagSourceRow[],
  films: readonly FilmTagRecord[],
  today = FILMS_A_TAGGER_HORIZON,
): FilmATaggerRow[] {
  const store = buildFilmTagStore(programme, films);
  const upcoming = new Map<
    string,
    { count: number; titre: string; programmeId: string }
  >();
  for (const row of programme) {
    const filmId = text(row.film_id);
    if (!filmId) continue;
    const date = text(row.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) continue;
    if (text(row.form) !== 'cine') continue;
    const programmeId = text(row.programme_id);
    const current = upcoming.get(filmId);
    if (!current) {
      upcoming.set(filmId, {
        count: 1,
        titre: text(row.nom_item),
        programmeId,
      });
      continue;
    }
    current.count += 1;
    if (programmeId && (!current.programmeId || programmeId < current.programmeId)) {
      current.programmeId = programmeId;
      const titre = text(row.nom_item);
      if (titre) current.titre = titre;
    }
  }

  const filmById = new Map<string, FilmTagRecord>();
  for (const film of films) {
    const filmId = text(film.film_id);
    if (!filmId || filmById.has(filmId)) continue;
    filmById.set(filmId, film);
  }

  const out: FilmATaggerRow[] = [];
  for (const [filmId, info] of upcoming) {
    if (store.has(filmId)) continue;
    const film = filmById.get(filmId);
    const fromCsv = text(film?.nb_seances);
    out.push({
      film_id: filmId,
      titre: text(film?.titre) || info.titre,
      nb_seances: fromCsv || String(info.count),
    });
  }
  out.sort((a, b) => {
    const byNb = (Number(b.nb_seances) || 0) - (Number(a.nb_seances) || 0);
    if (byNb !== 0) return byNb;
    return cmp(a.film_id, b.film_id);
  });
  return out;
}
