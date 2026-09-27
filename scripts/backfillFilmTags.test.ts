import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { backfillFilmTagsFiles } from './backfillFilmTags';

describe('backfillFilmTags', () => {
  it('is idempotent and never overwrites a films.csv value or inserts a missing film_id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'film-tags-'));
    const filmsPath = path.join(dir, 'films.csv');
    const programmePath = path.join(dir, 'programme.csv');
    fs.writeFileSync(
      filmsPath,
      [
        'film_id,titre,notes,moods,genres_mood,themes',
        'F1,Deja sombre,note,sombre,drame,',
        'F2,"Titre, virgule",note,,,',
        'F3,Sans soeur,note,,,',
        '',
      ].join('\r\n'),
    );
    const programme = [
      'programme_id,film_id,moods,genres_mood,themes,mood_source,mood_confiance,scraped_at',
      'P2,F1,rigolo,comedie,amour,pitch,haute,2026-09-01',
      'P1,F2,poetique,drame,histoire,pitch,haute,2026-08-01',
      'P3,F2,brutal,thriller,guerre,parent,haute,2026-09-02',
      'P4,F3,festif,comedie,famille,parent,haute,2026-09-02',
      'P9,F-ABSENT,intense,polar,deuil,pitch,moyenne,2026-07-01',
      '',
    ].join('\n');
    fs.writeFileSync(programmePath, programme);

    const first = backfillFilmTagsFiles({ filmsPath, programmePath });
    const once = fs.readFileSync(filmsPath);
    const second = backfillFilmTagsFiles({ filmsPath, programmePath });
    const twice = fs.readFileSync(filmsPath);

    assert.equal(first.filled, 2);
    assert.equal(second.filled, 0);
    assert.deepEqual(twice, once);
    assert.equal(fs.readFileSync(programmePath, 'utf8'), programme);
    assert.equal(
      twice.toString('utf8'),
      [
        'film_id,titre,notes,moods,genres_mood,themes',
        'F1,Deja sombre,note,sombre,drame,amour',
        'F2,"Titre, virgule",note,poetique,drame,histoire',
        'F3,Sans soeur,note,,,',
        '',
      ].join('\r\n'),
    );
    assert.equal(twice.toString('utf8').includes('F-ABSENT'), false);
    assert.equal(twice.toString('utf8').includes('rigolo'), false);
  });
});
