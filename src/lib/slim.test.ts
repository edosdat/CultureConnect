import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import {
  HOME_FIRST_PAINT_CINE_CAP,
  HOME_PACK_HERO_COPY_CAP,
  HOME_PACK_WIRE_CAP,
  listItemHasHeroFicheCopy,
  omitBootScopeSnapshot,
  slimDayItem,
  detailDayItem,
  relatedSeanceDayItem,
} from './slim';
import { seanceHeureLabel, seanceVersionLabel } from './cineSeances';

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
    langue: 'VOSTFR',
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
    langue: 'VF',
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
  it('clips fiche copy; drops tickets URLs and mood tags', () => {
    const slim = slimDayItem(item());
    assert.equal(slim.evenement?.description_longue, undefined);
    assert.equal(slim.evenement?.url_source, '');
    assert.equal(slim.evenement?.billetterie_url, undefined);
    assert.equal(slim.evenement?.form, undefined);
    assert.equal(slim.evenement?.moods, undefined);
    if (slim.kind !== 'programme') assert.fail('expected programme');
    assert.equal(slim.programme.url, '');
    assert.equal(slim.programme.billetterie_url, undefined);
    assert.ok(slim.programme.description_item.length < LONG.length);
    assert.ok(slim.programme.description_item.includes('Première phrase'));
    assert.equal(slim.evenement?.description_courte, '');
    assert.equal(listItemHasHeroFicheCopy(slim), false);
  });

  it('keepFicheCopy holds full hero copy for first-paint packs', () => {
    const hero = slimDayItem(item(), { keepFicheCopy: true });
    assert.equal(hero.evenement?.description_longue, LONG);
    if (hero.kind !== 'programme') assert.fail('expected programme');
    assert.equal(hero.programme.description_item, LONG);
    assert.equal(listItemHasHeroFicheCopy(hero), true);
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
    assert.equal(slim.programme.langue, 'VF');
    assert.equal(slim.evenement?.langue, 'VOSTFR');
  });

  it('keeps catalogue langue on slim and related seances for VF/VOST', () => {
    const raw = item();
    const slim = slimDayItem(raw);
    const related = relatedSeanceDayItem(raw);
    const detail = detailDayItem(raw);
    if (slim.kind !== 'programme') assert.fail('expected programme');
    if (related.kind !== 'programme') assert.fail('expected programme');
    if (detail.kind !== 'programme') assert.fail('expected programme');
    assert.equal(slim.programme.langue, 'VF');
    assert.equal(slim.evenement?.langue, 'VOSTFR');
    assert.equal(related.programme.langue, 'VF');
    assert.equal(related.evenement?.langue, 'VOSTFR');
    assert.equal(detail.programme.langue, 'VF');
    assert.equal(detail.evenement?.langue, 'VOSTFR');
    assert.equal(seanceVersionLabel(slim), 'VF');
    assert.equal(seanceVersionLabel(related), 'VF');
    assert.equal(seanceHeureLabel(slim), '20:00 VF');
  });

  it('keeps programme citation* so theatre pack cards can resolve press', () => {
    const raw = item();
    if (raw.kind !== 'programme') assert.fail('expected programme');
    raw.evenement = ev({
      categorie: 'theatre_danse',
      citation: '',
    });
    raw.programme = {
      ...raw.programme,
      citation: 'Une pièce d’une rare intensité.',
      source: 'Télérama',
      source_url: 'https://www.telerama.fr/scenes/exemple',
      note_presse: 'TTTT',
    };
    const slim = slimDayItem(raw);
    if (slim.kind !== 'programme') assert.fail('expected programme');
    assert.equal(slim.programme.citation, 'Une pièce d’une rare intensité.');
    assert.equal(slim.programme.source, 'Télérama');
    assert.equal(slim.programme.note_presse, 'TTTT');
    assert.equal(slim.evenement?.citation, undefined);
  });

  it('keeps evenement citation* when programme has none (fill-empty OR)', () => {
    const raw = item();
    if (raw.kind !== 'programme') assert.fail('expected programme');
    raw.evenement = ev({
      categorie: 'theatre_danse',
      citation: 'Un pur régal.',
      source: 'Télérama',
      source_url: 'https://www.telerama.fr/scenes/chers',
    });
    const slim = slimDayItem(raw);
    if (slim.kind !== 'programme') assert.fail('expected programme');
    assert.equal(slim.programme.citation, undefined);
    assert.equal(slim.evenement?.citation, 'Un pur régal.');
    assert.equal(slim.evenement?.source, 'Télérama');
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
    assert.ok(!wireJson.includes(LONG));
    assert.ok(!wireJson.includes('tickets.example'));
  });
});

describe('home boot snapshots', () => {
  it('caps living-arts first-paint wire at 80 unique works', () => {
    assert.equal(HOME_PACK_WIRE_CAP, 80);
    assert.equal(HOME_PACK_HERO_COPY_CAP, 8);
    assert.equal(HOME_FIRST_PAINT_CINE_CAP, 10);
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
