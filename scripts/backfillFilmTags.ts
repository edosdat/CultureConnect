/**
 * One-shot. Copies the T1 sibling tag set into data/films.csv.
 *
 * Not part of `npm run build` or `npm test`. Do not wire it into the build:
 * a cine sync rewrites programme.csv, and tags belong in films.csv afterwards.
 *
 * Fill-empty: a non-empty moods / genres_mood / themes cell is never overwritten.
 * Re-running is a no-op once those cells are filled (same file bytes).
 * A film_id that exists only in programme.csv is not inserted.
 *
 *   npx tsx scripts/backfillFilmTags.ts
 *   npx tsx scripts/backfillFilmTags.ts --list
 *
 * `--list` rewrites data/films-a-tagger.csv and does not touch films.csv.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  FILMS_A_TAGGER_HORIZON,
  backfillFilmTagRows,
  listFilmsATagger,
  type FilmTagRecord,
  type TagSourceRow,
} from '../src/lib/filmTags';

const TAG_COLUMNS = ['moods', 'genres_mood', 'themes'] as const;

export function parseCsv(text: string): {
  columns: string[];
  rows: Record<string, string>[];
} {
  const table = parseTable(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (table.length === 0) return { columns: [], rows: [] };
  const columns = table[0].map((column) => column.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < table.length; i++) {
    const record = table[i];
    if (record.length === 1 && record[0] === '') continue;
    const row: Record<string, string> = {};
    for (let c = 0; c < columns.length; c++) {
      row[columns[c]] = record[c] ?? '';
    }
    rows.push(row);
  }
  return { columns, rows };
}

export function stringifyCsv(
  columns: string[],
  rows: readonly Record<string, string>[],
): string {
  const lines = [columns.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(row[column] ?? '')).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
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
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function withTagColumns(columns: string[]): string[] {
  const next = [...columns];
  for (const column of TAG_COLUMNS) {
    if (!next.includes(column)) next.push(column);
  }
  return next;
}

export function backfillFilmTagsFiles(options: {
  filmsPath: string;
  programmePath: string;
}): { filled: number } {
  const films = parseCsv(fs.readFileSync(options.filmsPath, 'utf8'));
  const programme = parseCsv(fs.readFileSync(options.programmePath, 'utf8'));
  const { rows, filled } = backfillFilmTagRows(
    films.rows,
    programme.rows as TagSourceRow[],
  );
  const columns = withTagColumns(films.columns);
  fs.writeFileSync(options.filmsPath, stringifyCsv(columns, rows));
  return { filled };
}

export function writeFilmsATaggerFile(options: {
  filmsPath: string;
  programmePath: string;
  outPath: string;
  today?: string;
}): { count: number } {
  const films = parseCsv(fs.readFileSync(options.filmsPath, 'utf8'));
  const programme = parseCsv(fs.readFileSync(options.programmePath, 'utf8'));
  const listed = listFilmsATagger(
    programme.rows as TagSourceRow[],
    films.rows as FilmTagRecord[],
    options.today ?? FILMS_A_TAGGER_HORIZON,
  );
  const csv = stringifyCsv(
    ['film_id', 'titre', 'nb_seances'],
    listed,
  );
  fs.writeFileSync(options.outPath, csv);
  return { count: listed.length };
}

function repoData(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', 'data', name);
}

function isDirectRun(): boolean {
  const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
  return entry.endsWith('/backfillFilmTags.ts') || entry.endsWith('/backfillFilmTags.js');
}

function main(): void {
  const filmsPath = repoData('films.csv');
  const programmePath = repoData('programme.csv');
  if (process.argv.includes('--list')) {
    const { count } = writeFilmsATaggerFile({
      filmsPath,
      programmePath,
      outPath: repoData('films-a-tagger.csv'),
    });
    console.log(`films-a-tagger: ${count} film(s)`);
    return;
  }
  const { filled } = backfillFilmTagsFiles({ filmsPath, programmePath });
  console.log(`backfillFilmTags: ${filled} ligne(s) remplie(s)`);
}

if (isDirectRun()) main();
