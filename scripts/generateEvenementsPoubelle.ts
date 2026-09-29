/**
 * L1 — write data/evenements-poubelle.csv (review + purge input).
 * Usage: npx tsx scripts/generateEvenementsPoubelle.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { isJunkTitle, junkTitleReason } from '../src/lib/junkTitle';

type EvRow = {
  event_id: string;
  titre: string;
  lieu_id: string;
  categorie: string;
  date_debut: string;
  url_source: string;
};

type ProgRow = { event_id: string };

function readCsv<T extends object>(filename: string): T[] {
  const text = fs.readFileSync(path.join(process.cwd(), 'data', filename), 'utf8');
  return Papa.parse<T>(text, { header: true, skipEmptyLines: true }).data;
}

function main(): void {
  const events = readCsv<EvRow>('evenements.csv');
  const programme = readCsv<ProgRow>('programme.csv');
  const seanceCount = new Map<string, number>();
  for (const row of programme) {
    const id = (row.event_id || '').trim();
    if (!id) continue;
    seanceCount.set(id, (seanceCount.get(id) || 0) + 1);
  }

  const out = events
    .filter((ev) => isJunkTitle(ev.titre || ''))
    .map((ev) => {
      const reason = junkTitleReason(ev.titre || '') || '';
      return {
        event_id: ev.event_id,
        titre: ev.titre,
        lieu_id: ev.lieu_id,
        categorie: ev.categorie,
        date_debut: ev.date_debut,
        nb_seances: String(seanceCount.get(ev.event_id) || 0),
        url_source: ev.url_source || '',
        reason,
      };
    })
    .sort((a, b) => {
      if (a.reason !== b.reason) return a.reason.localeCompare(b.reason);
      return a.event_id.localeCompare(b.event_id);
    });

  const csv = Papa.unparse(out, {
    columns: [
      'event_id',
      'titre',
      'lieu_id',
      'categorie',
      'date_debut',
      'nb_seances',
      'url_source',
      'reason',
    ],
  });
  const dest = path.join(process.cwd(), 'data', 'evenements-poubelle.csv');
  fs.writeFileSync(dest, csv.endsWith('\n') ? csv : `${csv}\n`, 'utf8');

  const seances = out.reduce((n, row) => n + Number(row.nb_seances || 0), 0);
  const byReason: Record<string, { events: number; seances: number }> = {};
  for (const row of out) {
    byReason[row.reason] ||= { events: 0, seances: 0 };
    byReason[row.reason].events += 1;
    byReason[row.reason].seances += Number(row.nb_seances || 0);
  }
  console.log(
    JSON.stringify(
      { path: dest, events: out.length, seances, byReason },
      null,
      2,
    ),
  );
}

main();
