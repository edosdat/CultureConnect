import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  fillVivantPublicCibleFiles,
  measureVivantAgeFillFiles,
  parseCsvLine,
  replaceCsvField,
} from './fillVivantPublicCible';

describe('replaceCsvField', () => {
  it('fills an empty column and leaves quoted commas untouched', () => {
    const line =
      'P1,E1,"Durée 1 h, dès 6 ans","déjà, cité",,theatre';
    const fields = parseCsvLine(line);
    assert.deepEqual(fields, [
      'P1',
      'E1',
      'Durée 1 h, dès 6 ans',
      'déjà, cité',
      '',
      'theatre',
    ]);
    const next = replaceCsvField(line, 4, 'jeune_public');
    assert.equal(
      next,
      'P1,E1,"Durée 1 h, dès 6 ans","déjà, cité",jeune_public,theatre',
    );
    assert.equal(parseCsvLine(next)[3], 'déjà, cité');
    assert.equal(parseCsvLine(next)[4], 'jeune_public');
  });

  it('replaces a quoted empty cell without touching an escaped quote', () => {
    const line = 'P2,"dit ""bonjour""",""';
    assert.equal(replaceCsvField(line, 2, 'ado'), 'P2,"dit ""bonjour""",ado');
  });
});

describe('fillVivantPublicCibleFiles', () => {
  it('fills empty vivant cells, skips cine and existing values, and is idempotent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivant-pc-'));
    const programmePath = path.join(dir, 'programme.csv');
    const evenementsPath = path.join(dir, 'evenements.csv');
    const lieuxPath = path.join(dir, 'lieux.csv');
    const remnantPath = path.join(dir, 'vivant-sans-public-cible.csv');

    fs.writeFileSync(
      programmePath,
      [
        'programme_id,event_id,lieu_id,nom_item,date,description_item,public_cible,film_id,form',
        'P1,E1,L1,Secrets,2026-10-02,"Durée 1 h, dès 6 ans",,,theatre',
        'P2,E1,L1,Secrets,2026-10-03,"Durée 1 h, dès 6 ans",,,theatre',
        'P3,E2,L1,Déjà,2026-10-02,dès 4 ans,tout_public,,theatre',
        'P4,E3,L2,Visa,2026-10-02,dès 6 ans,,F9,cine',
        'P5,E4,L1,Anniv,2026-10-04,La troupe fête ses 10 ans,,,concert',
        'P5b,E4,L1,Anniv,2026-09-01,La troupe fête ses 10 ans,,,concert',
        'P6,E5,L1,Parent,2026-10-05,Dès 12 ans.,,,theatre',
        '',
      ].join('\r\n'),
    );
    fs.writeFileSync(
      evenementsPath,
      [
        'event_id,lieu_id,titre,description_courte,description_longue,public_cible',
        'E1,L1,Secrets au Kiwi,Dès 6 ans,,',
        'E2,L1,Déjà plein,,,tout_public',
        'E3,L2,Film Allo,,,',
        'E4,L1,Les 10 ans,,,',
        'E5,L1,Dracula,Dès 12 ans.,,ado',
        '',
      ].join('\r\n'),
    );
    fs.writeFileSync(
      lieuxPath,
      [
        'lieu_id,nom,label_affiche',
        'L1,Kiwi,Toulouse — Kiwi',
        'L2,Gaumont,Toulouse — Gaumont',
        '',
      ].join('\r\n'),
    );

    const first = fillVivantPublicCibleFiles({
      programmePath,
      evenementsPath,
      lieuxPath,
      remnantPath,
      today: '2026-09-30',
    });
    const onceProgramme = fs.readFileSync(programmePath);
    const onceRemnant = fs.readFileSync(remnantPath, 'utf8');

    assert.equal(first.filled, 3);
    assert.equal(first.mentions, 4);
    assert.equal(first.filledAfter, 4);
    assert.equal(first.percent, 100);
    assert.equal(first.remnant, 1);

    const programme = onceProgramme.toString('utf8');
    assert.match(programme, /P1,E1,L1,Secrets,2026-10-02,"Durée 1 h, dès 6 ans",jeune_public,,theatre/);
    assert.match(programme, /P2,E1,L1,Secrets,2026-10-03,"Durée 1 h, dès 6 ans",jeune_public,,theatre/);
    assert.match(programme, /P3,E2,L1,Déjà,2026-10-02,dès 4 ans,tout_public,,theatre/);
    assert.match(programme, /P4,E3,L2,Visa,2026-10-02,dès 6 ans,,F9,cine/);
    assert.match(programme, /P6,E5,L1,Parent,2026-10-05,Dès 12 ans.,ado,,theatre/);
    assert.equal(fs.readFileSync(evenementsPath, 'utf8').includes('ado'), true);
    assert.match(
      onceRemnant,
      /^event_id,titre,lieu,nb_seances_a_venir\r\nE4,Les 10 ans,Toulouse — Kiwi,1\r\n$/,
    );

    const second = fillVivantPublicCibleFiles({
      programmePath,
      evenementsPath,
      lieuxPath,
      remnantPath,
      today: '2026-09-30',
    });
    assert.equal(second.filled, 0);
    assert.equal(second.percent, 100);
    assert.deepEqual(fs.readFileSync(programmePath), onceProgramme);
    assert.equal(fs.readFileSync(remnantPath, 'utf8'), onceRemnant);
  });
});

describe('catalogue E4', () => {
  const data = path.join(process.cwd(), 'data');

  it('fills at least 70% of vivant séances whose description has an age mention', () => {
    const stats = measureVivantAgeFillFiles({
      programmePath: path.join(data, 'programme.csv'),
      evenementsPath: path.join(data, 'evenements.csv'),
    });
    assert.ok(stats.mentions > 0);
    assert.ok(
      stats.percent >= 70,
      `${stats.filled}/${stats.mentions} = ${stats.percent.toFixed(1)}%`,
    );
  });

  it('keeps the remnant csv sorted by upcoming séances descending', () => {
    const text = fs.readFileSync(path.join(data, 'vivant-sans-public-cible.csv'), 'utf8');
    const lines = text.trim().split(/\r?\n/);
    assert.equal(lines[0], 'event_id,titre,lieu,nb_seances_a_venir');
    let prev = Infinity;
    let prevId = '';
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      assert.equal(cells.length, 4);
      const n = Number(cells[3]);
      assert.ok(n > 0);
      assert.ok(n < prev || (n === prev && cells[0] > prevId));
      prev = n;
      prevId = cells[0];
    }
  });
});
