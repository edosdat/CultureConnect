import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cataloguePriceLabel,
  cineHoraireLabel,
  defaultCineDistanceKm,
  pickCineSeance,
  seanceDistanceOrigin,
  seanceVersionLabel,
  TOULOUSE_ORIGIN,
} from './cineSeances';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

const CAPITOLE = TOULOUSE_ORIGIN;
const LABEGE_GPS = { lat: 43.5486, lng: 1.5069 };

function lieu(opts: {
  id?: string;
  nom?: string;
  commune?: string;
  lat?: string;
  lng?: string;
}): Lieu {
  return {
    lieu_id: opts.id ?? 'L1',
    nom: opts.nom ?? 'Salle',
    type: '',
    adresse: '',
    commune: opts.commune ?? 'Toulouse',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
    lat: opts.lat,
    lng: opts.lng,
  };
}

function item(opts: {
  key: string;
  nom?: string;
  day?: string;
  heure?: string;
  lieuId?: string;
  lieuNom?: string;
  commune?: string;
  lat?: string;
  lng?: string;
  prixItem?: string;
  prix?: string;
  gratuit?: string;
  langue?: string;
}): DayItem {
  const evenement: Evenement = {
    event_id: opts.key,
    lieu_id: opts.lieuId ?? 'L1',
    titre: opts.nom ?? opts.key,
    categorie: 'cinema',
    date_debut: opts.day ?? '2026-09-02',
    date_fin: opts.day ?? '2026-09-02',
    heure_debut: opts.heure ?? '13:20',
    heure_fin: '',
    prix: opts.prix ?? '',
    gratuit: opts.gratuit ?? '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    langue: opts.langue ?? '',
  };
  const programme: ProgrammeItem = {
    programme_id: `p-${opts.key}`,
    event_id: opts.key,
    lieu_id: opts.lieuId ?? 'L1',
    nom_item: opts.nom ?? opts.key,
    type_item: '',
    date: opts.day ?? '2026-09-02',
    heure_debut: opts.heure ?? '13:20',
    heure_fin: '',
    scene_salle: '',
    prix_item: opts.prixItem ?? '',
    url: '',
    notes: '',
    genre: '',
    artiste_id: '',
    film_id: 'F1',
  };
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: opts.day ?? '2026-09-02',
    programme,
    evenement,
    lieu: lieu({
      id: opts.lieuId,
      nom: opts.lieuNom,
      commune: opts.commune,
      lat: opts.lat,
      lng: opts.lng,
    }),
  };
}

const abc = item({
  key: 'abc-1320',
  lieuId: 'L127',
  lieuNom: 'Cinéma ABC',
  heure: '13:20',
  lat: '43.6045',
  lng: '1.4472',
});
const abcEvening = item({
  key: 'abc-2030',
  lieuId: 'L127',
  lieuNom: 'Cinéma ABC',
  heure: '20:30',
  lat: '43.6045',
  lng: '1.4472',
});
const labege = item({
  key: 'labege-1800',
  lieuId: 'L140',
  lieuNom: 'Pathé Labège',
  commune: 'Labège',
  heure: '18:00',
  lat: '43.5486',
  lng: '1.5069',
});

describe('cine seance selection', () => {
  it('defaults to the closest cinema (GPS), horaires of that cinema only', () => {
    const pick = pickCineSeance([labege, abcEvening, abc], {
      origin: CAPITOLE,
    });
    assert.equal(pick.venue?.id, 'L127');
    assert.equal(pick.venue?.name, 'Cinéma ABC');
    assert.deepEqual(
      pick.horaires.map((s) => s.key),
      ['abc-1320', 'abc-2030'],
    );
    assert.ok(!pick.horaires.some((s) => s.key === 'labege-1800'));
    assert.equal(pick.active?.key, 'abc-1320');
    assert.match(pick.venue?.optionLabel || '', /Cinéma ABC/);
    assert.match(pick.venue?.optionLabel || '', /km/);
  });

  it('defaults to closest-to-Toulouse when GPS is off', () => {
    assert.deepEqual(seanceDistanceOrigin(null), TOULOUSE_ORIGIN);
    const pick = pickCineSeance([labege, abc], {});
    assert.equal(pick.venue?.id, 'L127');
    assert.equal(pick.active?.key, 'abc-1320');
  });

  it('lets the user pick a farther cinema and then only its times', () => {
    const pick = pickCineSeance([labege, abc, abcEvening], {
      origin: CAPITOLE,
      venueId: 'L140',
    });
    assert.equal(pick.venue?.id, 'L140');
    assert.deepEqual(
      pick.horaires.map((s) => s.key),
      ['labege-1800'],
    );
    assert.equal(pick.active?.key, 'labege-1800');
  });

  it('near Labège GPS defaults to Pathé Labège', () => {
    const pick = pickCineSeance([abc, labege], { origin: LABEGE_GPS });
    assert.equal(pick.venue?.id, 'L140');
    assert.equal(pick.active?.key, 'labege-1800');
  });

  it('keeps a picked horaire when it belongs to the selected cinema', () => {
    const pick = pickCineSeance([abc, abcEvening, labege], {
      origin: CAPITOLE,
      seanceKey: 'abc-2030',
    });
    assert.equal(pick.venue?.id, 'L127');
    assert.equal(pick.active?.key, 'abc-2030');
  });

  it('falls back to the first horaire of a cinema when the key is from another salle', () => {
    const pick = pickCineSeance([abc, abcEvening, labege], {
      origin: CAPITOLE,
      venueId: 'L127',
      seanceKey: 'labege-1800',
    });
    assert.equal(pick.venue?.id, 'L127');
    assert.equal(pick.active?.key, 'abc-1320');
  });

  it('carousel distance is the default cinema only', () => {
    const km = defaultCineDistanceKm([labege, abc], CAPITOLE);
    assert.equal(km, pickCineSeance([labege, abc], { origin: CAPITOLE }).venue?.distanceKm);
    assert.ok(km);
    const farOnly = defaultCineDistanceKm([labege], CAPITOLE);
    assert.notEqual(km, farOnly);
  });
});

describe('catalogue extras — never invent', () => {
  it('omits price when the catalogue field is empty', () => {
    assert.equal(cataloguePriceLabel(abc), null);
    assert.ok(!cineHoraireLabel(abc).includes('Tarif'));
  });

  it('shows prix_item / gratuit when present', () => {
    const paid = item({ key: 'p1', prixItem: '7,50 €' });
    const free = item({ key: 'p2', gratuit: 'oui' });
    assert.equal(cataloguePriceLabel(paid), '7,50 €');
    assert.equal(cataloguePriceLabel(free), 'Gratuit');
    assert.match(cineHoraireLabel(paid), /7,50 €/);
  });

  it('VF/VOST only from langue — empty or unknown stays hidden', () => {
    assert.equal(seanceVersionLabel(''), null);
    assert.equal(seanceVersionLabel('en'), null);
    assert.equal(seanceVersionLabel('VOSTFR'), 'VOST');
    assert.equal(seanceVersionLabel('vostfr-sme'), 'VOST');
    assert.equal(seanceVersionLabel('VF'), 'VF');
    assert.equal(seanceVersionLabel('vf & vostfr'), 'VF/VOST');
    const labeled = item({ key: 'vo', langue: 'VOSTFR' });
    assert.match(cineHoraireLabel(labeled), /VOST/);
    assert.ok(!cineHoraireLabel(abc).includes('VF'));
    assert.ok(!cineHoraireLabel(abc).includes('VOST'));
  });

  it('horaire label is date + time of that cinema — not cinema name', () => {
    const label = cineHoraireLabel(abc);
    assert.equal(label, '02/09 · 13:20');
    assert.ok(!label.includes('ABC'));
  });
});
