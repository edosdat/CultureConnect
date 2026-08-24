import 'server-only';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import {
  buildArtistesDerived,
  buildArtistesFromTable,
} from './artists';
import type {
  Artiste,
  CultureData,
  Evenement,
  EventWithDetails,
  Film,
  GenreLegend,
  Lieu,
  ProgrammeItem,
  ProgrammeWithContext,
} from './types';

function readCsv<T extends Record<string, string>>(filename: string): T[] {
  const filePath = path.join(process.cwd(), 'data', filename);
  const text = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    console.warn(`CSV parse warnings for ${filename}:`, parsed.errors.slice(0, 3));
  }
  return parsed.data.map((row) => {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      cleaned[key.trim()] = typeof value === 'string' ? value.trim() : '';
    }
    return cleaned as T;
  });
}

function csvExists(filename: string): boolean {
  return fs.existsSync(path.join(process.cwd(), 'data', filename));
}

export function loadLieux(): Lieu[] {
  return readCsv<Lieu>('lieux.csv').map((r) => ({
    ...r,
    label_affiche: r.label_affiche ?? '',
  }));
}

export function loadEvenements(): Evenement[] {
  return readCsv<Evenement>('evenements.csv').map((r) => ({
    ...r,
    description_longue: r.description_longue ?? '',
    tags: r.tags ?? '',
    public_cible: r.public_cible ?? '',
    age_min: r.age_min ?? '',
    duree_min: r.duree_min ?? '',
    langue: r.langue ?? '',
    casting: r.casting ?? '',
    image_url: r.image_url ?? '',
    billetterie_url: r.billetterie_url ?? '',
    accessibilite: r.accessibilite ?? '',
    organisateur: r.organisateur ?? '',
    scraped_at: r.scraped_at ?? '',
    source_extrait: r.source_extrait ?? '',
  }));
}

export function loadFilms(): Film[] {
  if (!csvExists('films.csv')) return [];
  return readCsv<Film>('films.csv').map((r) => ({
    ...r,
    titre: r.titre ?? '',
    titre_normalise: r.titre_normalise ?? '',
    genre_principal: r.genre_principal ?? '',
    nb_seances: r.nb_seances ?? '',
    nb_salles: r.nb_salles ?? '',
    lieux_ids: r.lieux_ids ?? '',
    image_url: r.image_url ?? '',
    notes: r.notes ?? '',
  }));
}

export function loadProgramme(): ProgrammeItem[] {
  const rows = readCsv<ProgrammeItem>('programme.csv');
  // Official film_id from CSV only — do not invent from titre matching.
  return rows.map((r) => ({
    ...r,
    artiste_id: r.artiste_id ?? '',
    film_id: r.film_id ?? '',
    description_item: r.description_item ?? '',
    image_url: r.image_url ?? '',
    billetterie_url: r.billetterie_url ?? '',
    duree_min: r.duree_min ?? '',
    public_cible: r.public_cible ?? '',
    scraped_at: r.scraped_at ?? '',
  }));
}

export function loadGenresLegend(): GenreLegend[] {
  return readCsv<GenreLegend>('genres_legend.csv');
}

export function loadArtistes(): Artiste[] {
  if (!csvExists('artistes.csv')) return [];
  return readCsv<Artiste>('artistes.csv').map((r) => ({
    ...r,
    bio_courte: r.bio_courte ?? '',
    url_site: r.url_site ?? '',
    url_reseaux: r.url_reseaux ?? '',
    scraped_at: r.scraped_at ?? '',
  }));
}

export function loadCultureData(): CultureData {
  const lieux = loadLieux();
  const evenements = loadEvenements();
  const films = loadFilms();
  const programme = loadProgramme();
  const genresLegend = loadGenresLegend();
  const artistes = loadArtistes();

  const lieuxById = new Map(lieux.map((l) => [l.lieu_id, l]));
  const evenementsById = new Map(evenements.map((e) => [e.event_id, e]));

  const programmeByEvent = new Map<string, ProgrammeItem[]>();
  for (const item of programme) {
    const list = programmeByEvent.get(item.event_id) ?? [];
    list.push(item);
    programmeByEvent.set(item.event_id, list);
  }

  const events: EventWithDetails[] = evenements.map((ev) => ({
    ...ev,
    lieu: lieuxById.get(ev.lieu_id) ?? null,
    programme: programmeByEvent.get(ev.event_id) ?? [],
  }));

  const programmeWithContext: ProgrammeWithContext[] = programme.map((item) => {
    const evenement = evenementsById.get(item.event_id) ?? null;
    const lieuId = item.lieu_id || evenement?.lieu_id || '';
    return {
      programme: item,
      evenement,
      lieu: lieuId ? lieuxById.get(lieuId) ?? null : null,
    };
  });

  const hasTable = artistes.length > 0;
  const artistesWithDates = hasTable
    ? buildArtistesFromTable(artistes, programmeWithContext)
    : buildArtistesDerived(programmeWithContext);

  return {
    lieux,
    evenements,
    programme,
    films,
    events,
    programmeWithContext,
    genresLegend,
    artistes: hasTable
      ? artistes
      : artistesWithDates.map((a) => ({
          artiste_id: a.artiste_id,
          nom: a.nom,
          nom_normalise: a.nom_normalise,
          genre_principal: a.genre_principal,
          genres_secondaires: a.genres_secondaires,
          url_photo: a.url_photo,
          notes: a.notes,
        })),
    artistesWithDates,
    artistesMode: hasTable ? 'table' : 'derived',
  };
}

/** @deprecated Prefer loadCultureData — kept for compatibility */
export function loadEventsWithDetails(): EventWithDetails[] {
  return loadCultureData().events;
}
