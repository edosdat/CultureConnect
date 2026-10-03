import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import { mixJour, mixMeta, toMixPlans } from './mixWeek';
import { queryMixWeek } from './agendaQuery';

function lieu(nom = 'Le Rex'): Lieu {
  return {
    lieu_id: 'L1',
    nom,
    label_affiche: '',
    type: '',
    adresse: '',
    commune: 'Toulouse',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
  };
}

function ev(p: Partial<Evenement> = {}): Evenement {
  return {
    event_id: 'E1',
    lieu_id: 'L1',
    titre: 'Saison',
    categorie: 'theatre',
    date_debut: '2026-10-03',
    date_fin: '2026-10-04',
    heure_debut: '20:30',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: 'humour',
    form: 'theatre',
    moods: 'rigolo|festif',
    mood_confiance: 'haute',
    ...p,
  };
}

function prog(p: Partial<ProgrammeItem> = {}): ProgrammeItem {
  return {
    programme_id: 'P1',
    event_id: 'E1',
    lieu_id: 'L1',
    nom_item: 'Toulouse j’adore !',
    type_item: '',
    date: '2026-10-03',
    heure_debut: '20:30',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: 'humour',
    artiste_id: '',
    film_id: '',
    image_url: '',
    form: 'theatre',
    moods: '',
    mood_confiance: '',
    ...p,
  };
}

describe('toMixPlans', () => {
  it('inherits theatre parent moods and refuses cinema parent moods', () => {
    const theatre: DayItem = {
      kind: 'programme',
      key: 'p:P1',
      dayIso: '2026-10-03',
      programme: prog(),
      evenement: ev(),
      lieu: lieu('La Comédie'),
    };
    const film: DayItem = {
      kind: 'programme',
      key: 'p:P2',
      dayIso: '2026-10-03',
      programme: prog({
        programme_id: 'P2',
        nom_item: 'Fenêtre',
        film_id: 'F9',
        form: 'cine',
        moods: 'sortie',
        genre: 'fiction',
      }),
      evenement: ev({
        categorie: 'cinema',
        form: 'cine',
        moods: 'rigolo|festif',
        mood_confiance: 'haute',
      }),
      lieu: lieu('Le Cratère'),
    };
    const plans = toMixPlans([theatre, film], []);
    assert.equal(plans.length, 1);
    assert.equal(plans[0]?.key, 'p:P1');
    assert.deepEqual(plans[0]?.moods, ['rigolo', 'festif']);
    assert.equal(plans[0]?.confiance, 'haute');
    assert.equal(plans[0]?.bucket, 'vivant');
  });

  it('keeps the soonest séance of one work', () => {
    const late: DayItem = {
      kind: 'programme',
      key: 'p:late',
      dayIso: '2026-10-04',
      programme: prog({
        programme_id: 'late',
        nom_item: 'Même titre',
        date: '2026-10-04',
        heure_debut: '21:00',
        moods: 'intense',
        mood_confiance: 'basse',
      }),
      evenement: ev({ moods: '' }),
      lieu: lieu(),
    };
    const early: DayItem = {
      kind: 'programme',
      key: 'p:early',
      dayIso: '2026-10-03',
      programme: prog({
        programme_id: 'early',
        nom_item: 'Même titre',
        date: '2026-10-03',
        heure_debut: '18:00',
        moods: 'intense',
        mood_confiance: 'basse',
      }),
      evenement: ev({ moods: '' }),
      lieu: lieu(),
    };
    const plans = toMixPlans([late, early], []);
    assert.equal(plans.length, 1);
    assert.equal(plans[0]?.key, 'p:early');
    assert.equal(plans[0]?.heure, '18:00');
  });

  it('formats jour · heure · lieu', () => {
    assert.equal(mixJour('2026-10-03'), 'sam');
    assert.equal(
      mixMeta({
        categorie: 'Comédie',
        dayIso: '2026-10-03',
        heure: '20:30',
        lieu: 'La Comédie',
      }),
      'Comédie · sam 20:30 · La Comédie',
    );
  });
});

describe('queryMixWeek', () => {
  it('returns this week with moods and unique keys', () => {
    const { scope, items } = queryMixWeek(new Date('2026-10-03T12:00:00+02:00'));
    assert.equal(scope, 'semaine');
    const keys = new Set<string>();
    for (const item of items) {
      assert.ok(item.moods.length > 0, item.key);
      assert.ok(item.key);
      assert.equal(keys.has(item.key), false);
      keys.add(item.key);
      assert.ok(item.bucket === 'cine' || item.bucket === 'musique' || item.bucket === 'vivant');
    }
  });
});
