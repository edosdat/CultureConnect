import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  assertSafeOut,
  auditTags,
  extractSnapshot,
  hasHumorCue,
  isDateOnlyTitle,
  loadAuditInputs,
  moodIdf,
  parseTagAuditArgs,
  parseTagList,
  renderReport,
  scoreGold,
  strictFailure,
  textContainsProof,
  titlesSharePrefix,
  type AuditEvent,
  type AuditInput,
  type AuditTagsV2,
} from './tagAudit';

function ev(partial: Partial<AuditEvent> & Pick<AuditEvent, 'event_id' | 'titre' | 'categorie'>): AuditEvent {
  return {
    lieu_id: partial.lieu_id ?? `L-${partial.event_id}`,
    date_debut: partial.date_debut ?? '2026-10-02',
    ...partial,
  };
}

function audit(events: AuditEvent[], v2?: AuditInput['v2'], gold?: AuditInput['gold']): ReturnType<typeof auditTags> {
  return auditTags({
    events,
    v2: v2 ?? { present: false, headers: [], rows: [] },
    gold: gold ?? null,
    generatedAt: '2026-09-28T00:00:00.000Z',
  });
}

const V2_HEADERS = [
  'event_id',
  'moods',
  'sortie',
  'energie',
  'exigence',
  'format_scene',
  'ideal_pour',
  'notoriete',
  'tag_confiance',
  'tag_preuve',
  'tag_version',
];

describe('tag list, IDF, text cues', () => {
  it('parses pipe and comma lists without duplicating', () => {
    assert.deepEqual(parseTagList(' Rigolo | Tendre | rigolo '), ['rigolo', 'tendre']);
    assert.deepEqual(parseTagList('absurde,critique'), ['absurde', 'critique']);
    assert.deepEqual(parseTagList(''), []);
  });

  it('matches inverseMoodWeights', () => {
    assert.equal(moodIdf(10, 8), 0);
    assert.equal(moodIdf(100, 80), 0);
    assert.ok(Math.abs((moodIdf(10, 5) ?? 0) - Math.log(2)) < 1e-12);
    const small = moodIdf(4, 3);
    assert.ok(small != null && small > 0);
    assert.equal(moodIdf(0, 1), null);
    assert.equal(moodIdf(10, 0), null);
  });

  it('folds accents before the humour regex', () => {
    assert.equal(hasHumorCue('Une comédie hilarante'), true);
    assert.equal(hasHumorCue('C’est drôle'), true);
    assert.equal(hasHumorCue('humour stand-up'), true);
    assert.equal(hasHumorCue('un récit grave sur 1986'), false);
  });

  it('detects a title that is only a date', () => {
    assert.equal(isDateOnlyTitle('Vendredi 02 octobre 2026 - 20H30'), true);
    assert.equal(isDateOnlyTitle('Samedi 19 septembre 2026 - 20H00'), true);
    assert.equal(isDateOnlyTitle('2026-10-02'), true);
    assert.equal(isDateOnlyTitle('Toc Toc'), false);
    assert.equal(isDateOnlyTitle('Vendredi 02 octobre 2026 — Toc Toc'), false);
  });

  it('treats a normalised title as a prefix only on a word boundary', () => {
    assert.equal(titlesSharePrefix('Primal Fear', 'Primal Fear (metal)'), true);
    assert.equal(titlesSharePrefix('HYPNO5E & HIPPOTRAKTOR', 'HYPNO5E & HIPPOTRAKTOR (metal|post-metal)'), true);
    assert.equal(titlesSharePrefix('Sesilha', 'Sesilhas'), false);
    assert.equal(titlesSharePrefix('CORNÉLIUS', 'CORNELIUS — réouverture'), true);
  });

  it('finds a preuve after accent and space folding', () => {
    assert.equal(textContainsProof('Seul en scène, il raconte', 'Seul  en scène, il raconte son histoire'), true);
    assert.equal(textContainsProof('comédie', 'Une comedie de boulevard'), true);
    assert.equal(textContainsProof('absent du texte', 'autre chose'), false);
    assert.equal(textContainsProof('   ', 'texte'), false);
  });
});

describe('auditTags — v1 baseline', () => {
  const events = [
    ev({
      event_id: 'E485',
      lieu_id: 'L1',
      titre: 'TOM',
      categorie: 'theatre_danse',
      date_debut: '2026-10-01',
      moods: 'rigolo',
      description_courte: 'Épidémie, 1986, un récit grave.',
      mood_confiance: 'basse',
      mood_source: 'genre',
    }),
    ev({
      event_id: 'C1',
      lieu_id: 'L2',
      titre: 'Primal Fear',
      categorie: 'musique',
      date_debut: '2026-10-06',
      moods: 'festif',
      description_longue: 'x'.repeat(90),
      mood_confiance: 'haute',
    }),
    ev({
      event_id: 'C2',
      lieu_id: 'L2',
      titre: 'Primal Fear (metal)',
      categorie: 'musique',
      date_debut: '2026-10-06',
      moods: 'festif|intense|brutal',
      description_courte: 'Metal symphonique.',
    }),
    ev({
      event_id: 'E141',
      lieu_id: 'L3',
      titre: 'Vendredi 02 octobre 2026 - 20H30',
      categorie: 'theatre_danse',
      date_debut: '2026-10-02',
      moods: 'sortie',
    }),
    ev({
      event_id: 'T3',
      lieu_id: 'L1',
      titre: 'Toc Toc',
      categorie: 'theatre_danse',
      date_debut: '2026-10-03',
      moods: 'rigolo|leger',
      description_courte: 'Une comédie hilarante de quiproquos.',
      mood_confiance: 'haute',
    }),
    ev({
      event_id: 'CIN',
      titre: 'Un film',
      categorie: 'cinema',
      moods: 'rigolo',
    }),
  ];

  it('audits v1 moods and says v2 is absent', () => {
    const report = audit(events);
    assert.equal(report.meta.v2File, 'absent');
    assert.equal(report.meta.baseline, 'v1');
    assert.equal(report.meta.key, 'event_id');
    assert.equal(report.slots.find((slot) => slot.id === 'theatre')?.rows, 3);
    assert.equal(report.slots.find((slot) => slot.id === 'concert')?.rows, 2);
    const md = renderReport(report);
    assert.match(md, /tags_evenements\.csv` est \*\*absent\*\*/);
    assert.match(md, /avant \(v1\)/);
    assert.match(md, /Colonne absente/);
    assert.equal(extractSnapshot(md)?.version, 1);
  });

  it('lists enum, rigolo alone, festif alone, date titles and prefix duplicates', () => {
    const report = audit(events);
    const kinds = (id: string) => report.errors.filter((error) => error.eventId === id).map((error) => error.kind);
    assert.ok(kinds('E485').includes('rigolo_seul'));
    assert.ok(kinds('E485').includes('rigolo_principal_sans_humour'));
    assert.ok(kinds('C1').includes('festif_seul_concert'));
    assert.equal(kinds('C2').includes('festif_seul_concert'), false);
    assert.ok(kinds('E141').includes('hors_enum'));
    assert.ok(kinds('E141').includes('titre_date'));
    assert.equal(kinds('T3').includes('rigolo_seul'), false);
    assert.equal(kinds('T3').includes('rigolo_principal_sans_humour'), false);
    const dup = report.errors.find((error) => error.kind === 'doublon');
    assert.equal(dup?.eventId, 'C1');
    assert.equal(dup?.otherEventId, 'C2');
    assert.equal(report.errors.some((error) => error.eventId === 'CIN'), false);
    assert.equal(report.errors.some((error) => error.kind === 'preuve_introuvable'), false);
    assert.equal(report.errors.some((error) => error.kind === 'v1_v2_incoherent'), false);
  });

  it('keeps categorie=concert and drops autre rows whose stored form is theatre', () => {
    const report = audit([
      ev({ event_id: 'E448', titre: 'Jam', categorie: 'concert', form: 'concert', moods: 'dansant|festif' }),
      ev({
        event_id: 'HUB',
        titre: 'Réparation vélo',
        categorie: 'autre',
        form: 'theatre',
        moods: 'rigolo',
      }),
    ]);
    assert.equal(report.slots.find((slot) => slot.id === 'concert')?.rows, 1);
    assert.equal(report.slots.find((slot) => slot.id === 'theatre')?.rows, 0);
    assert.equal(report.errors.some((error) => error.eventId === 'HUB'), false);
  });

  it('does not flag festif alone on a theatre row', () => {
    const report = audit([
      ev({ event_id: 'T9', titre: 'Bal', categorie: 'theatre_danse', moods: 'festif', lieu_id: 'LX', date_debut: '2026-12-01' }),
    ]);
    assert.equal(report.errors.some((error) => error.kind === 'festif_seul_concert'), false);
    assert.ok(report.errors.some((error) => error.kind === 'hors_enum') === false);
  });

  it('flags a comma separator as a v1 note, not a blocking error', () => {
    const report = audit([
      ev({
        event_id: 'TMP',
        titre: 'Quelque chose',
        categorie: 'theatre_danse',
        moods: 'absurde,critique',
        lieu_id: 'LZ',
        date_debut: '2026-12-02',
      }),
    ]);
    assert.equal(report.anomalies.length, 1);
    assert.equal(report.errors.some((error) => error.kind === 'hors_enum'), false);
    assert.equal(report.slots[0]?.meanMoods, 2);
  });
});

describe('auditTags — v2 rules', () => {
  const theatre = ev({
    event_id: 'E485',
    lieu_id: 'L1',
    titre: 'TOM',
    categorie: 'theatre_danse',
    moods: 'rigolo',
    description_longue: 'Récit sur l’épidémie de 1986. Rien de drôle ici, assez long pour le seuil de texte utile.'.padEnd(80, '.'),
    citation: 'une histoire grave',
  });

  function v2row(partial: Partial<AuditTagsV2>): AuditTagsV2 {
    return { event_id: 'E485', tag_version: 'v2', ...partial };
  }

  it('prefers v2 moods and flags a disjoint v1 tag, a missing preuve and a bad enum', () => {
    const report = audit([theatre], {
      present: true,
      headers: V2_HEADERS,
      rows: [
        v2row({
          moods: 'intense|tendre',
          sortie: 'interessante',
          energie: '9',
          exigence: '2',
          format_scene: 'troupe',
          ideal_pour: 'couple|solo',
          notoriete: 'confirme',
          tag_confiance: 'haute',
          tag_preuve: '',
        }),
      ],
    });
    const kinds = report.errors.map((error) => error.kind);
    assert.ok(kinds.includes('v1_v2_incoherent'));
    assert.ok(kinds.includes('preuve_introuvable'));
    assert.ok(kinds.includes('hors_enum'));
    assert.equal(kinds.includes('rigolo_seul'), false);
    assert.equal(report.meta.baseline, 'v2');
    assert.equal(report.slots[0]?.fromV2, 1);
  });

  it('accepts a refinement of v1 and a preuve found in the text', () => {
    const report = audit(
      [
        ev({
          event_id: 'K1',
          titre: 'Kevin Levy',
          categorie: 'theatre_danse',
          moods: 'rigolo',
          description_longue: 'Seul en scène, il raconte son histoire, mêlant sketch et stand-up.',
          lieu_id: 'L9',
          date_debut: '2026-11-01',
        }),
      ],
      {
        present: true,
        headers: V2_HEADERS,
        rows: [
          {
            event_id: 'K1',
            moods: 'rigolo|intimiste|tendre',
            sortie: 'agreable',
            energie: '3',
            tag_confiance: 'haute',
            tag_preuve: 'Seul en scène, il raconte son histoire',
            tag_version: 'v2',
          },
        ],
      },
    );
    assert.equal(report.errors.some((error) => error.kind === 'v1_v2_incoherent'), false);
    assert.equal(report.errors.some((error) => error.kind === 'preuve_introuvable'), false);
    assert.equal(report.errors.some((error) => error.kind === 'rigolo_seul'), false);
    assert.equal(report.errors.some((error) => error.kind === 'hors_bornes'), false);
  });

  it('rejects a v2 mood list outside 2–3 and a comma separator', () => {
    const report = audit([theatre], {
      present: true,
      headers: V2_HEADERS,
      rows: [v2row({ moods: 'rigolo', tag_confiance: 'basse', tag_preuve: 'grave' })],
    });
    assert.ok(report.errors.some((error) => error.kind === 'hors_bornes' && error.detail.includes('moods')));
    const comma = audit([theatre], {
      present: true,
      headers: V2_HEADERS,
      rows: [v2row({ moods: 'rigolo, leger', tag_confiance: 'moyenne' })],
    });
    assert.ok(comma.errors.some((error) => error.detail.includes('séparateur virgule')));
  });
});

describe('thresholds', () => {
  it('fails the 35 % ceiling above the line and passes at exactly 35 %', () => {
    const over = Array.from({ length: 20 }, (_, i) =>
      ev({
        event_id: `T${i}`,
        titre: `Piece ${i}`,
        categorie: 'theatre_danse',
        lieu_id: `L${i}`,
        date_debut: `2026-11-${String((i % 27) + 1).padStart(2, '0')}`,
        moods: i < 8 ? 'rigolo|leger' : 'tendre|poetique',
        description_courte: i < 8 ? 'Une comédie' : 'Un récit',
      }),
    );
    const overReport = audit(over);
    const ceiling = overReport.thresholds.find((row) => row.id === 'mood_share');
    assert.equal(ceiling?.status, 'fail');

    const exact = Array.from({ length: 20 }, (_, i) =>
      ev({
        event_id: `E${i}`,
        titre: `Autre ${i}`,
        categorie: 'theatre_danse',
        lieu_id: `M${i}`,
        date_debut: `2026-12-${String((i % 27) + 1).padStart(2, '0')}`,
        // 7/20 = 35 % exactly — the ceiling is strict greater-than.
        moods: i < 7 ? 'intense' : i < 14 ? 'sombre' : 'poetique',
      }),
    );
    const exactReport = audit(exact);
    assert.equal(exactReport.thresholds.find((row) => row.id === 'mood_share')?.status, 'ok');
  });

  it('grades long text, v2 multi-mood, sortie, energie and confiance', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      ev({
        event_id: `C${i}`,
        titre: `Concert ${i}`,
        categorie: 'musique',
        lieu_id: `LC${i}`,
        date_debut: `2026-11-${String(i + 1).padStart(2, '0')}`,
        description_longue: 'y'.repeat(90),
        moods: 'intense',
      }),
    );
    const rows: AuditTagsV2[] = events.map((event, i) => ({
      event_id: event.event_id,
      moods: i < 9 ? 'intense|epique' : 'intense',
      sortie: 'interessante',
      energie: String((i % 2) + 1),
      tag_confiance: i < 2 ? 'basse' : 'haute',
      tag_preuve: 'y'.repeat(10),
      tag_version: 'v2',
    }));
    const report = audit(events, { present: true, headers: V2_HEADERS, rows });
    const byId = Object.fromEntries(report.thresholds.map((row) => [row.id, row.status]));
    assert.equal(byId.long_text, 'ok');
    assert.equal(byId.multi_mood_v2, 'ok');
    assert.equal(byId.tag_confiance_basse, 'ok');
    assert.equal(byId.energie_spread, 'fail');
    assert.equal(byId.sortie_balance, 'fail');

    const spread: AuditTagsV2[] = events.map((event, i) => ({
      event_id: event.event_id,
      moods: 'intense|epique',
      sortie: [ 'interessante', 'interessante', 'agreable', 'agreable', 'agreable', 'partage', 'partage', 'partage', 'evasion', 'evasion' ][i],
      energie: ['1', '1', '1', '2', '2', '2', '3', '3', '3', '4'][i],
      tag_confiance: 'haute',
      tag_preuve: 'yyy',
      tag_version: 'v2',
    }));
    const balanced = audit(events, { present: true, headers: V2_HEADERS, rows: spread });
    assert.equal(balanced.thresholds.find((row) => row.id === 'sortie_balance')?.status, 'ok');
    assert.equal(balanced.thresholds.find((row) => row.id === 'energie_spread')?.status, 'ok');

    const tooLow = audit(events, {
      present: true,
      headers: V2_HEADERS,
      rows: events.map((event) => ({
        event_id: event.event_id,
        moods: 'intense|epique',
        tag_confiance: 'basse',
        tag_version: 'v2',
      })),
    });
    assert.equal(tooLow.thresholds.find((row) => row.id === 'tag_confiance_basse')?.status, 'fail');
    assert.equal(tooLow.thresholds.find((row) => row.id === 'multi_mood_v2')?.status, 'ok');
  });

  it('leaves v2 thresholds n/a when the file is absent, and --strict follows RATÉ only', () => {
    const report = audit([
      ev({
        event_id: 'T1',
        titre: 'Seul',
        categorie: 'theatre_danse',
        moods: 'rigolo',
        description_longue: 'z'.repeat(90),
        lieu_id: 'L1',
        date_debut: '2026-10-01',
      }),
    ]);
    const byId = Object.fromEntries(report.thresholds.map((row) => [row.id, row.status]));
    assert.equal(byId.multi_mood_v2, 'na');
    assert.equal(byId.sortie_balance, 'na');
    assert.equal(byId.energie_spread, 'na');
    assert.equal(byId.tag_confiance_basse, 'na');
    assert.equal(byId.gold_principal_mood, 'na');
    assert.equal(byId.long_text, 'ok');
    const gate = strictFailure(report);
    assert.equal(gate.failed, true);
    assert.ok(gate.ids.includes('mood_share'));
    assert.equal(gate.ids.includes('sortie_balance'), false);
  });
});

describe('gold score', () => {
  it('measures principal mood, Jaccard, sortie and energie ±1', () => {
    const score = scoreGold([
      {
        gold: { event_id: 'A', moods: ['rigolo', 'leger'], sortie: ['agreable'], energie: 3 },
        got: { event_id: 'A', moods: ['rigolo', 'tendre'], sortie: ['agreable'], energie: 4 },
      },
      {
        gold: { event_id: 'B', moods: ['intense', 'brutal'], sortie: ['evasion'], energie: 5 },
        got: { event_id: 'B', moods: ['poetique'], sortie: ['agreable'], energie: 1 },
      },
    ]);
    assert.equal(score.principalMood, 0.5);
    assert.equal(score.principalSortie, 0.5);
    assert.equal(score.energieWithin1, 0.5);
    assert.ok((score.meanJaccard ?? 0) > 0);
    assert.ok((score.meanJaccard ?? 1) < 0.5);
  });
});

describe('cli guards', () => {
  it('parses --out, --compare and --strict', () => {
    assert.deepEqual(parseTagAuditArgs(['--strict', '--out', 'bench-results/2026-09-28-tags.md', '--compare', 'a.md']), {
      out: 'bench-results/2026-09-28-tags.md',
      compare: 'a.md',
      strict: true,
    });
  });

  it('refuses to write inside data/', () => {
    assert.throws(() => assertSafeOut('data/evenements.csv'), /data\//);
    assert.throws(() => assertSafeOut(path.join('data', 'tags_evenements.csv')), /data\//);
    assert.doesNotThrow(() => assertSafeOut('bench-results/2026-09-28-tags.md'));
  });
});

describe('empty v2 file', () => {
  it('keeps the v1 avant baseline when tags_evenements.csv has headers only', () => {
    const report = audit(
      [
        ev({
          event_id: 'T1',
          titre: 'Toc Toc',
          categorie: 'theatre_danse',
          moods: 'rigolo|leger',
          description_courte: 'Une comédie.',
          lieu_id: 'L1',
          date_debut: '2026-10-03',
        }),
      ],
      { present: true, headers: V2_HEADERS, rows: [] },
    );
    assert.equal(report.meta.v2File, 'present');
    assert.equal(report.meta.v2Rows, 0);
    assert.equal(report.meta.baseline, 'v1');
    assert.equal(report.thresholds.find((row) => row.id === 'sortie_balance')?.status, 'na');
    const md = renderReport(report);
    assert.match(md, /avant \(v1\)/);
    assert.match(md, /en-têtes seuls/);
    assert.match(md, /evenements\.moods/);
  });
});

describe('catalogue smoke', () => {
  it('audits v1 moods; an empty tags file does not replace them', () => {
    const input = loadAuditInputs(process.cwd());
    if (input.v2.present) assert.equal(input.v2.rows.length, 0);
    const report = auditTags({ ...input, generatedAt: '2026-09-28T00:00:00.000Z' });
    assert.equal(report.meta.baseline, 'v1');
    assert.equal(report.meta.v2Rows, 0);
    assert.ok((report.slots.find((slot) => slot.id === 'theatre')?.rows ?? 0) > 100);
    assert.ok((report.slots.find((slot) => slot.id === 'concert')?.rows ?? 0) > 100);
    assert.ok(report.errors.some((error) => error.kind === 'rigolo_seul'));
    assert.ok(report.errors.some((error) => error.kind === 'festif_seul_concert'));
    assert.ok(report.errors.some((error) => error.kind === 'titre_date'));
    const md = renderReport(report);
    assert.match(md, /avant \(v1\)/);
    assert.match(md, /evenements\.moods/);
  });
});
