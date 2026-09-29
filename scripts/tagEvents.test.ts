import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVENT_TAGS_V2_COLUMNS } from '../src/lib/eventTags';
import {
  A5_REFERENCE_TITLES,
  GOLD_SEED,
  SYSTEM_PROMPT,
  assertTagsCsvPath,
  blocksFullCatalogue,
  buildGoldReport,
  defaultGoldOutPath,
  evaluateGold,
  fewShots,
  isShortText,
  llmEnv,
  loadGoldFixture,
  loadTagCatalogue,
  mergeTagRows,
  messagesFor,
  parseGoldFixture,
  parseModelContent,
  parseTagEventsArgs,
  renderGoldReport,
  renderTagsCsv,
  selectTagInputs,
  sourceTextOfInput,
  tagEvent,
  tagInputFromRow,
  tagsRowFromProposal,
  userMessage,
  validateTagOutput,
  writesLiveTags,
  type GoldFixtureRow,
  type TagInput,
  type TagProposal,
} from './tagEvents';

const VERBATIM_SYSTEM_PROMPT = [
  "Tu tagues un spectacle vivant à Toulouse pour un moteur de recommandation. Tu décris **l'expérience vécue par le spectateur**, pas la catégorie du spectacle.",
  "Réponds **uniquement** en JSON valide, au format ci-dessous, avec les valeurs **exactes** autorisées. N'invente aucune valeur.",
  '- `moods` : 2 ou 3 parmi [rigolo, tendre, intense, angoissant, epique, brutal, festif, cerveau, intimiste, absurde, critique, sombre, poetique, dansant, contemplatif, leger], la principale en premier. Si tu mets rigolo, ajoute quel rire (absurde, critique, tendre, leger, cerveau, sombre ou intimiste). Pour un concert, festif n\'est jamais seul (ajoute dansant, intense, brutal, epique, poetique, intimiste ou contemplatif). rigolo en premier seulement si le rire est le but du spectacle.',
  '- `sortie` : 1 ou 2 parmi [interessante, agreable, partage, evasion], la principale en premier.',
  '- `energie` : entier de 1 (assis, silence) à 5 (debout, on danse).',
  '- `exigence` : 1 (grand public), 2 (un peu de curiosité), 3 (pour initiés).',
  '- `format_scene` : 1 ou 2 parmi [seul_en_scene, duo, troupe, orchestre, groupe, dj, scene_ouverte, participatif, sans_paroles, lecture, jeune_public].',
  '- `ideal_pour` : 1 à 3 parmi [solo, couple, amis, famille].',
  '- `notoriete` : un parmi [tete_affiche, confirme, emergent, scene_ouverte].',
  '- `confiance` : haute (l\'ambiance principale est **dite** dans le texte), moyenne (déduite avec un indice clair), basse (devinée).',
  '- `preuve` : une citation **exacte** et courte (moins de 120 caractères) du texte, qui justifie l\'ambiance principale.',
  'Si le texte fait moins de 80 caractères utiles, réponds `{"skip": true}`.',
].join('\n');

function proposal(partial: Partial<TagProposal> = {}): TagProposal {
  return {
    moods: ['rigolo', 'intimiste', 'tendre'],
    sortie: ['agreable'],
    energie: 3,
    exigence: 1,
    format_scene: ['seul_en_scene'],
    ideal_pour: ['amis', 'couple'],
    notoriete: 'confirme',
    confiance: 'haute',
    preuve: 'pleurer de rire',
    ...partial,
  };
}

const SOURCE = 'Seul en scène. Kevin Levy a tout pour vous faire pleurer de rire.';

function codes(raw: unknown, concert = false, source = SOURCE): string[] {
  const result = validateTagOutput(raw, { sourceText: source, concert });
  if (result.ok) return [];
  return result.issues.map((issue) => issue.code);
}

describe('system prompt and few-shot', () => {
  it('keeps the §A4 system prompt verbatim', () => {
    assert.equal(SYSTEM_PROMPT, VERBATIM_SYSTEM_PROMPT);
    const sample = fewShots()[0].input;
    const messages = messagesFor(sample);
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[0].content, SYSTEM_PROMPT);
  });

  it('sends 4 varied §A5 examples and no fifth', () => {
    const shots = fewShots();
    assert.equal(shots.length, 4);
    const titles = shots.map((shot) => shot.title);
    assert.equal(new Set(titles).size, 4);
    for (const title of titles) assert.ok(A5_REFERENCE_TITLES.includes(title as (typeof A5_REFERENCE_TITLES)[number]));
    const cats = new Set(shots.map((shot) => shot.input.categorie));
    assert.ok(cats.has('theatre_danse'));
    assert.ok(cats.has('musique'));
    for (const shot of shots) {
      const result = validateTagOutput(shot.assistant, {
        sourceText: sourceTextOfInput(shot.input),
        concert: shot.input.categorie === 'musique',
      });
      assert.equal(result.ok, true, shot.title);
    }
  });
});

describe('validateTagOutput', () => {
  it('accepts a proposal and a short-text skip', () => {
    const result = validateTagOutput(proposal(), { sourceText: SOURCE, concert: false });
    assert.equal(result.ok, true);
    if (result.ok && !('skip' in result.value)) assert.equal(result.value.moods[0], 'rigolo');
    const skip = validateTagOutput('{"skip": true}', { sourceText: '', concert: false });
    assert.equal(skip.ok, true);
    if (skip.ok) assert.deepEqual(skip.value, { skip: true });
  });

  it('rejects invalid JSON, unknown enums and bad cardinality', () => {
    assert.deepEqual(codes('not json'), ['json']);
    assert.deepEqual(codes('{"skip": true}').length, 0);
    assert.ok(codes(proposal({ moods: ['rigolo', 'inexistant', 'tendre'] })).includes('hors_enum'));
    assert.ok(codes(proposal({ moods: ['rigolo'] })).includes('hors_bornes'));
    assert.ok(
      codes(proposal({ moods: ['rigolo', 'tendre', 'leger', 'absurde'] })).includes('hors_bornes'),
    );
    assert.ok(codes(proposal({ energie: 6 })).includes('hors_enum'));
    assert.ok(codes(proposal({ energie: 1.5 })).includes('hors_enum'));
    assert.ok(codes(proposal({ notoriete: 'star' })).includes('hors_enum'));
    assert.ok(codes(proposal({ sortie: ['interessante', 'agreable', 'evasion'] })).includes('hors_bornes'));
    assert.ok(codes({ ...proposal(), moods: 'rigolo|tendre' }).includes('hors_bornes'));
  });

  it('requires a laugh type with rigolo, and a companion with festif on a concert', () => {
    assert.ok(codes(proposal({ moods: ['rigolo', 'festif'] })).includes('rigolo'));
    assert.deepEqual(codes(proposal({ moods: ['rigolo', 'absurde'] })), []);
    assert.ok(
      codes(proposal({ moods: ['festif', 'leger'] }), true).includes('festif'),
    );
    assert.deepEqual(codes(proposal({ moods: ['festif', 'dansant'] }), true), []);
    assert.deepEqual(codes(proposal({ moods: ['festif', 'leger', 'tendre'] }), false), []);
  });

  it('checks the preuve as a normalised substring, and haute without one', () => {
    assert.ok(codes(proposal({ preuve: 'absent du texte' })).includes('preuve'));
    assert.deepEqual(
      codes(proposal({ preuve: 'Pleurer   de rire' }), false, 'il va vous faire PLEURER de rire'),
      [],
    );
    assert.ok(codes(proposal({ preuve: '', confiance: 'haute' })).includes('haute_sans_preuve'));
    assert.ok(codes(proposal({ preuve: 'absent', confiance: 'haute' })).includes('haute_sans_preuve'));
    const moyenne = codes(proposal({ preuve: '', confiance: 'moyenne' }));
    assert.ok(moyenne.includes('preuve'));
    assert.equal(moyenne.includes('haute_sans_preuve'), false);
    assert.ok(codes(proposal({ preuve: 'x'.repeat(120) })).includes('hors_bornes'));
  });

  it('strips a json fence before parsing', () => {
    const parsed = parseModelContent('```json\n{"skip": true}\n```');
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      const result = validateTagOutput(parsed.value, { sourceText: '', concert: false });
      assert.equal(result.ok, true);
    }
  });
});

describe('tagEvent retries once', () => {
  const input: TagInput = {
    event_id: 'E1',
    titre: 'Seul',
    categorie: 'theatre_danse',
    genre: 'humour_standup',
    description: SOURCE.padEnd(90, '.'),
    citation: '',
    casting: '',
    lieu_nom: 'Salle',
    lieu_type: 'theatre',
    prix: '10€',
  };

  it('does not call the model when the useful text is short', async () => {
    let calls = 0;
    const outcome = await tagEvent(
      { ...input, description: 'trop court' },
      async () => {
        calls += 1;
        return '{"skip": true}';
      },
    );
    assert.equal(calls, 0);
    assert.equal(outcome.status, 'skip');
    assert.equal(isShortText('trop court'), true);
    assert.equal(isShortText('x'.repeat(80)), false);
  });

  it('keeps the second answer when the first is rejected', async () => {
    const bodies = ['{"moods":["rigolo"]}', JSON.stringify(proposal())];
    let calls = 0;
    const outcome = await tagEvent(input, async (messages) => {
      calls += 1;
      if (calls === 2) {
        assert.equal(messages.at(-1)?.role, 'user');
        assert.match(messages.at(-1)?.content ?? '', /Rejeté/);
        assert.equal(messages[0].content, SYSTEM_PROMPT);
      }
      return bodies[calls - 1] ?? '';
    });
    assert.equal(calls, 2);
    assert.equal(outcome.status, 'tagged');
    if (outcome.status === 'tagged') assert.equal(outcome.proposal.moods[0], 'rigolo');
  });

  it('logs a skip-shaped invalid result after the retry and does not invent tags', async () => {
    let calls = 0;
    const outcome = await tagEvent(input, async () => {
      calls += 1;
      return '{"moods":["sortie","rigolo"]}';
    });
    assert.equal(calls, 2);
    assert.equal(outcome.status, 'invalid');
  });
});

describe('csv and cli guards', () => {
  it('parses the flags and refuses a full catalogue pass', () => {
    assert.deepEqual(parseTagEventsArgs(['--eval-gold', '--limit', '5', '--dry-run']), {
      limit: 5,
      onlyMissing: false,
      eventIds: [],
      dryRun: true,
      evalGold: true,
      out: null,
    });
    assert.equal(parseTagEventsArgs(['--gold']).evalGold, true);
    assert.deepEqual(parseTagEventsArgs(['--event', 'E485', '--only-missing']).eventIds, ['E485']);
    assert.equal(parseTagEventsArgs(['--event', 'E485', '--only-missing']).onlyMissing, true);
    assert.throws(() => parseTagEventsArgs(['--limit', '0']), /--limit/);
    assert.equal(writesLiveTags({ dryRun: false, evalGold: false }), true);
    assert.equal(writesLiveTags({ dryRun: true, evalGold: false }), false);
    assert.equal(writesLiveTags({ dryRun: false, evalGold: true }), false);
    assert.equal(blocksFullCatalogue({ evalGold: false, limit: null, eventIds: [] }), true);
    assert.equal(blocksFullCatalogue({ evalGold: true, limit: null, eventIds: [] }), false);
    assert.equal(blocksFullCatalogue({ evalGold: false, limit: 12, eventIds: [] }), false);
    assert.equal(blocksFullCatalogue({ evalGold: false, limit: null, eventIds: ['E1'] }), false);
  });

  it('writes only the v2 tags columns, tagged_by=llm, and refuses the catalogue files', () => {
    const row = tagsRowFromProposal('E1', proposal(), '2026-09-29T00:00:00.000Z');
    assert.deepEqual(Object.keys(row), [...EVENT_TAGS_V2_COLUMNS]);
    assert.equal(row.tagged_by, 'llm');
    assert.equal(row.tag_version, 'v2');
    assert.equal(row.moods, 'rigolo|intimiste|tendre');
    const csv = renderTagsCsv([row]);
    assert.match(csv, /^event_id,moods,/);
    assert.match(csv, /llm/);
    assert.doesNotMatch(csv, /evenements/);
    const merged = mergeTagRows(
      [{ event_id: 'E0', moods: 'intense|tendre', tagged_by: 'manuel' }],
      [row],
    );
    assert.deepEqual(merged.map((item) => item.event_id), ['E0', 'E1']);
    assert.equal(merged[0].moods, 'intense|tendre');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tags-v2-'));
    assert.equal(path.basename(assertTagsCsvPath('data/tags_evenements.csv', cwd)), 'tags_evenements.csv');
    assert.throws(() => assertTagsCsvPath('data/evenements.csv', cwd), /tags_evenements/);
    assert.throws(() => assertTagsCsvPath('data/programme.csv', cwd), /tags_evenements/);
    assert.throws(() => assertTagsCsvPath('bench-results/tags.csv', cwd), /tags_evenements/);
  });

  it('selects living arts, missing rows and a limit', () => {
    const inputs = [
      tagInputFromRow({
        event_id: 'C1',
        titre: 'Film',
        categorie: 'cinema',
        genre: '',
        prix: '',
        gratuit: '',
        description_courte: '',
        description_longue: 'x'.repeat(90),
        citation: '',
        casting: '',
      }),
      tagInputFromRow({
        event_id: 'T1',
        titre: 'Pièce',
        categorie: 'theatre_danse',
        genre: 'theatre',
        prix: '',
        gratuit: 'oui',
        description_courte: 'courte',
        description_longue: '',
        citation: '',
        casting: '',
      }),
      tagInputFromRow({
        event_id: 'M1',
        titre: 'Concert',
        categorie: 'musique',
        genre: 'jazz',
        prix: '12€',
        gratuit: 'non',
        description_courte: '',
        description_longue: 'y'.repeat(90),
        citation: '',
        casting: '',
      }),
    ];
    assert.equal(inputs[1].prix, 'gratuit');
    assert.equal(inputs[1].description, 'courte');
    const selected = selectTagInputs(inputs, new Set(['T1']), {
      limit: 1,
      onlyMissing: true,
      eventIds: [],
    });
    assert.deepEqual(selected.map((input) => input.event_id), ['M1']);
    const one = selectTagInputs(inputs, new Set(), { limit: null, onlyMissing: false, eventIds: ['T1'] });
    assert.deepEqual(one.map((input) => input.event_id), ['T1']);
  });

  it('resolves LLM keys like phraseAi', () => {
    assert.equal(llmEnv({}), null);
    const openai = llmEnv({ OPENAI_API_KEY: ' sk ', XAI_API_KEY: 'x', OPENAI_MODEL: 'gpt-test' });
    assert.equal(openai?.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(openai?.key, 'sk');
    assert.equal(openai?.model, 'gpt-test');
    const xai = llmEnv({ OPENAI_API_KEY: '  ', XAI_API_KEY: 'xai-key' });
    assert.equal(xai?.url, 'https://api.x.ai/v1/chat/completions');
    assert.equal(xai?.model, 'grok-2-latest');
    assert.equal(xai?.key, 'xai-key');
  });
});

describe('gold eval', () => {
  const fixture: GoldFixtureRow[] = [
    {
      event_id: 'A',
      titre: 'A',
      categorie: 'theatre_danse',
      moods: ['rigolo', 'leger'],
      sortie: ['agreable'],
      energie: 3,
      exigence: 1,
      format_scene: ['troupe'],
      ideal_pour: ['amis'],
      notoriete: 'confirme',
      tag_confiance: 'haute',
      tag_preuve: 'rire',
      tag_version: 'v2',
      tagged_by: 'agent',
      skip: false,
    },
    {
      event_id: 'B',
      titre: 'B',
      categorie: 'musique',
      moods: ['intense', 'brutal'],
      sortie: ['evasion'],
      energie: 5,
      exigence: 3,
      format_scene: ['groupe'],
      ideal_pour: ['amis'],
      notoriete: 'emergent',
      tag_confiance: 'moyenne',
      tag_preuve: 'metal',
      tag_version: 'v2',
      tagged_by: 'agent',
      skip: false,
    },
  ];

  it('reports SKIP and no invented rates when there is no model', async () => {
    const report = await evaluateGold({
      fixture,
      inputsById: new Map(),
      complete: null,
      generatedAt: '2026-09-29T00:00:00.000Z',
    });
    assert.equal(report.verdict, 'SKIP');
    assert.equal(report.wroteTagsCsv, false);
    assert.equal(report.metrics.principalMood, null);
    assert.equal(report.metrics.meanJaccard, null);
    assert.equal(report.seed, GOLD_SEED);
    const md = renderGoldReport(report);
    assert.match(md, /Verdict : \*\*SKIP\*\*/);
    assert.match(md, /tags_evenements\.csv/);
    assert.equal(md.includes('70,0 %'), false);
    assert.equal(md.includes('0,000'), false);
    for (const row of report.thresholds) assert.equal(row.measure, 'SKIP');
  });

  it('marks PASS and FAIL from the §A6 thresholds', () => {
    const pass = buildGoldReport({
      generatedAt: '2026-09-29T00:00:00.000Z',
      fixture,
      skipped: false,
      compared: 2,
      missing: 0,
      short: 0,
      invalid: 0,
      modelSkips: 0,
      metrics: { principalMood: 0.7, meanJaccard: 0.5, principalSortie: 0.7, energieWithin1: 0.85 },
    });
    assert.equal(pass.verdict, 'PASS');
    const fail = buildGoldReport({
      generatedAt: '2026-09-29T00:00:00.000Z',
      fixture,
      skipped: false,
      compared: 2,
      missing: 0,
      short: 0,
      invalid: 0,
      modelSkips: 0,
      metrics: { principalMood: 0.69, meanJaccard: 0.5, principalSortie: 1, energieWithin1: 1 },
    });
    assert.equal(fail.verdict, 'FAIL');
    assert.match(renderGoldReport(fail), /69,0 %/);
  });

  it('scores a fake model without writing a csv path', async () => {
    const inputs = new Map<string, TagInput>([
      [
        'A',
        tagInputFromRow({
          event_id: 'A',
          titre: 'A',
          categorie: 'theatre_danse',
          genre: '',
          prix: '',
          gratuit: '',
          description_courte: '',
          description_longue: `${'rire '.repeat(40)}une comédie`,
          citation: '',
          casting: '',
        }),
      ],
    ]);
    const report = await evaluateGold({
      fixture,
      inputsById: inputs,
      complete: async () =>
        JSON.stringify(
          proposal({
            moods: ['rigolo', 'leger'],
            sortie: ['agreable'],
            energie: 3,
            preuve: 'rire',
          }),
        ),
      generatedAt: '2026-09-29T00:00:00.000Z',
    });
    assert.equal(report.missing, 1);
    assert.equal(report.compared, 1);
    assert.equal(report.wroteTagsCsv, false);
    assert.equal(report.metrics.principalMood, 1);
    assert.equal(report.verdict, 'PASS');
  });

  it('names the gold report bench-results/<date>-tags-gold.md', () => {
    const out = defaultGoldOutPath(new Date('2026-09-29T22:00:00.000Z'));
    assert.equal(path.basename(out), '2026-09-29-tags-gold.md');
  });
});

describe('gold fixture', () => {
  it('holds 60 rows, seed draw 30/30, and each row passes the validator on the catalogue text', () => {
    const rows = loadGoldFixture();
    assert.equal(rows.length, 60);
    assert.equal(parseGoldFixture(rows).length, 60);
    const theatre = rows.filter((row) => row.categorie === 'theatre_danse');
    const concert = rows.filter((row) => row.categorie === 'musique');
    assert.equal(theatre.length, 30);
    assert.equal(concert.length, 30);
    const ids = new Set(rows.map((row) => row.event_id));
    assert.equal(ids.size, 60);
    const { inputs } = loadTagCatalogue();
    const byId = new Map(inputs.map((input) => [input.event_id, input]));
    for (const row of rows) {
      assert.equal(row.skip, false);
      assert.equal(row.tag_version, 'v2');
      assert.equal(row.tagged_by, 'agent');
      const input = byId.get(row.event_id);
      assert.ok(input, row.event_id);
      if (!input) continue;
      assert.equal(isShortText(input.description), false, row.event_id);
      const result = validateTagOutput(
        {
          moods: row.moods,
          sortie: row.sortie,
          energie: row.energie,
          exigence: row.exigence,
          format_scene: row.format_scene,
          ideal_pour: row.ideal_pour,
          notoriete: row.notoriete,
          confiance: row.tag_confiance,
          preuve: row.tag_preuve,
        },
        { sourceText: sourceTextOfInput(input), concert: row.categorie === 'musique' },
      );
      assert.equal(result.ok, true, `${row.event_id} ${row.titre}`);
    }
    const message = userMessage(inputs[0]);
    assert.equal(message.includes('user_id'), false);
    assert.match(message, /^titre: /);
  });
});
