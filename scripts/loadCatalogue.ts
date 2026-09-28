/**
 * Dev-only catalogue loader for the reco bench.
 *
 * Mirrors `src/lib/data.ts` CSV join (lieux + evenements + programme, plus
 * tags_evenements.csv on event_id) without importing that module — `data.ts`
 * starts with `server-only`, which throws under plain `tsx`. Scoring still
 * goes through `itemsForDay` / `itemsForDateRange` + `recommendForProfile`.
 * V2 tags hang off `evenement.tags_v2` and do not replace v1 `moods`.
 * Read-only: never writes `data/`.
 *
 * Programme rows go through `normalizeProgrammeRows`, the same function as
 * `loadProgramme`. Tag fields cannot drift between the bench and production.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { attachEventTags, indexEventTags } from '../src/lib/eventTags';
import { normalizeProgrammeRows } from '../src/lib/programmeRow';
import { lastDateOfSeries } from '../src/lib/theatreUrgence';
import type {
  Evenement,
  EventWithDetails,
  Film,
  Lieu,
  ProgrammeItem,
  ProgrammeWithContext,
} from '../src/lib/types';

/** CSV cells are strings. The row type may also carry fields joined after parse. */
function readCsv<T extends object>(filename: string): T[] {
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

function loadLieux(): Lieu[] {
  return readCsv<Lieu>('lieux.csv').map((r) => ({
    ...r,
    label_affiche: r.label_affiche ?? '',
    lat: r.lat ?? '',
    lng: r.lng ?? '',
  }));
}

function loadEvenements(): Evenement[] {
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
    publication: r.publication ?? '',
    form: r.form ?? '',
    moods: r.moods ?? '',
    mood_source: r.mood_source ?? '',
    mood_confiance: r.mood_confiance ?? '',
    genres_mood: r.genres_mood ?? '',
    themes: r.themes ?? '',
    entities: r.entities ?? '',
  }));
}

function csvExists(filename: string): boolean {
  return fs.existsSync(path.join(process.cwd(), 'data', filename));
}

function loadFilms(): Film[] {
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
    moods: r.moods ?? '',
    genres_mood: r.genres_mood ?? '',
    themes: r.themes ?? '',
  }));
}

function loadProgramme(): ProgrammeItem[] {
  return normalizeProgrammeRows(
    readCsv<Record<string, string>>('programme.csv'),
    loadFilms(),
  );
}

export type BenchCatalogue = {
  evenements: Evenement[];
  programme: ProgrammeItem[];
  events: EventWithDetails[];
  programmeWithContext: ProgrammeWithContext[];
  maxIso: string;
};

/** Same join as `buildCultureData`, minus artistes / byMain (unused by Matching A). */
export function loadBenchCatalogue(): BenchCatalogue {
  const lieux = loadLieux();
  const evenements = loadEvenements();
  attachEventTags(
    evenements,
    csvExists('tags_evenements.csv')
      ? indexEventTags(readCsv<Record<string, string>>('tags_evenements.csv'))
      : indexEventTags(null),
  );
  const programme = loadProgramme();

  const lieuxById = new Map(lieux.map((l) => [l.lieu_id, l]));
  const evenementsById = new Map(evenements.map((e) => [e.event_id, e]));

  const programmeByEvent = new Map<string, ProgrammeItem[]>();
  for (const item of programme) {
    const list = programmeByEvent.get(item.event_id) ?? [];
    list.push(item);
    programmeByEvent.set(item.event_id, list);
  }

  for (const ev of evenements) {
    const rows = programmeByEvent.get(ev.event_id) ?? [];
    ev.last_seance_date =
      lastDateOfSeries({
        programmeDates: rows.map((p) => p.date),
        dateFin: ev.date_fin,
      }) ?? '';
    // Fill-empty: event linked to an official film_id → form=cine. Never overwrite.
    if (!(ev.form || '').trim() && rows.some((p) => (p.film_id || '').trim())) {
      ev.form = 'cine';
    }
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

  let maxIso = '';
  const bumpMax = (raw: string | undefined | null) => {
    const d = (raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > maxIso) maxIso = d;
  };
  for (const p of programmeWithContext) bumpMax(p.programme.date);
  for (const ev of events) {
    bumpMax(ev.date_debut);
    bumpMax(ev.date_fin);
  }

  return {
    evenements,
    programme,
    events,
    programmeWithContext,
    maxIso,
  };
}
