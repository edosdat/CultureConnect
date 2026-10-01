/**
 * E4 — remplit public_cible vide sur les séances spectacle vivant,
 * à partir des mentions d'âge déjà présentes dans les descriptions.
 *
 * N'écrase jamais une valeur. Ne touche pas les lignes ciné / film_id.
 * Réécrit data/vivant-sans-public-cible.csv (reliquat).
 *
 *   npx tsx scripts/fillVivantPublicCible.ts
 *
 * Hors build. Un second passage ne modifie plus programme.csv.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nextProgrammePublicCible,
  remnantVivantSansPublicCible,
  vivantAgeMentionStats,
  type PublicCibleSourceRow,
  type VivantRemnantRow,
} from '../src/lib/publicCibleAge';
import { parisParts } from '../src/lib/timeScope';
import { stringifyCsv } from './backfillFilmTags';

const REMNANT_COLUMNS = [
  'event_id',
  'titre',
  'lieu',
  'nb_seances_a_venir',
] as const;

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      fields.push(field);
      field = '';
      continue;
    }
    field += ch;
  }
  fields.push(field);
  return fields;
}

/** Remplace une colonne sans réécrire le reste de la ligne. */
export function replaceCsvField(line: string, index: number, value: string): string {
  let field = 0;
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = false;
        }
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      if (field === index) return line.slice(0, start) + value + line.slice(i);
      field += 1;
      start = i + 1;
    }
  }
  if (field === index) return line.slice(0, start) + value;
  throw new Error(`CSV column ${index} missing`);
}

type Table = {
  newline: '\n' | '\r\n';
  header: string[];
  lines: string[];
  rows: Record<string, string>[];
};

function readTable(filePath: string): Table {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const newline: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) {
    return { newline, header: [], lines: [], rows: [] };
  }
  const header = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length !== header.length) {
      throw new Error(
        `${path.basename(filePath)} line ${i + 1}: ${cells.length} cells, header ${header.length}`,
      );
    }
    const row: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) row[header[c]] = cells[c] ?? '';
    rows.push(row);
  }
  return { newline, header, lines, rows };
}

function indexBy(rows: Record<string, string>[], key: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const id = (row[key] || '').trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return map;
}

function lieuLabel(lieu: Record<string, string> | undefined, lieuId: string): string {
  if (!lieu) return lieuId;
  return (lieu.label_affiche || lieu.nom || lieuId).trim();
}

function eventDescription(event: Record<string, string> | undefined): string {
  if (!event) return '';
  return [event.description_courte || '', event.description_longue || '']
    .filter((part) => part.trim())
    .join('\n');
}

export type FillVivantPublicCibleResult = {
  filled: number;
  mentions: number;
  filledAfter: number;
  percent: number;
  remnant: number;
};

export function measureVivantAgeFillFiles(options: {
  programmePath: string;
  evenementsPath: string;
}): { mentions: number; filled: number; percent: number } {
  const programme = readTable(options.programmePath);
  const evenements = readTable(options.evenementsPath);
  const events = indexBy(evenements.rows, 'event_id');
  return vivantAgeMentionStats(
    programme.rows.map((row) => {
      const event = events.get((row.event_id || '').trim());
      return {
        form: row.form,
        film_id: row.film_id,
        public_cible: row.public_cible,
        event_public_cible: event?.public_cible,
        description_item: row.description_item,
        event_description: eventDescription(event),
      };
    }),
  );
}

export function fillVivantPublicCibleFiles(options: {
  programmePath: string;
  evenementsPath: string;
  lieuxPath: string;
  remnantPath: string;
  today: string;
}): FillVivantPublicCibleResult {
  const programme = readTable(options.programmePath);
  const evenements = readTable(options.evenementsPath);
  const lieux = readTable(options.lieuxPath);
  const events = indexBy(evenements.rows, 'event_id');
  const lieuById = indexBy(lieux.rows, 'lieu_id');
  const pcIndex = programme.header.indexOf('public_cible');
  if (pcIndex < 0) throw new Error('programme.csv has no public_cible column');

  const sources: PublicCibleSourceRow[] = [];
  const writes: string[] = [];
  for (let i = 0; i < programme.rows.length; i++) {
    const row = programme.rows[i];
    const event = events.get((row.event_id || '').trim());
    const source: PublicCibleSourceRow = {
      form: row.form,
      film_id: row.film_id,
      public_cible: row.public_cible,
      event_public_cible: event?.public_cible,
      description_item: row.description_item,
      event_description: eventDescription(event),
    };
    const next = nextProgrammePublicCible(source);
    if (next) {
      writes.push(next);
      row.public_cible = next;
      const lineNo = i + 1;
      programme.lines[lineNo] = replaceCsvField(programme.lines[lineNo], pcIndex, next);
      source.public_cible = next;
    }
    sources.push(source);
  }

  const stats = vivantAgeMentionStats(sources);
  const remnantRows: VivantRemnantRow[] = remnantVivantSansPublicCible(
    programme.rows.map((row) => {
      const event = events.get((row.event_id || '').trim());
      const lieuId = (event?.lieu_id || row.lieu_id || '').trim();
      const resolved =
        (row.public_cible || '').trim() || (event?.public_cible || '').trim();
      return {
        event_id: row.event_id || '',
        titre: (event?.titre || row.nom_item || '').trim(),
        lieu: lieuLabel(lieuById.get(lieuId), lieuId),
        date: row.date || '',
        form: row.form,
        film_id: row.film_id,
        public_cible: resolved,
      };
    }),
    options.today,
  );

  const body = programme.lines.join(programme.newline);
  const programmeText = body.endsWith(programme.newline) ? body : body + programme.newline;
  fs.writeFileSync(options.programmePath, programmeText);
  fs.writeFileSync(
    options.remnantPath,
    stringifyCsv(
      [...REMNANT_COLUMNS],
      remnantRows as unknown as Record<string, string>[],
    ),
  );

  return {
    filled: writes.length,
    mentions: stats.mentions,
    filledAfter: stats.filled,
    percent: stats.percent,
    remnant: remnantRows.length,
  };
}

function repoData(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', 'data', name);
}

function isDirectRun(): boolean {
  const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
  return (
    entry.endsWith('/fillVivantPublicCible.ts') ||
    entry.endsWith('/fillVivantPublicCible.js')
  );
}

function main(): void {
  const today = parisParts().iso;
  const result = fillVivantPublicCibleFiles({
    programmePath: repoData('programme.csv'),
    evenementsPath: repoData('evenements.csv'),
    lieuxPath: repoData('lieux.csv'),
    remnantPath: repoData('vivant-sans-public-cible.csv'),
    today,
  });
  const percent = result.percent.toFixed(1);
  console.log(
    `fillVivantPublicCible: filled=${result.filled} mentions=${result.mentions} filled_after=${result.filledAfter} percent=${percent} remnant=${result.remnant} today=${today}`,
  );
}

if (isDirectRun()) main();
