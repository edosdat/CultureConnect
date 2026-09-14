import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { TOULOUSE_ORIGIN } from './geo';
import { filmVersionLabel, knownPrixLabel } from './labels';
import {
  cinemaKeyOf,
  cinemaOptionLabel,
  cineDistanceOrigin,
  cinePickerSelectState,
  defaultCineSeance,
  groupCinemasForFilm,
  horaireOptionLabel,
  nextPickedSeanceKey,
  resolveActiveCineSeance,
  resolveSharedSeanceKey,
  seancesIncludingShared,
  filmVersionLabels,
  seanceHeureLabel,
  seanceMetaLabel,
  seanceVersionLabel,
  seancesAtCinema,
} from './cineSeances';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

function lieu(opts: {
  id: string;
  nom: string;
  lat?: string;
  lng?: string;
  commune?: string;
}): Lieu {
  return {
    lieu_id: opts.id,
    nom: opts.nom,
    type: 'cinema',
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
  commune?: string;
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
      commune: opts.commune,
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
    assert.equal(horaireOptionLabel(ABC_SOON), '02/09 · 13:20 VF');
    assert.equal(horaireOptionLabel(ABC), '03/09 · 20:30 VOSTFR');
    assert.equal(horaireOptionLabel(LABEGE), '02/09 · 10:00 VO');
    assert.equal(seanceHeureLabel(ABC_SOON), '13:20 VF');
    assert.equal(seanceHeureLabel(ABC), '20:30 VOSTFR');
    const vost = item({
      key: 'vost-line',
      lieuId: 'L127',
      nom: 'Cinéma ABC',
      day: '2026-09-02',
      heure: '21:15',
      langue: 'VOST',
    });
    assert.equal(seanceHeureLabel(vost), '21:15 VOST');
    assert.equal(horaireOptionLabel(vost), '02/09 · 21:15 VOST');
    const withFin = {
      ...ABC_SOON,
      programme: { ...ABC_SOON.programme, heure_fin: '15:10' },
    };
    assert.equal(horaireOptionLabel(withFin), '02/09 · 13:20–15:10 VF');
    const withDuree = {
      ...ABC_SOON,
      programme: { ...ABC_SOON.programme, duree_min: '110' },
    };
    assert.equal(horaireOptionLabel(withDuree), '02/09 · 13:20 VF');
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
    assert.equal(horaireOptionLabel(bare), '02/09 · 18:00');
    assert.equal(seanceHeureLabel(bare), '18:00');
    assert.equal(knownPrixLabel('', { prix: '', gratuit: 'non' }), null);
    assert.equal(knownPrixLabel('', { prix: '', gratuit: '' }), null);
    assert.equal(filmVersionLabel(''), null);
    assert.equal(filmVersionLabel('fr'), null);
    assert.equal(filmVersionLabel('VOSTFR'), 'VOSTFR');
    assert.equal(filmVersionLabel(undefined, 'VF'), 'VF');
    assert.deepEqual(filmVersionLabels([ABC_SOON, ABC, LABEGE]), [
      'VF',
      'VOSTFR',
      'VO',
    ]);
    assert.deepEqual(filmVersionLabels([ABC, ABC]), ['VOSTFR']);
    assert.deepEqual(filmVersionLabels([bare]), []);
    assert.equal(seanceVersionLabel(ABC_SOON), 'VF');
    assert.equal(seanceVersionLabel(bare), null);
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

  it('resolveSharedSeanceKey picks the horaire DayItem.key when present', () => {
    assert.equal(
      resolveSharedSeanceKey([{ key: 'p:P1' }, { key: 'p:P2' }], 'p:P2'),
      'p:P2',
    );
    assert.equal(resolveSharedSeanceKey([{ key: 'p:P1' }], 'p:NOPE'), null);
  });

  it('nextPickedSeanceKey keeps the user horaire and applies a shared token séance', () => {
    const list = [{ key: 'p:P1030' }, { key: 'p:P1345' }];
    assert.equal(nextPickedSeanceKey(list, 'p:P1345', null), 'p:P1345');
    assert.equal(nextPickedSeanceKey(list, 'p:P1030', 'p:P1345'), 'p:P1345');
    assert.equal(nextPickedSeanceKey([{ key: 'p:P1030' }], 'p:P1345', null), null);
    assert.equal(
      nextPickedSeanceKey(list, null, 'p:P1345'),
      'p:P1345',
    );
  });

  it('token seanceKey for a non-default venue+time drives both selects after hydrate', () => {
    const wilson1030 = item({
      key: 'p:P-WILSON-1030',
      lieuId: 'L-WILSON',
      nom: 'Pathé Wilson',
      day: '2026-09-14',
      heure: '10:30',
      lat: '43.6044',
      lng: '1.4470',
      commune: 'Toulouse',
    });
    const wilson1345 = item({
      key: 'p:P-WILSON-1345',
      lieuId: 'L-WILSON',
      nom: 'Pathé Wilson',
      day: '2026-09-14',
      heure: '13:45',
      lat: '43.6044',
      lng: '1.4470',
      commune: 'Toulouse',
    });
    const blagnac1045 = item({
      key: 'p:P-BLAGNAC-1045',
      lieuId: 'L-BLAGNAC',
      nom: 'Pathé Blagnac',
      day: '2026-09-14',
      heure: '10:45',
      lat: '43.6350',
      lng: '1.3750',
      commune: 'Blagnac',
    });
    const design1345 = item({
      key: 'p:P-DESIGN-1345',
      lieuId: 'L-DESIGN',
      nom: 'Pathé Design',
      day: '2026-09-14',
      heure: '13:45',
      lat: '43.6008',
      lng: '1.4540',
      commune: 'Toulouse',
    });

    const defaultPick = defaultCineSeance(
      [wilson1030, wilson1345, blagnac1045, design1345],
      null,
    );
    assert.equal(defaultPick?.key, wilson1030.key);

    // Race: visit returns seanceKey before relatedItems hydrate — only the opened card.
    const beforeHydrate = [wilson1030];
    const pending = resolveActiveCineSeance(
      beforeHydrate,
      null,
      blagnac1045.key,
      null,
    );
    assert.equal(pending?.key, wilson1030.key);

    // After relatedItems arrive, apply token to cinema + horaire (not default 10:30).
    const hydrated = [wilson1030, wilson1345, blagnac1045, design1345];
    const blagnacActive = resolveActiveCineSeance(
      hydrated,
      null,
      blagnac1045.key,
      null,
    );
    assert.equal(blagnacActive?.key, blagnac1045.key);
    const blagnacSelects = cinePickerSelectState(
      hydrated,
      blagnacActive!,
      null,
    );
    assert.equal(blagnacSelects.cinemaValue, cinemaKeyOf(blagnac1045));
    assert.equal(blagnacSelects.timeValue, blagnac1045.key);
    assert.notEqual(blagnacSelects.cinemaValue, cinemaKeyOf(wilson1030));
    assert.notEqual(blagnacSelects.timeValue, wilson1030.key);

    const designActive = resolveActiveCineSeance(
      hydrated,
      null,
      design1345.key,
      null,
    );
    const designSelects = cinePickerSelectState(hydrated, designActive!, null);
    assert.equal(designSelects.cinemaValue, cinemaKeyOf(design1345));
    assert.equal(designSelects.timeValue, design1345.key);

    const sameCinema = resolveActiveCineSeance(
      hydrated,
      null,
      wilson1345.key,
      null,
    );
    const sameCinemaSelects = cinePickerSelectState(
      hydrated,
      sameCinema!,
      null,
    );
    assert.equal(sameCinemaSelects.cinemaValue, cinemaKeyOf(wilson1030));
    assert.equal(sameCinemaSelects.timeValue, wilson1345.key);

    // Commune filter dropped Blagnac — re-inject from the unfiltered pool.
    const toulouseOnly = [wilson1030, wilson1345, design1345];
    const withShared = seancesIncludingShared(
      toulouseOnly,
      hydrated,
      blagnac1045.key,
    );
    assert.ok(withShared.some((s) => s.key === blagnac1045.key));
    const restored = resolveActiveCineSeance(
      withShared,
      null,
      blagnac1045.key,
      null,
    );
    const restoredSelects = cinePickerSelectState(withShared, restored!, null);
    assert.equal(restoredSelects.cinemaValue, cinemaKeyOf(blagnac1045));
    assert.equal(restoredSelects.timeValue, blagnac1045.key);

    // User override wins after the token applied; film/item key is not a seanceKey.
    const filmItemKey = wilson1030.key;
    const userPicked = resolveActiveCineSeance(
      hydrated,
      wilson1345.key,
      blagnac1045.key,
      null,
    );
    assert.equal(userPicked?.key, wilson1345.key);
    const noToken = resolveActiveCineSeance(hydrated, null, null, null);
    assert.equal(noToken?.key, defaultPick?.key);
    assert.notEqual(filmItemKey, blagnac1045.key);
    assert.equal(
      resolveSharedSeanceKey(hydrated, filmItemKey),
      wilson1030.key,
    );
  });
});
