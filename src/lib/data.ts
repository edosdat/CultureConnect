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
  return readCsv<Lieu>('lieux.csv');
}

export function loadEvenements(): Evenement[] {
  return readCsv<Evenement>('evenements.csv');
}

export function loadProgramme(): ProgrammeItem[] {
  const rows = readCsv<ProgrammeItem>('programme.csv');
  // Ensure artiste_id is always a string even on older CSVs
  return rows.map((r) => ({
    ...r,
    artiste_id: r.artiste_id ?? '',
  }));
}

export function loadGenresLegend(): GenreLegend[] {
  return readCsv<GenreLegend>('genres_legend.csv');
}

export function loadArtistes(): Artiste[] {
  if (!csvExists('artistes.csv')) return [];
  return readCsv<Artiste>('artistes.csv');
}

export function loadCultureData(): CultureData {
  const lieux = loadLieux();
  const evenements = loadEvenements();
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
    events,
    programmeWithContext,
    genresLegend,
    artistes: hasTable ? artistes : artistesWithDates.map((a) => ({
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
