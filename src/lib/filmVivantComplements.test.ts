import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import {
  CINE_LIVING_RADIUS_KM,
  livingSuggestionForm,
  pickFilmVivantComplements,
  sameEveningStartOk,
  vivantComplementLead,
} from './filmVivantComplements';

/** Cinéma ABC / Capitole area */
const CINEMA = { lat: '43.6045', lng: '1.4472' };
/** ~0.6 km east — inside the 1.2 km disk */
const NEAR = { lat: '43.6045', lng: '1.4545' };
/** ~8 km — Pathé Labège */
const FAR = { lat: '43.5486', lng: '1.5069' };
/** On user→cinema corridor, outside the 1.2 km disk */
const CORRIDOR = { lat: '43.6045', lng: '1.4300' };
const USER_GPS = { lat: 43.6045, lng: 1.4100 };

function lieu(opts: {
  commune?: string;
  id?: string;
  lat?: string;
  lng?: string;
  nom?: string;
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

function ev(
  p: Partial<Evenement> & Pick<Evenement, 'event_id' | 'categorie' | 'titre'>,
): Evenement {
  return {
    lieu_id: 'L1',
    date_debut: '2026-09-02',
    date_fin: '2026-09-02',
    heure_debut: '20:00',
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

function prog(
  p: Partial<ProgrammeItem> &
    Pick<ProgrammeItem, 'programme_id' | 'event_id' | 'nom_item'>,
): ProgrammeItem {
  return {
    lieu_id: 'L1',
    type_item: '',
    date: '2026-09-02',
    heure_debut: '20:00',
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

function item(opts: {
  key: string;
  cat: string;
  day?: string;
  heure?: string;
  heureFin?: string;
  duree?: string;
  eventId?: string;
  filmId?: string;
  titre?: string;
  commune?: string;
  lat?: string;
  lng?: string;
  lieuId?: string;
}): DayItem {
  const eventId = opts.eventId ?? opts.key;
  const coords = {
    lat: opts.lat,
    lng: opts.lng,
  };
  const evenement = ev({
    event_id: eventId,
    categorie: opts.cat,
    titre: opts.titre ?? opts.key,
    heure_debut: opts.heure ?? '20:00',
    heure_fin: opts.heureFin ?? '',
    duree_min: opts.duree,
    date_debut: opts.day ?? '2026-09-02',
    date_fin: opts.day ?? '2026-09-02',
    lieu_id: opts.lieuId ?? 'L1',
  });
  const programme = prog({
    programme_id: `p-${opts.key}`,
    event_id: eventId,
    nom_item: opts.titre ?? opts.key,
    date: opts.day ?? '2026-09-02',
    heure_debut: opts.heure ?? '20:00',
    heure_fin: opts.heureFin ?? '',
    duree_min: opts.duree,
    film_id: opts.filmId,
    lieu_id: opts.lieuId ?? 'L1',
  });
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: opts.day ?? '2026-09-02',
    programme,
    evenement,
    lieu: lieu({
      commune: opts.commune ?? 'Toulouse',
      id: opts.lieuId ?? 'L1',
      lat: coords.lat,
      lng: coords.lng,
    }),
  };
}

const film = item({
  key: 'film',
  cat: 'cinema',
  filmId: 'F1',
  day: '2026-09-04',
  heure: '20:00',
  duree: '120',
  titre: 'Le film',
  ...CINEMA,
  lieuId: 'L-cine',
});

describe('pickFilmVivantComplements', () => {
  it('keeps only the same civil day — never J+1 or another evening', () => {
    const after = item({
      key: 'th-after',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:30',
      ...NEAR,
    });
    const nextNight = item({
      key: 'th-j1',
      cat: 'theatre',
      day: '2026-09-05',
      heure: '00:30',
      ...NEAR,
    });
    const saturday = item({
      key: 'th-sat',
      cat: 'theatre',
      day: '2026-09-05',
      heure: '20:00',
      ...NEAR,
    });
    const picked = pickFilmVivantComplements(
      [after, nextNight, saturday, film],
      film,
    );
    assert.deepEqual(
      picked.map((p) => p.key),
      ['th-after'],
    );
    assert.ok(picked.every((p) => p.dayIso === '2026-09-04'));
    assert.equal(sameEveningStartOk(film, nextNight), false);
  });

  it('allows start before or after the séance clock that same day', () => {
    const before = item({
      key: 'th-before',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '18:00',
      heureFin: '19:30',
      ...NEAR,
    });
    const after = item({
      key: 'mu-after',
      cat: 'musique',
      day: '2026-09-04',
      heure: '22:45',
      ...NEAR,
    });
    const sameClock = item({
      key: 'th-same',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '20:00',
      ...NEAR,
    });
    const picked = pickFilmVivantComplements(
      [before, after, sameClock, film],
      film,
    );
    assert.deepEqual(
      picked.map((p) => p.key).sort(),
      ['mu-after', 'th-before'],
    );
    assert.equal(vivantComplementLead(film, before), 'Avant la séance');
    assert.equal(vivantComplementLead(film, after), 'Après la séance');
  });

  it('excludes venues outside the 1.2 km walking disk', () => {
    const nearShow = item({
      key: 'th-near',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '18:00',
      ...NEAR,
    });
    const farShow = item({
      key: 'th-far',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '18:15',
      ...FAR,
    });
    const picked = pickFilmVivantComplements([nearShow, farShow, film], film);
    assert.deepEqual(
      picked.map((p) => p.key),
      ['th-near'],
    );
    assert.equal(CINE_LIVING_RADIUS_KM, 1.2);
  });

  it('never returns films — theatre / music / festival / expo only', () => {
    const otherFilm = item({
      key: 'other-cine',
      cat: 'cinema',
      filmId: 'F9',
      day: '2026-09-04',
      heure: '18:00',
      ...NEAR,
    });
    const expo = item({
      key: 'expo',
      cat: 'exposition',
      day: '2026-09-04',
      heure: '10:00',
      ...NEAR,
    });
    const fest = item({
      key: 'fest',
      cat: 'festival',
      day: '2026-09-04',
      heure: '19:00',
      ...NEAR,
    });
    const picked = pickFilmVivantComplements(
      [otherFilm, expo, fest, film],
      film,
    );
    assert.ok(picked.every((p) => livingSuggestionForm(p)));
    assert.ok(picked.every((p) => p.kind !== 'programme' || !p.programme.film_id));
    assert.ok(!picked.some((p) => p.key === 'other-cine' || p.key === film.key));
    assert.ok(picked.some((p) => p.key === 'expo'));
    assert.ok(picked.some((p) => p.key === 'fest'));
  });

  it('recalculates when cinéma or horaire of the active séance changes', () => {
    const otherCinema = item({
      key: 'film-lab',
      cat: 'cinema',
      filmId: 'F1',
      day: '2026-09-04',
      heure: '20:00',
      ...FAR,
      lieuId: 'L-lab',
    });
    const nearTheatre = item({
      key: 'th-wilson',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '18:00',
      ...NEAR,
    });
    const farMusic = item({
      key: 'mu-lab',
      cat: 'musique',
      day: '2026-09-04',
      heure: '22:00',
      ...FAR,
      lieuId: 'L-lab-live',
    });
    const pool = [nearTheatre, farMusic, film, otherCinema];
    const atWilson = pickFilmVivantComplements(pool, film);
    const atLab = pickFilmVivantComplements(pool, otherCinema);
    assert.deepEqual(
      atWilson.map((p) => p.key),
      ['th-wilson'],
    );
    assert.deepEqual(
      atLab.map((p) => p.key),
      ['mu-lab'],
    );

    const earlier = item({
      key: 'film-18h',
      cat: 'cinema',
      filmId: 'F1',
      day: '2026-09-04',
      heure: '18:00',
      ...CINEMA,
      lieuId: 'L-cine',
    });
    const at18 = pickFilmVivantComplements(pool, earlier);
    assert.ok(!at18.some((p) => p.key === 'th-wilson'));
  });

  it('hides the block when no candidate survives the filters', () => {
    const farOnly = item({
      key: 'th-far',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:00',
      ...FAR,
    });
    const otherDay = item({
      key: 'th-sat',
      cat: 'theatre',
      day: '2026-09-05',
      heure: '20:00',
      ...NEAR,
    });
    const noCoords = item({
      key: 'th-nogeo',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:00',
    });
    assert.deepEqual(
      pickFilmVivantComplements([farOnly, otherDay, noCoords, film], film),
      [],
    );
  });

  it('with GPS, bonuses a corridor venue outside the cinema disk', () => {
    const onPath = item({
      key: 'th-corridor',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '18:30',
      lat: CORRIDOR.lat,
      lng: CORRIDOR.lng,
    });
    const disk = item({
      key: 'th-disk',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:00',
      ...NEAR,
    });
    const withoutGps = pickFilmVivantComplements([onPath, disk, film], film);
    assert.deepEqual(
      withoutGps.map((p) => p.key),
      ['th-disk'],
    );
    const withGps = pickFilmVivantComplements([onPath, disk, film], film, {
      userGps: USER_GPS,
    });
    assert.ok(withGps.some((p) => p.key === 'th-corridor'));
    assert.equal(withGps[0]?.key, 'th-corridor');
  });

  it('caps at 3 and tie-breaks closer to cinema then closer in time', () => {
    const closer = item({
      key: 'th-close',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '23:00',
      lat: '43.6045',
      lng: '1.4485',
    });
    const mid = item({
      key: 'mu-mid',
      cat: 'musique',
      day: '2026-09-04',
      heure: '18:00',
      ...NEAR,
    });
    const farther = item({
      key: 'ex-farther',
      cat: 'exposition',
      day: '2026-09-04',
      heure: '16:00',
      lat: '43.6045',
      lng: '1.4580',
    });
    const extra = item({
      key: 'fest-4',
      cat: 'festival',
      day: '2026-09-04',
      heure: '19:00',
      lat: '43.6045',
      lng: '1.4600',
    });
    const picked = pickFilmVivantComplements(
      [extra, farther, mid, closer, film],
      film,
    );
    assert.equal(picked.length, 3);
    assert.equal(picked[0]?.key, 'th-close');
    assert.ok(!picked.some((p) => p.key === 'fest-4'));
  });
});
