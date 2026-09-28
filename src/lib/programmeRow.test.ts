import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeProgrammeRow,
  normalizeProgrammeRows,
} from './programmeRow';
import type { ProgrammeItem } from './types';

const TAG_FIELDS = ['moods', 'genres_mood', 'themes', 'form', 'mood_source'] as const;

function raw(partial: Record<string, string> = {}): Record<string, string> {
  return {
    programme_id: 'P1',
    event_id: 'E1',
    lieu_id: 'L1',
    nom_item: 'Film',
    type_item: 'film',
    date: '2026-10-01',
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: 'fiction',
    artiste_id: '',
    film_id: 'F1',
    ...partial,
  };
}

function tagTuple(item: ProgrammeItem): Record<(typeof TAG_FIELDS)[number], string> {
  return {
    moods: item.moods ?? '',
    genres_mood: item.genres_mood ?? '',
    themes: item.themes ?? '',
    form: item.form ?? '',
    mood_source: item.mood_source ?? '',
  };
}

describe('normalizeProgrammeRow', () => {
  it('defaults missing tag columns and fills form from an official film_id', () => {
    const item = normalizeProgrammeRow(raw({}));
    assert.deepEqual(tagTuple(item), {
      moods: '',
      genres_mood: '',
      themes: '',
      form: 'cine',
      mood_source: '',
    });
    assert.equal(item.mood_confiance, '');
    assert.equal(item.artiste_id, '');
    assert.equal(item.description_item, '');
  });

  it('keeps a form that is already set', () => {
    const item = normalizeProgrammeRow(
      raw({ form: 'festival', film_id: 'F1', moods: 'festif', mood_source: 'pitch' }),
    );
    assert.equal(item.form, 'festival');
    assert.equal(item.moods, 'festif');
    assert.equal(item.mood_source, 'pitch');
  });

  it('does not invent cine without a film_id', () => {
    const item = normalizeProgrammeRow(raw({ film_id: '', form: '' }));
    assert.equal(item.form, '');
    assert.equal(item.film_id, '');
  });

  it('keeps moods when press columns are absent', () => {
    const item = normalizeProgrammeRow(
      raw({
        film_id: '',
        form: 'theatre',
        moods: 'tendre',
        genres_mood: 'drame',
        themes: 'amour',
        mood_source: 'pitch',
      }),
    );
    assert.equal(item.moods, 'tendre');
    assert.equal(item.genres_mood, 'drame');
    assert.equal(item.themes, 'amour');
    assert.equal(item.mood_source, 'pitch');
    assert.equal(item.form, 'theatre');
    assert.equal(item.citation, '');
  });

  it('keeps extra catalogue columns present on the raw row', () => {
    const item = normalizeProgrammeRow(raw({ citation_2: '« belle »' }));
    assert.equal((item as Record<string, string>).citation_2, '« belle »');
  });
});

describe('normalizeProgrammeRows', () => {
  it('copies sibling moods, genres_mood and themes and marks mood_source=work', () => {
    const rows = normalizeProgrammeRows([
      raw({
        programme_id: 'P-TAG',
        moods: 'rigolo',
        genres_mood: 'comedie',
        themes: 'famille',
        mood_source: 'pitch',
        mood_confiance: 'haute',
        form: 'cine',
      }),
      raw({
        programme_id: 'P-EMPTY',
        moods: '',
        genres_mood: '',
        themes: '',
        mood_source: '',
        form: '',
      }),
    ]);
    assert.deepEqual(tagTuple(rows[0]), {
      moods: 'rigolo',
      genres_mood: 'comedie',
      themes: 'famille',
      form: 'cine',
      mood_source: 'pitch',
    });
    assert.deepEqual(tagTuple(rows[1]), {
      moods: 'rigolo',
      genres_mood: 'comedie',
      themes: 'famille',
      form: 'cine',
      mood_source: 'work',
    });
  });

  it('does not copy a parent mood source onto an empty séance', () => {
    const rows = normalizeProgrammeRows([
      raw({
        programme_id: 'P-PARENT',
        moods: 'rigolo',
        genres_mood: 'comedie',
        themes: 'famille',
        mood_source: 'parent',
        mood_confiance: 'haute',
      }),
      raw({
        programme_id: 'P-EMPTY',
        moods: '',
        genres_mood: '',
        themes: '',
        mood_source: '',
      }),
    ]);
    assert.deepEqual(tagTuple(rows[1]), {
      moods: '',
      genres_mood: '',
      themes: '',
      form: 'cine',
      mood_source: '',
    });
  });

  it('fills empty rows from films.csv and leaves a tagged row untouched', () => {
    const rows = normalizeProgrammeRows(
      [
        raw({
          programme_id: 'P-HAUTE',
          moods: 'rigolo',
          genres_mood: 'comedie',
          themes: 'amour',
          mood_source: 'pitch',
          mood_confiance: 'haute',
        }),
        raw({
          programme_id: 'P-EMPTY',
          moods: '',
          genres_mood: '',
          themes: '',
          mood_source: '',
        }),
      ],
      [{ film_id: 'F1', moods: 'sombre', genres_mood: 'drame', themes: 'deuil' }],
    );
    assert.deepEqual(tagTuple(rows[0]), {
      moods: 'rigolo',
      genres_mood: 'comedie',
      themes: 'amour',
      form: 'cine',
      mood_source: 'pitch',
    });
    assert.deepEqual(tagTuple(rows[1]), {
      moods: 'sombre',
      genres_mood: 'drame',
      themes: 'deuil',
      form: 'cine',
      mood_source: 'work',
    });
  });

  it('keeps the sibling set when films.csv tag cells are blank', () => {
    const rows = normalizeProgrammeRows(
      [
        raw({
          programme_id: 'P-HAUTE',
          moods: 'rigolo',
          genres_mood: 'comedie',
          themes: 'famille',
          mood_source: 'pitch',
          mood_confiance: 'haute',
        }),
        raw({
          programme_id: 'P-EMPTY',
          moods: '',
          genres_mood: '',
          themes: '',
          mood_source: '',
        }),
      ],
      [{ film_id: 'F1', moods: '', genres_mood: '  ', themes: '' }],
    );
    assert.deepEqual(tagTuple(rows[1]), {
      moods: 'rigolo',
      genres_mood: 'comedie',
      themes: 'famille',
      form: 'cine',
      mood_source: 'work',
    });
  });

  it('keeps mood_source when the row already has its own moods', () => {
    const rows = normalizeProgrammeRows([
      raw({
        programme_id: 'P-SRC',
        moods: 'intense',
        genres_mood: 'drame',
        themes: 'deuil',
        mood_source: 'pitch',
        mood_confiance: 'haute',
      }),
      raw({
        programme_id: 'P-OWN',
        moods: 'rigolo',
        genres_mood: '',
        themes: '',
        mood_source: 'pitch',
      }),
    ]);
    assert.deepEqual(tagTuple(rows[1]), {
      moods: 'rigolo',
      genres_mood: 'drame',
      themes: 'deuil',
      form: 'cine',
      mood_source: 'pitch',
    });
  });

  it('resolves the same tags when the input order changes', () => {
    const newer = raw({
      programme_id: 'P-NEW',
      film_id: 'FB',
      moods: 'poetique',
      genres_mood: 'drame',
      themes: 'histoire',
      mood_confiance: 'moyenne',
      scraped_at: '2026-09-01T19:00:07',
    });
    const older = raw({
      programme_id: 'P-OLD',
      film_id: 'FB',
      moods: 'brutal',
      genres_mood: 'thriller',
      themes: 'guerre',
      mood_confiance: 'moyenne',
      scraped_at: '2026-08-01T00:00:00',
    });
    const empty = raw({
      programme_id: 'P-EMPTY-B',
      film_id: 'FB',
      moods: '',
      genres_mood: '',
      themes: '',
      mood_source: '',
    });
    const orderA = normalizeProgrammeRows([older, empty, newer]);
    const orderB = normalizeProgrammeRows([newer, empty, older]);
    const filledA = orderA.find((row) => row.programme_id === 'P-EMPTY-B');
    const filledB = orderB.find((row) => row.programme_id === 'P-EMPTY-B');
    assert.ok(filledA && filledB);
    assert.deepEqual(tagTuple(filledA), tagTuple(filledB));
    assert.deepEqual(tagTuple(filledA), {
      moods: 'poetique',
      genres_mood: 'drame',
      themes: 'histoire',
      form: 'cine',
      mood_source: 'work',
    });
  });

  it('is deterministic for the five tag fields', () => {
    const input = [
      raw({
        programme_id: 'P-TAG',
        moods: 'rigolo',
        genres_mood: 'comedie',
        themes: 'famille',
        mood_source: 'pitch',
        mood_confiance: 'haute',
      }),
      raw({ programme_id: 'P-EMPTY', moods: '', genres_mood: '', themes: '' }),
    ];
    assert.deepEqual(
      normalizeProgrammeRows(input).map(tagTuple),
      normalizeProgrammeRows(input).map(tagTuple),
    );
  });
});

describe('catalogue loaders', () => {
  it('delegates programme rows to normalizeProgrammeRows in both loaders', () => {
    for (const file of ['src/lib/data.ts', 'scripts/loadCatalogue.ts']) {
      const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      const match = src.match(/function loadProgramme\(\)[^{]*\{([\s\S]*?)\n\}/);
      assert.ok(match, `${file} defines loadProgramme`);
      const body = match[1];
      assert.match(body, /normalizeProgrammeRows\(/);
      assert.doesNotMatch(body, /fillEmptyWorkTags|fillEmptyCineForm|moods:/);
    }
  });
});
