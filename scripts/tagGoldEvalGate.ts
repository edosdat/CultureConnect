/**
 * Garde-fou C1 pour `--eval-gold` : refuse tout calcul si le gold n'est
 * pas entièrement `tagged_by: "manuel"`. Message clair, aucun chiffre.
 *
 * Utilisé par les tests et comme point d'entrée tant que le tagueur (#173)
 * n'importe pas encore `assertGoldIsManuel` / `refuseEvalGoldIfNotManuel`.
 *
 *   npx tsx scripts/tagGoldEvalGate.ts
 */
import { loadGoldFixture, refuseEvalGoldIfNotManuel } from './tagGold';

export function runEvalGoldManuelGate(cwd = process.cwd()): {
  refused: boolean;
  message: string | null;
} {
  const fixture = loadGoldFixture(cwd);
  const message = refuseEvalGoldIfNotManuel(fixture);
  return { refused: message != null, message };
}

function main(): void {
  const gate = runEvalGoldManuelGate();
  if (gate.refused) {
    console.error(gate.message);
    process.exitCode = 1;
    return;
  }
  console.log(
    'Gold set entièrement manuel. Les scores `--eval-gold` peuvent être calculés (tagueur #173).',
  );
}

const isDirectRun =
  typeof process.argv[1] === 'string' && /tagGoldEvalGate\.(ts|js)$/.test(process.argv[1]);
if (isDirectRun) main();
