/**
 * Internal real30 export — hashed account_tastes → bench `--profiles` JSON.
 *
 * Usage:
 *   npm run bench:export-real30
 *   npm run bench:export-real30 -- --out bench-results/real30/2026-09-15.json
 *
 * Then:
 *   npm run bench -- --profiles bench-results/real30/2026-09-15.json
 *
 * Reads Neon via `listAccountTastesForAdmin` (same store as KPI 18 / #140).
 * States as-is. Hash only. Writes gitignored `bench-results/real30/`.
 * Exit 0 even when 0 eligible (⚠). Never writes `data/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { listAccountTastesForAdmin } from '../src/lib/accountTasteAdminList';
import { ADMIN_TASTES_CAP } from '../src/lib/adminAnalytics';
import { buildReal30Export } from '../src/lib/real30Export';

function parseArgs(argv: string[]): { out: string | null } {
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--out') {
      if (!value || value.startsWith('--')) {
        console.error('Usage: npm run bench:export-real30 -- --out <file.json>');
      } else {
        out = value;
        i += 1;
      }
    }
  }
  return { out };
}

function defaultOutPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(process.cwd(), 'bench-results', 'real30', `${date}.json`);
}

function resolveOut(explicit: string | null): string {
  if (!explicit) return defaultOutPath();
  return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
}

async function main(): Promise<void> {
  const { out } = parseArgs(process.argv.slice(2));
  const neonUrl = (process.env['POSTGRES_URL'] || process.env['POSTGRES_URL_NON_POOLING'] || '').trim();
  const rows = await listAccountTastesForAdmin(ADMIN_TASTES_CAP, { asIs: true });
  const payload = buildReal30Export(rows);
  const { n_total, n_eligible, n_cold } = payload.counts;

  const outPath = resolveOut(out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');

  const warnEmpty = n_eligible === 0;
  console.log(
    `real30 export  n_total=${n_total}  n_eligible=${n_eligible}  n_cold=${n_cold}${warnEmpty ? '  ⚠' : ''}`,
  );
  if (!neonUrl) {
    console.log('⚠ POSTGRES_URL absent — Neon unreachable, empty export (exit 0).');
  }
  console.log(`JSON : ${path.relative(process.cwd(), outPath)}`);
}

void main();
