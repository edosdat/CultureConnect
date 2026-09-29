/**
 * Génère `scripts/fixtures/tag-gold-review.csv` pour relecture humaine.
 *
 *   npm run tags:gold-review
 */
import path from 'node:path';
import { generateGoldReviewCsv } from './tagGold';

function main(): void {
  const result = generateGoldReviewCsv();
  console.log(
    `CSV de revue : ${path.relative(process.cwd(), result.path)} (${result.rows} lignes)`,
  );
}

const isDirectRun =
  typeof process.argv[1] === 'string' && /tagGoldReview\.(ts|js)$/.test(process.argv[1]);
if (isDirectRun) main();
