/**
 * Normalisation d'une ligne programme.csv.
 * Aucun accès disque, aucun server-only : `data.ts` et le banc
 * (`scripts/loadCatalogue.ts`) passent par ici, sinon les tags divergent.
 */
import { fillEmptyCineForm } from './formCine';
import {
  buildFilmTagStore,
  fillEmptyWorkTags,
  type FilmTagRecord,
  type WorkTags,
} from './filmTags';
import { pressFieldDefaults } from './pressCitation';
import type { ProgrammeItem } from './types';

function cell(raw: Record<string, string | undefined>, key: string): string {
  return raw[key] ?? '';
}

/**
 * Défauts de colonnes + form=cine si `film_id` officiel et form vide.
 * `store` est le magasin T1/T2 (`buildFilmTagStore`) du fichier entier.
 * Sans store, les tags de la ligne ne sont pas complétés.
 */
export function normalizeProgrammeRow(
  raw: Record<string, string | undefined>,
  store?: Map<string, WorkTags>,
): ProgrammeItem {
  const base = {
    ...raw,
    programme_id: cell(raw, 'programme_id'),
    event_id: cell(raw, 'event_id'),
    lieu_id: cell(raw, 'lieu_id'),
    nom_item: cell(raw, 'nom_item'),
    type_item: cell(raw, 'type_item'),
    date: cell(raw, 'date'),
    heure_debut: cell(raw, 'heure_debut'),
    heure_fin: cell(raw, 'heure_fin'),
    scene_salle: cell(raw, 'scene_salle'),
    prix_item: cell(raw, 'prix_item'),
    url: cell(raw, 'url'),
    notes: cell(raw, 'notes'),
    genre: cell(raw, 'genre'),
    artiste_id: cell(raw, 'artiste_id'),
    film_id: cell(raw, 'film_id'),
    description_item: cell(raw, 'description_item'),
    image_url: cell(raw, 'image_url'),
    billetterie_url: cell(raw, 'billetterie_url'),
    duree_min: cell(raw, 'duree_min'),
    public_cible: cell(raw, 'public_cible'),
    langue: cell(raw, 'langue'),
    scraped_at: cell(raw, 'scraped_at'),
    form: fillEmptyCineForm(raw.form, raw.film_id),
    moods: cell(raw, 'moods'),
    mood_source: cell(raw, 'mood_source'),
    mood_confiance: cell(raw, 'mood_confiance'),
    genres_mood: cell(raw, 'genres_mood'),
    themes: cell(raw, 'themes'),
    entities: cell(raw, 'entities'),
    ...pressFieldDefaults(raw),
  } as ProgrammeItem;
  if (!store) return base;
  return fillEmptyWorkTags(base, store);
}

/**
 * Un seul passage pour tout le fichier : films.csv, sinon la meilleure
 * séance sœur, puis fill-empty. Les deux chargeurs appellent cette fonction.
 */
export function normalizeProgrammeRows(
  rawRows: readonly Record<string, string | undefined>[],
  films: readonly FilmTagRecord[] = [],
): ProgrammeItem[] {
  const store = buildFilmTagStore(rawRows, films);
  return rawRows.map((raw) => normalizeProgrammeRow(raw, store));
}
