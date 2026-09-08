import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import {
  HOME_PACK_WIRE_CAP,
  omitBootScopeSnapshot,
  slimDayItem,
  detailDayItem,
  relatedSeanceDayItem,
} from './slim';

const LONG =
  'Première phrase assez longue pour le test. Deuxième phrase aussi. ' +
  'Troisième phrase qui doit disparaître du slim. ' +
  'Et encore du texte pour dépasser largement deux phrases.';

function lieu(): Lieu {
  return {
    lieu_id: 'L1',
    nom: 'Utopia',
    type: 'cinema',
    adresse: 'rue',
    commune: 'Toulouse',
    dist_km_capitole: '1',
    site_web: 'https://example.test',
    notes: 'interne',
  };
}

function ev(p: Partial<Evenement> = {}): Evenement {
  return {
    event_id: 'E1',
    lieu_id: 'L1',
    titre: 'Film',
    categorie: 'cinema',
    date_debut: '2026-09-12',
    date_fin: '2026-09-12',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '7€',
    gratuit: 'non',
    url_source: 'https://allocine.example/film',
    description_courte: 'Court.',
    statut: 'ouvert',
    genre: 'drame',
    description_longue: LONG,
    form: 'cine',
    moods: 'sombre',
    genres_mood: 'drame|auteur',
    billetterie_url: 'https://tickets.example/buy',
    ...p,
  };
}

function item(): DayItem {
  const programme: ProgrammeItem = {
    programme_id: 'P1',
    event_id: 'E1',
    lieu_id: 'L1',
    nom_item: 'Film',
    type_item: 'film',
    date: '2026-09-12',
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '7€',
    url: 'https://allocine.example/film',
    notes: '',
    genre: 'drame',
    artiste_id: '',
    film_id: 'F1',
    image_url: 'https://img.example/p.jpg',
    description_item: LONG,
    form: 'cine',
    moods: 'sombre',
    genres_mood: 'drame',
    billetterie_url: 'https://tickets.example/buy',
  };
  return {
    kind: 'programme',
    key: 'p:P1',
    dayIso: '2026-09-12',
    programme,
    evenement: ev(),
    lieu: lieu(),
  };
}

describe('slimDayItem list wire', () => {
  it('keeps full fiche copy; drops tickets URLs and mood tags', () => {
    const slim = slimDayItem(item());
    assert.equal(slim.evenement?.description_longue, LONG);
    assert.equal(slim.evenement?.url_source, '');
    assert.equal(slim.evenement?.billetterie_url, undefined);
    assert.equal(slim.evenement?.form, undefined);
    assert.equal(slim.evenement?.moods, undefined);
    if (slim.kind !== 'programme') assert.fail('expected programme');
    assert.equal(slim.programme.url, '');
    assert.equal(slim.programme.billetterie_url, undefined);
    assert.equal(slim.programme.description_item, LONG);
    assert.equal(slim.evenement?.description_courte, '');
  });

  it('keeps card fields SeanceCard needs', () => {
    const slim = slimDayItem(item());
    if (slim.kind !== 'programme') assert.fail('expected programme');
    assert.equal(slim.programme.nom_item, 'Film');
    assert.equal(slim.programme.heure_debut, '20:00');
    assert.equal(slim.programme.film_id, 'F1');
    assert.equal(slim.evenement?.categorie, 'cinema');
    assert.equal(slim.lieu?.commune, 'Toulouse');
    assert.equal(slim.lieu?.nom, 'Utopia');
  });

  it('detail still carries full copy and URLs', () => {
    const detail = detailDayItem(item());
    assert.equal(detail.evenement?.description_longue, LONG);
    if (detail.kind !== 'programme') assert.fail('expected programme');
    assert.equal(detail.programme.url, 'https://allocine.example/film');
    assert.equal(detail.programme.billetterie_url, 'https://tickets.example/buy');
  });

  it('detail and related seances keep catalogue mood tags for Réserver', () => {
    const raw = item();
    const detail = detailDayItem(raw);
    const related = relatedSeanceDayItem(raw);
    if (detail.kind !== 'programme') assert.fail('expected programme');
    if (related.kind !== 'programme') assert.fail('expected programme');
    assert.equal(detail.programme.moods, 'sombre');
    assert.equal(detail.programme.genres_mood, 'drame');
    assert.equal(detail.evenement?.moods, 'sombre');
    assert.equal(related.programme.moods, 'sombre');
    assert.equal(related.programme.genres_mood, 'drame');
    assert.equal(related.evenement?.moods, 'sombre');
    assert.equal(related.programme.billetterie_url, 'https://tickets.example/buy');
  });

  it('JSON of a slim card is much smaller than the fat source', () => {
    const raw = item();
    const slim = slimDayItem(raw);
    const fatJson = JSON.stringify(raw);
    const wireJson = JSON.stringify(slim);
    const fat = Buffer.byteLength(fatJson, 'utf8');
    const wire = Buffer.byteLength(wireJson, 'utf8');
    assert.ok(wire < fat, `slim ${wire} vs fat ${fat}`);
    assert.ok(wireJson.includes('description_longue'));
    assert.ok(!wireJson.includes('tickets.example'));
  });
});

describe('home boot snapshots', () => {
  it('caps living-arts first-paint wire at 80 unique works', () => {
    assert.equal(HOME_PACK_WIRE_CAP, 80);
  });

  it('omits the boot scope duplicate from listByScope', () => {
    const snaps = omitBootScopeSnapshot(
      {
        tous: { items: [1], total: 9 },
        soir: { items: [2], total: 3 },
      },
      'tous',
    );
    assert.equal(snaps.tous, undefined);
    assert.deepEqual(snaps.soir, { items: [2], total: 3 });
  });
});
