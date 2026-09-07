import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import {
  addMinutesToHeure,
  compactTimeRangeFromFields,
  formatCompactTimeRange,
  formatFicheHoraires,
  itemEndHeure,
  itemStartHeure,
  reliableDureeMin,
  seanceTimeLabel,
} from './eventTimes';

function lieu(): Lieu {
  return {
    lieu_id: 'L1',
    nom: 'Salle',
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
    titre: 'Titre',
    categorie: 'musique',
    date_debut: '2026-09-07',
    date_fin: '2026-09-07',
    heure_debut: '18:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    ...p,
  };
}

function prog(p: Partial<ProgrammeItem> = {}): ProgrammeItem {
  return {
    programme_id: 'P1',
    event_id: 'E1',
    lieu_id: 'L1',
    nom_item: 'Titre',
    type_item: '',
    date: '2026-09-07',
    heure_debut: '18:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: '',
    artiste_id: '',
    ...p,
  };
}

function programmeItem(p: Partial<ProgrammeItem> = {}, e: Partial<Evenement> = {}): DayItem {
  return {
    kind: 'programme',
    key: 'p:P1',
    dayIso: '2026-09-07',
    programme: prog(p),
    evenement: ev(e),
    lieu: lieu(),
  };
}

function fallbackItem(e: Partial<Evenement> = {}): DayItem {
  return {
    kind: 'fallback',
    key: 'e:E1',
    dayIso: '2026-09-07',
    evenement: ev(e),
    lieu: lieu(),
  };
}

describe('eventTimes — 0 invent', () => {
  it('shows début–fin when heure_fin is present', () => {
    const item = programmeItem({ heure_debut: '18:00', heure_fin: '20:30' });
    assert.equal(itemStartHeure(item), '18:00');
    assert.equal(itemEndHeure(item), '20:30');
    assert.equal(seanceTimeLabel(item), '18:00–20:30');
    assert.equal(formatFicheHoraires(item), 'Début 18:00 – Fin 20:30');
  });

  it('does not invent fin from duree_min', () => {
    const item = programmeItem({
      heure_debut: '18:00',
      heure_fin: '',
      duree_min: '90',
    });
    assert.equal(itemEndHeure(item), '');
    assert.equal(seanceTimeLabel(item), '18:00');
    assert.equal(formatFicheHoraires(item), 'Début 18:00');
  });

  it('concerts: hide fin when heure_fin is empty (no 90-min invent)', () => {
    const concert = programmeItem(
      { heure_debut: '20:30', heure_fin: '', duree_min: '90' },
      { categorie: 'musique', genre: 'concert' },
    );
    assert.equal(itemEndHeure(concert), '');
    assert.equal(seanceTimeLabel(concert), '20:30');
    assert.equal(formatFicheHoraires(concert), 'Début 20:30');
    assert.equal(
      compactTimeRangeFromFields('20:30', '', '90'),
      '20:30',
    );
  });

  it('hides fin when neither heure_fin nor duree_min exist', () => {
    const item = programmeItem({ heure_debut: '18:00', heure_fin: '' });
    assert.equal(itemEndHeure(item), '');
    assert.equal(seanceTimeLabel(item), '18:00');
    assert.equal(formatFicheHoraires(item), 'Début 18:00');
  });

  it('does not invent a fin from category fallbacks', () => {
    const cine = programmeItem(
      { heure_debut: '20:30', heure_fin: '', duree_min: '' },
      { categorie: 'cinema' },
    );
    const theatre = programmeItem(
      { heure_debut: '20:00', heure_fin: '', duree_min: '' },
      { categorie: 'theatre' },
    );
    assert.equal(seanceTimeLabel(cine), '20:30');
    assert.equal(seanceTimeLabel(theatre), '20:00');
  });

  it('rejects junk duree_min', () => {
    assert.equal(reliableDureeMin(''), null);
    assert.equal(reliableDureeMin('0'), null);
    assert.equal(reliableDureeMin('abc'), null);
    assert.equal(reliableDureeMin('90'), 90);
  });

  it('wraps overnight computed ends', () => {
    assert.equal(addMinutesToHeure('23:00', 90), '00:30');
  });

  it('uses parent event clocks on fallback rows', () => {
    const item = fallbackItem({
      heure_debut: '10:00',
      heure_fin: '18:00',
      date_debut: '2026-09-01',
      date_fin: '2026-11-01',
    });
    assert.equal(seanceTimeLabel(item), '10:00–18:00');
  });

  it('cinema séance: end only from that slot’s data', () => {
    const withEnd = programmeItem({
      heure_debut: '13:20',
      heure_fin: '15:10',
    });
    const startOnly = programmeItem({ heure_debut: '20:30', heure_fin: '' });
    assert.equal(seanceTimeLabel(withEnd), '13:20–15:10');
    assert.equal(seanceTimeLabel(startOnly), '20:30');
  });

  it('compactTimeRangeFromFields matches artist rows', () => {
    assert.equal(compactTimeRangeFromFields('19:00', '21:00'), '19:00–21:00');
    assert.equal(compactTimeRangeFromFields('19:00', '', '60'), '19:00');
    assert.equal(compactTimeRangeFromFields('19:00'), '19:00');
    assert.equal(formatCompactTimeRange('18:00', ''), '18:00');
  });
});
