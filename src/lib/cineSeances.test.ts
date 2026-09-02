import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { TOULOUSE_ORIGIN } from './geo';
import { filmVersionLabel, knownPrixLabel } from './labels';
import {
  cinemaOptionLabel,
  cineDistanceOrigin,
  defaultCineSeance,
  groupCinemasForFilm,
  horaireOptionLabel,
  seanceMetaLabel,
  seancesAtCinema,
} from './cineSeances';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

function lieu(opts: {
  id: string;
  nom: string;
  lat?: string;
  lng?: string;
}): Lieu {
  return {
    lieu_id: opts.id,
    nom: opts.nom,
    type: 'cinema',
    adresse: '',
    commune: 'Toulouse',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
    lat: opts.lat,
    lng: opts.lng,
  };
}

function item(opts: {
  key: string;
  lieuId: string;
  nom: string;
  day: string;
  heure: string;
  lat?: string;
  lng?: string;
  prix?: string;
  prixItem?: string;
  langue?: string;
  evLangue?: string;
}): DayItem {
  const evenement: Evenement = {
    event_id: opts.key,
    lieu_id: opts.lieuId,
    titre: 'La Dernière patiente',
    categorie: 'cinema',
    date_debut: opts.day,
    date_fin: opts.day,
    heure_debut: opts.heure,
    heure_fin: '',
    prix: opts.prix ?? '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    langue: opts.evLangue ?? '',
  };
  const programme: ProgrammeItem = {
    programme_id: `p-${opts.key}`,
    event_id: opts.key,
    lieu_id: opts.lieuId,
    nom_item: 'La Dernière patiente',
    type_item: 'film',
    date: opts.day,
    heure_debut: opts.heure,
    heure_fin: '',
    scene_salle: '',
    prix_item: opts.prixItem ?? '',
    url: `https://tickets.example/${opts.key}`,
    notes: '',
    genre: '',
    artiste_id: '',
    film_id: 'F9999',
    langue: opts.langue ?? '',
  };
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: opts.day,
    programme,
    evenement,
    lieu: lieu({
      id: opts.lieuId,
      nom: opts.nom,
      lat: opts.lat,
      lng: opts.lng,
    }),
  };
}

const ABC = item({
  key: 'abc-late',
  lieuId: 'L127',
  nom: 'Cinéma ABC',
  day: '2026-09-03',
  heure: '20:30',
  lat: '43.6090919',
  lng: '1.4439371',
  prixItem: '8,20€',
  langue: 'VOSTFR',
});
const ABC_SOON = item({
  key: 'abc-soon',
  lieuId: 'L127',
  nom: 'Cinéma ABC',
  day: '2026-09-02',
  heure: '13:20',
  lat: '43.6090919',
  lng: '1.4439371',
  prixItem: '8,20€',
  langue: 'VF',
});
const LABEGE = item({
  key: 'labege-soon',
  lieuId: 'L138',
  nom: 'Pathé Labège',
  day: '2026-09-02',
  heure: '10:00',
  lat: '43.5486',
  lng: '1.5069',
  prix: '7€',
  evLangue: 'VO',
});

describe('cine seances cinema-then-time', () => {
  it('defaults to the nearest cinema, then the soonest séance there', () => {
    const rows = [LABEGE, ABC, ABC_SOON];
    const pick = defaultCineSeance(rows, TOULOUSE_ORIGIN);
    assert.equal(pick?.key, 'abc-soon');
    const groups = groupCinemasForFilm(rows, TOULOUSE_ORIGIN);
    assert.equal(groups[0]?.label, 'Cinéma ABC');
    assert.ok(groups[0]?.kmLabel);
    assert.match(groups[0]!.kmLabel!, /\d+(,\d)? km/);
    assert.deepEqual(
      groups[0]?.seances.map((s) => s.key),
      ['abc-soon', 'abc-late'],
    );
    assert.equal(groups[1]?.label, 'Pathé Labège');
  });

  it('uses Toulouse/Capitole when GPS is off', () => {
    assert.deepEqual(cineDistanceOrigin(null), TOULOUSE_ORIGIN);
    const withGps = defaultCineSeance(
      [LABEGE, ABC_SOON],
      { lat: 43.5486, lng: 1.5069 },
    );
    assert.equal(withGps?.key, 'labege-soon');
    const noGps = defaultCineSeance([LABEGE, ABC_SOON], null);
    assert.equal(noGps?.key, 'abc-soon');
  });

  it('horaire options are only the selected cinema', () => {
    const rows = [LABEGE, ABC, ABC_SOON];
    const atAbc = seancesAtCinema(rows, 'L127');
    assert.deepEqual(
      atAbc.map((s) => s.key),
      ['abc-soon', 'abc-late'],
    );
    assert.equal(horaireOptionLabel(ABC_SOON), '02/09 · 13:20');
    const groups = groupCinemasForFilm(rows, TOULOUSE_ORIGIN);
    assert.match(cinemaOptionLabel(groups[0]!), /Cinéma ABC · .+ km/);
  });

  it('shows prix and VF/VOST only when the catalogue has them', () => {
    assert.equal(seanceMetaLabel(ABC_SOON), '8,20€ · VF');
    assert.equal(seanceMetaLabel(ABC), '8,20€ · VOSTFR');
    assert.equal(seanceMetaLabel(LABEGE), '7€ · VO');
    const bare = item({
      key: 'bare',
      lieuId: 'L1',
      nom: 'Salle',
      day: '2026-09-02',
      heure: '18:00',
    });
    assert.equal(seanceMetaLabel(bare), '');
    assert.equal(knownPrixLabel('', { prix: '', gratuit: 'non' }), null);
    assert.equal(knownPrixLabel('', { prix: '', gratuit: '' }), null);
    assert.equal(filmVersionLabel(''), null);
    assert.equal(filmVersionLabel('fr'), null);
    assert.equal(filmVersionLabel('VOSTFR'), 'VOSTFR');
    assert.equal(filmVersionLabel(undefined, 'VF'), 'VF');
  });

  it('catalogue version/price columns are langue + prix, not invented vo/vost/version', () => {
    const header = (file: string) =>
      fs
        .readFileSync(path.join(process.cwd(), 'data', file), 'utf-8')
        .split('\n')[0]
        .split(',');
    const evCols = header('evenements.csv');
    const prCols = header('programme.csv');
    assert.ok(evCols.includes('langue'));
    assert.ok(evCols.includes('prix'));
    assert.ok(prCols.includes('langue'));
    assert.ok(prCols.includes('prix_item'));
    assert.ok(!evCols.includes('version'));
    assert.ok(!evCols.includes('vo'));
    assert.ok(!evCols.includes('vost'));
    assert.ok(!prCols.includes('version'));
  });
});
