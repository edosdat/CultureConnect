/**
 * Importe le CSV de revue humaine vers `scripts/fixtures/tag-gold.json`
 * avec `tagged_by: "manuel"`.
 *
 *   npm run tags:gold-import
 *   npm run tags:gold-import -- --csv path/to/corrected.csv
 */
import path from 'node:path';
import { GOLD_REVIEW_CSV, importGoldReviewCsv } from './tagGold';

function parseArgs(argv: readonly string[]): { csv: string | null } {
  let csv: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if ((flag === '--csv' || flag === '--in') && argv[i + 1]) {
      csv = argv[i + 1];
      i += 1;
    }
  }
  return { csv };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = args.csv
    ? path.isAbsolute(args.csv)
      ? args.csv
      : path.join(process.cwd(), args.csv)
    : undefined;
  const result = importGoldReviewCsv({ csvPath });
  if (!result.ok) {
    console.error('Import gold refusé — corrigez le CSV :');
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Gold importé : ${result.rows} lignes → ${path.relative(process.cwd(), result.path)} (tagged_by=manuel)`,
  );
}

const isDirectRun =
  typeof process.argv[1] === 'string' && /tagGoldImport\.(ts|js)$/.test(process.argv[1]);
if (isDirectRun) main();
