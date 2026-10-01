import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPublicCibleFromDescription,
  fillEmptyPublicCible,
  nextProgrammePublicCible,
  publicCibleForMinAge,
  publicCibleFromDescriptions,
  remnantVivantSansPublicCible,
  vivantAgeMentionStats,
} from './publicCibleAge';

describe('extractPublicCibleFromDescription', () => {
  it('maps the brief patterns onto catalogue values', () => {
    assert.equal(
      extractPublicCibleFromDescription('Durée 1 h, dès 6 ans'),
      'jeune_public',
    );
    assert.equal(extractPublicCibleFromDescription('Dès 7ans'), 'jeune_public');
    assert.equal(extractPublicCibleFromDescription('Dès 1 an'), 'jeune_public');
    assert.equal(
      extractPublicCibleFromDescription('à partir de 10 ans'),
      'jeune_public',
    );
    assert.equal(
      extractPublicCibleFromDescription('À partir de 12 ans.'),
      'ado',
    );
    assert.equal(
      extractPublicCibleFromDescription('à partir de 1 an'),
      'jeune_public',
    );
    assert.equal(
      extractPublicCibleFromDescription('18 ans et plus, ouverture 23h55'),
      'adulte',
    );
    assert.equal(extractPublicCibleFromDescription('18 ans et +'), 'adulte');
    assert.equal(extractPublicCibleFromDescription('les tout-petits'), 'jeune_public');
    assert.equal(extractPublicCibleFromDescription('tout-petit en immersion'), 'jeune_public');
    assert.equal(extractPublicCibleFromDescription('pour les tout petits'), 'jeune_public');
    assert.equal(extractPublicCibleFromDescription('Jeune public'), 'jeune_public');
    assert.equal(
      extractPublicCibleFromDescription('Version tout-jeune public.'),
      'jeune_public',
    );
    assert.equal(
      extractPublicCibleFromDescription('Jeune public dès 2 ans'),
      'jeune_public',
    );
    assert.equal(
      extractPublicCibleFromDescription('jeune public de 3 à 10 ans'),
      'jeune_public',
    );
    assert.equal(extractPublicCibleFromDescription('De 3 à 6 ans.'), 'jeune_public');
    assert.equal(
      extractPublicCibleFromDescription('de 9 mois à 7 ans'),
      'jeune_public',
    );
    assert.equal(extractPublicCibleFromDescription('de 0 à 3 ans'), 'jeune_public');
    assert.equal(
      extractPublicCibleFromDescription('pour la toute petite enfance'),
      'jeune_public',
    );
    assert.equal(extractPublicCibleFromDescription('Dès 14 ans.'), 'ado');
    assert.equal(extractPublicCibleFromDescription('dès 16 ans'), 'ado');
    assert.equal(extractPublicCibleFromDescription('dès 17 ans'), 'ado');
    assert.equal(
      extractPublicCibleFromDescription('Interdit aux moins de 18 ans.'),
      'adulte',
    );
    assert.equal(
      extractPublicCibleFromDescription('DÉCONSEILLÉ AU MOINS DE 14 ANS'),
      'ado',
    );
    assert.equal(
      extractPublicCibleFromDescription('Atelier réservé aux plus de 60 ans'),
      'adulte',
    );
    assert.equal(extractPublicCibleFromDescription('pour les 0-3 ans'), 'jeune_public');
    assert.equal(extractPublicCibleFromDescription('En continu ● 0-99 ans'), 'tout_public');
  });

  it('keeps a non-breaking space in dès N ans', () => {
    assert.equal(
      extractPublicCibleFromDescription('dès\u00a06\u00a0ans'),
      'jeune_public',
    );
  });

  it('does not false-fill anniversaries, clock times, or narrative ages', () => {
    const blanks = [
      '',
      '   ',
      'DJ set dès 17h',
      'ateliers dès 15/09 — pas de spectacle daté',
      'À l’occasion des 50 ans du Centre Pompidou',
      'La troupe fête ses 10 ans',
      'Après 4 ans de succès à Paris',
      'En famille, entre amis',
      'plus de 40 ans, le gothique à l’état pur',
      'se retrouvent 15 ans plus tard',
      'un garçon de 10 ans adore chanter',
      "fait de l'autostop depuis l'âge de 15 ans",
      'de 9h30 à 12h30 et de 14h à 17h',
      'pendant 800 ans : fresque musicale',
      'Subvention suspendue 2 ans.',
    ];
    for (const text of blanks) {
      assert.equal(extractPublicCibleFromDescription(text), '', text);
    }
  });

  it('reads the hour range and the real floor on the same blurb', () => {
    assert.equal(
      extractPublicCibleFromDescription(
        'de 9h30 à 12h30 (auberge possible) ouvert à tous, à partir de 15 ans de 30 € à 60 €',
      ),
      'ado',
    );
  });
});

describe('publicCibleForMinAge', () => {
  it('uses the closed catalogue bands', () => {
    assert.equal(publicCibleForMinAge(0), 'jeune_public');
    assert.equal(publicCibleForMinAge(11), 'jeune_public');
    assert.equal(publicCibleForMinAge(12), 'ado');
    assert.equal(publicCibleForMinAge(17), 'ado');
    assert.equal(publicCibleForMinAge(18), 'adulte');
    assert.equal(publicCibleForMinAge(60), 'adulte');
  });
});

describe('fillEmptyPublicCible', () => {
  it('never overwrites a non-empty value', () => {
    assert.equal(fillEmptyPublicCible('tout_public', 'dès 3 ans'), 'tout_public');
    assert.equal(fillEmptyPublicCible('jeune_public', '18 ans et plus'), 'jeune_public');
    assert.equal(
      fillEmptyPublicCible('Interdit - 16 ans', 'jeune public'),
      'Interdit - 16 ans',
    );
    assert.equal(fillEmptyPublicCible('  ado  ', 'dès 4 ans'), 'ado');
    assert.equal(fillEmptyPublicCible('enfants_famille', 'tout-petits'), 'enfants_famille');
  });

  it('fills only when the cell is empty and a motif matches', () => {
    assert.equal(fillEmptyPublicCible('', 'Durée 1 h, dès 6 ans'), 'jeune_public');
    assert.equal(fillEmptyPublicCible('   ', 'tout-petits'), 'jeune_public');
    assert.equal(fillEmptyPublicCible('', 'fête ses 10 ans'), '');
    assert.equal(fillEmptyPublicCible(undefined, 'dès 17h'), '');
  });
});

describe('nextProgrammePublicCible', () => {
  it('prefers the séance description over the event blurb', () => {
    assert.equal(
      publicCibleFromDescriptions('dès 16 ans', 'dès 6 ans'),
      'ado',
    );
    assert.equal(
      nextProgrammePublicCible({
        form: 'theatre',
        public_cible: '',
        description_item: 'Humour dès 16 ans.',
        event_description: 'Dès 6 ans',
      }),
      'ado',
    );
  });

  it('falls back to the event description', () => {
    assert.equal(
      nextProgrammePublicCible({
        form: 'enfants',
        description_item: 'Durée 50 min.',
        event_description: 'Lecture pour les tout-petits',
      }),
      'jeune_public',
    );
  });

  it('does not fill cinema or AlloCiné rows', () => {
    assert.equal(
      nextProgrammePublicCible({
        form: 'cine',
        description_item: 'dès 6 ans',
      }),
      null,
    );
    assert.equal(
      nextProgrammePublicCible({
        form: 'theatre',
        film_id: 'F0013',
        description_item: 'jeune public',
      }),
      null,
    );
  });

  it('does not overwrite and does not shadow a different parent value', () => {
    assert.equal(
      nextProgrammePublicCible({
        form: 'theatre',
        public_cible: 'tout_public',
        description_item: 'dès 4 ans',
      }),
      null,
    );
    assert.equal(
      nextProgrammePublicCible({
        form: 'concert',
        public_cible: '',
        event_public_cible: 'adulte',
        description_item: 'dès 6 ans',
      }),
      null,
    );
    assert.equal(
      nextProgrammePublicCible({
        form: 'theatre',
        public_cible: '',
        event_public_cible: 'ado',
        event_description: 'Dès 12 ans.',
      }),
      'ado',
    );
  });

  it('does not false-fill a vivant row whose text has no age motif', () => {
    assert.equal(
      nextProgrammePublicCible({
        form: 'concert',
        description_item: 'Pour les 10 ans du Taquin, 5 habitués se retrouvent.',
        event_description: 'En famille, entre amis, dès 19h.',
      }),
      null,
    );
  });
});

describe('vivantAgeMentionStats', () => {
  it('counts a filled parent as already renseigné and ignores cine', () => {
    const stats = vivantAgeMentionStats([
      {
        form: 'theatre',
        description_item: 'dès 6 ans',
        public_cible: '',
      },
      {
        form: 'theatre',
        description_item: 'dès 8 ans',
        public_cible: 'jeune_public',
      },
      {
        form: 'cine',
        description_item: 'dès 6 ans',
        public_cible: '',
      },
      {
        form: 'concert',
        description_item: 'fête ses 10 ans',
        public_cible: '',
      },
    ]);
    assert.equal(stats.mentions, 2);
    assert.equal(stats.filled, 1);
    assert.equal(stats.percent, 50);
  });
});

describe('remnantVivantSansPublicCible', () => {
  it('sorts missing upcoming séances descending and drops the past', () => {
    const rows = remnantVivantSansPublicCible(
      [
        {
          event_id: 'E2',
          titre: 'Deux',
          lieu: 'Salle B',
          date: '2026-10-02',
          form: 'theatre',
          public_cible: '',
        },
        {
          event_id: 'E1',
          titre: 'Un',
          lieu: 'Salle A',
          date: '2026-10-01',
          form: 'theatre',
          public_cible: '',
        },
        {
          event_id: 'E1',
          titre: 'Un',
          lieu: 'Salle A',
          date: '2026-10-03',
          form: 'theatre',
          public_cible: '',
        },
        {
          event_id: 'E1',
          titre: 'Un',
          lieu: 'Salle A',
          date: '2026-09-01',
          form: 'theatre',
          public_cible: '',
        },
        {
          event_id: 'E3',
          titre: 'Déjà',
          lieu: 'Salle C',
          date: '2026-10-04',
          form: 'concert',
          public_cible: 'tout_public',
        },
        {
          event_id: 'E4',
          titre: 'Film',
          lieu: 'Ciné',
          date: '2026-10-04',
          form: 'cine',
          public_cible: '',
        },
      ],
      '2026-09-30',
    );
    assert.deepEqual(rows, [
      {
        event_id: 'E1',
        titre: 'Un',
        lieu: 'Salle A',
        nb_seances_a_venir: '2',
      },
      {
        event_id: 'E2',
        titre: 'Deux',
        lieu: 'Salle B',
        nb_seances_a_venir: '1',
      },
    ]);
  });
});
