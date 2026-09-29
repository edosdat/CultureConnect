import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FEW_SHOT_REFS,
  GOLD_FILE,
  GOLD_REVIEW_CSV,
  assertGoldIsManuel,
  generateGoldReviewCsv,
  goldFewShotLeaks,
  importGoldReviewCsv,
  loadGoldFixture,
  normalizeGoldTitle,
  parseGoldFixture,
  refuseEvalGoldIfNotManuel,
  renderReviewCsv,
  validateGoldTagFields,
  type GoldFixtureRow,
} from './tagGold';
import { auditTags, type AuditEvent } from './tagAudit';
import { runEvalGoldManuelGate } from './tagGoldEvalGate';

function sampleGold(partial: Partial<GoldFixtureRow> & { event_id: string }): GoldFixtureRow {
  return {
    titre: partial.titre ?? 'Spectacle test',
    categorie: partial.categorie ?? 'theatre_danse',
    moods: partial.moods ?? ['rigolo', 'absurde'],
    sortie: partial.sortie ?? ['agreable'],
    energie: partial.energie ?? 3,
    exigence: partial.exigence ?? 1,
    format_scene: partial.format_scene ?? ['seul_en_scene'],
    ideal_pour: partial.ideal_pour ?? ['amis'],
    notoriete: partial.notoriete ?? 'emergent',
    tag_confiance: partial.tag_confiance ?? 'moyenne',
    tag_preuve: partial.tag_preuve ?? 'preuve',
    tag_version: partial.tag_version ?? 'v2',
    tagged_by: partial.tagged_by ?? 'agent',
    skip: partial.skip ?? false,
    ...partial,
  };
}

describe('assertGoldIsManuel / eval-gold gate', () => {
  it('refuses agent gold with a clear message and no score numbers', () => {
    const gate = assertGoldIsManuel([sampleGold({ event_id: 'E1', tagged_by: 'agent' })]);
    assert.equal(gate.ok, false);
    if (gate.ok) return;
    assert.match(gate.message, /non manuel/i);
    assert.match(gate.message, /tags:gold-import/);
    assert.equal(/\d+\s*%/.test(gate.message), false);
    assert.equal(/\d+[.,]\d+/.test(gate.message), false);
    assert.equal(/jaccard/i.test(gate.message), false);
  });

  it('accepts only when every row is manuel', () => {
    assert.equal(assertGoldIsManuel([sampleGold({ event_id: 'E1', tagged_by: 'manuel' })]).ok, true);
    assert.equal(
      assertGoldIsManuel([
        sampleGold({ event_id: 'E1', tagged_by: 'manuel' }),
        sampleGold({ event_id: 'E2', tagged_by: 'agent' }),
      ]).ok,
      false,
    );
  });

  it('refuseEvalGoldIfNotManuel mirrors the gate (C1 --eval-gold)', () => {
    const msg = refuseEvalGoldIfNotManuel([sampleGold({ event_id: 'E1', tagged_by: 'llm' })]);
    assert.ok(msg);
    assert.match(msg!, /non manuel/i);
    assert.equal(refuseEvalGoldIfNotManuel([sampleGold({ event_id: 'E1', tagged_by: 'manuel' })]), null);
  });
});

describe('tagAudit refuses gold scores when not manuel', () => {
  it('does not compute gold metrics and prints the refuse message', () => {
    const events: AuditEvent[] = [
      {
        event_id: 'E1',
        titre: 'Test',
        categorie: 'theatre_danse',
        form: 'theatre',
        description_courte: 'x'.repeat(100),
        description_longue: '',
        moods: 'rigolo|leger',
        lieu_id: 'L1',
        date_debut: '2026-10-01',
      },
    ];
    const report = auditTags({
      events,
      v2: { present: false, headers: [], rows: [] },
      gold: [{ event_id: 'E1', moods: ['rigolo', 'leger'], sortie: ['agreable'], energie: 3 }],
      goldRefuseMessage: assertGoldIsManuel([sampleGold({ event_id: 'E1', tagged_by: 'agent' })]).ok
        ? null
        : (assertGoldIsManuel([sampleGold({ event_id: 'E1', tagged_by: 'agent' })]) as { ok: false; message: string })
            .message,
      generatedAt: '2026-09-29T00:00:00.000Z',
    });
    assert.equal(report.gold.refusedNonManuel, true);
    assert.equal(report.gold.compared, 0);
    assert.equal(report.gold.principalMood, null);
    assert.equal(report.gold.meanJaccard, null);
    assert.ok(report.gold.refuseMessage);
    assert.match(report.gold.refuseMessage!, /non manuel/i);
    const goldThreshold = report.thresholds.find((row) => row.id === 'gold_principal_mood');
    assert.ok(goldThreshold);
    assert.equal(goldThreshold!.status, 'na');
    assert.match(goldThreshold!.measure, /refusé/i);
    assert.equal(/\d+\s*%/.test(goldThreshold!.measure), false);
  });
});

describe('validateGoldTagFields', () => {
  it('accepts a valid row and rejects hors_enum / rigolo seul / festif seul concert', () => {
    const ok = validateGoldTagFields(
      {
        moods: 'rigolo|absurde',
        sortie: 'agreable',
        energie: '3',
        exigence: '1',
        format_scene: 'seul_en_scene',
        ideal_pour: 'amis|couple',
        notoriete: 'emergent',
      },
      { concert: false },
    );
    assert.equal(ok.ok, true);

    const badMood = validateGoldTagFields(
      {
        moods: 'rigolo|comique',
        sortie: 'agreable',
        energie: 3,
        exigence: 1,
        format_scene: 'seul_en_scene',
        ideal_pour: 'amis',
        notoriete: 'emergent',
      },
      { concert: false },
    );
    assert.equal(badMood.ok, false);

    const rigoloSeul = validateGoldTagFields(
      {
        moods: ['rigolo', 'epique'],
        sortie: ['agreable'],
        energie: 3,
        exigence: 1,
        format_scene: ['seul_en_scene'],
        ideal_pour: ['amis'],
        notoriete: 'emergent',
      },
      { concert: false },
    );
    assert.equal(rigoloSeul.ok, false);
    if (!rigoloSeul.ok) assert.ok(rigoloSeul.issues.some((issue) => issue.code === 'rigolo'));

    const festifSeul = validateGoldTagFields(
      {
        moods: ['festif', 'tendre'],
        sortie: ['partage'],
        energie: 4,
        exigence: 1,
        format_scene: ['groupe'],
        ideal_pour: ['amis'],
        notoriete: 'emergent',
      },
      { concert: true },
    );
    assert.equal(festifSeul.ok, false);
    if (!festifSeul.ok) assert.ok(festifSeul.issues.some((issue) => issue.code === 'festif'));
  });
});

describe('gold import round-trip', () => {
  it('rewrites tag-gold.json with tagged_by manuel after a valid CSV', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-gold-'));
    const fixtureDir = path.join(dir, 'scripts', 'fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });
    const existing: GoldFixtureRow[] = [
      sampleGold({ event_id: 'E100', tagged_by: 'agent', tag_preuve: 'citation exacte', tag_confiance: 'haute' }),
    ];
    fs.writeFileSync(path.join(dir, GOLD_FILE), JSON.stringify(existing, null, 2), 'utf-8');
    const csv = renderReviewCsv([
      {
        event_id: 'E100',
        titre: 'Spectacle test',
        categorie: 'theatre_danse',
        lieu: 'Lieu',
        texte: 'Une description utile.',
        moods: 'rigolo|absurde|tendre',
        sortie: 'agreable|evasion',
        energie: '2',
        exigence: '2',
        format_scene: 'seul_en_scene|lecture',
        ideal_pour: 'solo|amis',
        notoriete: 'confirme',
      },
    ]);
    const csvPath = path.join(dir, GOLD_REVIEW_CSV);
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(csvPath, csv, 'utf-8');

    const result = importGoldReviewCsv({ cwd: dir });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const loaded = loadGoldFixture(dir);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].tagged_by, 'manuel');
    assert.deepEqual(loaded[0].moods, ['rigolo', 'absurde', 'tendre']);
    assert.equal(loaded[0].tag_preuve, 'citation exacte');
    assert.equal(loaded[0].tag_confiance, 'haute');
    assert.equal(assertGoldIsManuel(loaded).ok, true);
  });

  it('rejects invalid enums without writing manuel gold', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-gold-bad-'));
    fs.mkdirSync(path.join(dir, 'scripts', 'fixtures'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, GOLD_FILE),
      JSON.stringify([sampleGold({ event_id: 'E100', tagged_by: 'agent' })], null, 2),
      'utf-8',
    );
    const csvPath = path.join(dir, GOLD_REVIEW_CSV);
    fs.writeFileSync(
      csvPath,
      renderReviewCsv([
        {
          event_id: 'E100',
          titre: 'Spectacle test',
          categorie: 'theatre_danse',
          lieu: '',
          texte: '',
          moods: 'rigolo',
          sortie: 'agreable',
          energie: '3',
          exigence: '1',
          format_scene: 'seul_en_scene',
          ideal_pour: 'amis',
          notoriete: 'emergent',
        },
      ]),
      'utf-8',
    );
    const result = importGoldReviewCsv({ cwd: dir });
    assert.equal(result.ok, false);
    const loaded = loadGoldFixture(dir);
    assert.equal(loaded[0].tagged_by, 'agent');
  });
});

describe('C2 few-shot leak guard', () => {
  it('fails if any FEW_SHOT event_id or normalized title is also in gold', () => {
    const gold = loadGoldFixture();
    assert.ok(gold.length >= 1, 'tag-gold.json must be present for C2');
    const leaks = goldFewShotLeaks(gold, FEW_SHOT_REFS);
    assert.deepEqual(
      leaks,
      [],
      `fuite few-shot dans le gold : ${leaks.map((leak) => `${leak.event_id} (${leak.via}: ${leak.fewShotTitle})`).join(', ')}`,
    );
  });

  it('normalizeGoldTitle matches accent-insensitive titles', () => {
    assert.equal(normalizeGoldTitle('Lio Kuokman / Nelson Goerner'), normalizeGoldTitle('lio kuokman nelson goerner'));
  });
});

describe('fixture parse + live eval gate', () => {
  it('parseGoldFixture keeps tagged_by', () => {
    const rows = parseGoldFixture([
      { event_id: 'E1', moods: ['a'], tagged_by: 'agent', energie: 1, exigence: 1 },
    ]);
    assert.equal(rows[0].tagged_by, 'agent');
  });

  it('runEvalGoldManuelGate refuses the current agent fixture', () => {
    const gate = runEvalGoldManuelGate();
    assert.equal(gate.refused, true);
    assert.ok(gate.message);
    assert.match(gate.message!, /non manuel/i);
    assert.equal(/\d+\s*%/.test(gate.message!), false);
  });
});

describe('generateGoldReviewCsv', () => {
  it('writes one row per gold spectacle with the expected columns', () => {
    // Uses the repo fixture + catalogue; only checks shape if gold exists.
    const gold = loadGoldFixture();
    if (!gold.length) return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-gold-review-'));
    // Minimal catalogue for one id
    const dataDir = path.join(dir, 'data');
    const fixDir = path.join(dir, 'scripts', 'fixtures');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(fixDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixDir, 'tag-gold.json'),
      JSON.stringify([sampleGold({ event_id: 'E1', tagged_by: 'agent' })], null, 2),
    );
    fs.writeFileSync(
      path.join(dataDir, 'evenements.csv'),
      'event_id,lieu_id,titre,categorie,description_courte,description_longue\nE1,L1,Titre,theatre_danse,court,description longue utile\n',
    );
    fs.writeFileSync(path.join(dataDir, 'lieux.csv'), 'lieu_id,nom\nL1,Mon Lieu\n');
    const result = generateGoldReviewCsv(dir);
    assert.equal(result.rows, 1);
    const csv = fs.readFileSync(result.path, 'utf-8');
    assert.match(csv, /^event_id,titre,categorie,lieu,texte,moods,sortie,energie,exigence,format_scene,ideal_pour,notoriete\n/);
    assert.match(csv, /E1,Titre,theatre_danse,Mon Lieu,description longue utile,/);
  });
});
