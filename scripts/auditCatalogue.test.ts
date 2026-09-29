import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_FORMS,
  formatAuditReport,
  type AuditInput,
  type AuditSeance,
} from './auditCatalogue';

const TODAY = '2026-09-28';
const SHA = 'a'.repeat(64);

function seance(partial: Partial<AuditSeance> & Pick<AuditSeance, 'date' | 'form'>): AuditSeance {
  return {
    moods: '',
    moodSource: '',
    genresMood: '',
    themes: '',
    genre: '',
    filmId: '',
    workId: partial.workId ?? partial.filmId ?? partial.form,
    lieuId: '',
    ...partial,
  };
}

function report(partial: Partial<AuditInput> & Pick<AuditInput, 'seances'>): string {
  return formatAuditReport({
    todayIso: TODAY,
    programmeSha256: SHA,
    commitSha: '09f1378',
    lieux: [],
    ...partial,
  });
}

function line(text: string, label: string): string {
  const found = text.split('\n').find((row) => row.startsWith(label));
  assert.ok(found, `ligne manquante : ${label}`);
  return found!;
}

describe('formatAuditReport', () => {
  it('aligne les libellés et pose sha256 + commit', () => {
    const text = report({
      seances: [seance({ date: '2026-10-02', form: 'cine', workId: 'f:F1', filmId: 'F1' })],
    });
    assert.match(text, new RegExp(`^Fenêtre : ${TODAY} → 2026-10-02     sha256\\(programme\\.csv\\) : ${SHA}$`, 'm'));
    assert.match(text, /^Commit  : 09f1378$/m);
    const metrics = text
      .split('\n')
      .filter((row) => row.includes(' : ') && !row.startsWith(' ') && !row.startsWith('Fenêtre') && !row.startsWith('Commit'));
    const cols = new Set(metrics.map((row) => row.indexOf(' : ')));
    assert.equal(cols.size, 1);
    for (const form of AUDIT_FORMS) {
      assert.match(line(text, 'Séances à venir par forme'), new RegExp(`${form} \\d+`));
    }
    assert.match(
      line(text, 'Couverture moods par forme'),
      /propres \/ via œuvre \(work\) \/ aucune$/,
    );
    assert.match(line(text, 'Passerelle mood × forme'), /mood → \(ciné, théâtre, concert\)$/);
    assert.match(line(text, 'Lieux actifs sans coordonnées'), /0   \(séances concernées : 0\)$/);
    assert.match(text, /^ {2}rigolo +\→ \(0, 0, 0\)$/m);
    assert.match(text, /^ {2}angoissant +\→ \(0, 0, 0\)$/m);
  });

  it('compte moods, slug scorable, œuvres, horizon et films non taggés', () => {
    const text = report({
      seances: [
        seance({
          date: '2026-09-01',
          form: 'cine',
          moods: 'rigolo',
          moodSource: 'pitch',
          filmId: 'PAST',
          workId: 'f:PAST',
        }),
        seance({
          date: TODAY,
          form: 'cine',
          moods: 'rigolo',
          moodSource: 'pitch',
          filmId: 'F1',
          workId: 'f:F1',
          genre: 'fiction',
        }),
        seance({
          date: '2026-10-08',
          form: 'cinéma',
          moods: 'intense',
          moodSource: 'work',
          filmId: 'F1',
          workId: 'f:F1',
          lieuId: 'L-vide',
        }),
        seance({
          date: '2026-10-08',
          form: 'cine',
          moods: '',
          genre: 'animation_jeune_public',
          filmId: 'F2',
          workId: 'f:F2',
          lieuId: 'L-vide',
        }),
        seance({
          date: '2026-10-01',
          form: 'theatre',
          moods: 'rigolo|poetique',
          moodSource: 'pitch',
          workId: 'e:E1',
          lieuId: 'L-ok',
        }),
        seance({
          date: '2026-09-29',
          form: 'festival',
          moods: 'festif',
          moodSource: 'pitch',
          workId: 'e:E9',
        }),
        seance({
          date: '2026-09-30',
          form: 'concert',
          genre: 'fiction',
          filmId: '',
          workId: 'e:E2',
        }),
        seance({
          date: '2026-09-30',
          form: 'enfants',
          themes: 'famille',
          workId: 'e:E3',
        }),
      ],
      lieux: [
        { lieuId: 'L-vide', hasCoords: false, active: true },
        { lieuId: 'L-ok', hasCoords: true, active: true },
        { lieuId: 'L-event', hasCoords: false, active: true },
        { lieuId: 'L-past', hasCoords: false, active: false },
      ],
    });

    assert.match(
      line(text, 'Séances à venir par forme'),
      /cine 3 \/ theatre 1 \/ concert 1 \/ enfants 1 \/ festival 1$/,
    );
    assert.match(text, /^ {2}cine +1 \(33 %\) \/ 1 \(33 %\) \/ 1 \(33 %\)$/m);
    assert.match(
      line(text, 'Couverture slug scorable par forme'),
      /cine 100 % \/ theatre 100 % \/ concert 0 % \/ enfants 100 % \/ festival 100 %$/,
    );
    assert.match(
      line(text, 'Œuvres distinctes par forme'),
      /cine 2 \/ theatre 1 \/ concert 1 \/ enfants 1 \/ festival 1$/,
    );
    assert.match(
      line(text, 'Horizon par forme'),
      /cine 10 jours \/ theatre 3 jours \/ concert 2 jours \/ enfants 2 jours \/ festival 1 jour$/,
    );
    assert.match(text, /^ {2}rigolo +\→ \(1, 1, 0\)$/m);
    assert.match(text, /^ {2}festif +\→ \(0, 0, 0\)$/m);
    assert.match(
      line(text, 'Lieux actifs sans coordonnées'),
      /2   \(séances concernées : 2\)$/,
    );
    assert.match(line(text, 'Films ciné à venir non taggés'), /: 1$/);
  });

  it('écrit inconnu quand le commit est vide', () => {
    const text = report({
      commitSha: '   ',
      seances: [],
    });
    assert.match(text, /^Fenêtre : 2026-09-28 → 2026-09-28 /m);
    assert.match(text, /^Commit  : inconnu$/m);
    assert.match(line(text, 'Films ciné à venir non taggés'), /: 0$/);
  });
});
