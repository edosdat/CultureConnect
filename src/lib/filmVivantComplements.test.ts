import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import {
  CINE_LIVING_RADIUS_KM,
  isKidsCinemaSeance,
  livingSuggestionDateLabel,
  livingSuggestionForm,
  otherDayStartOk,
  pickFilmVivantComplements,
  sameEveningStartOk,
  seanceAllowsEnfantsSuggestions,
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
  genre?: string;
  genresMood?: string;
  publicCible?: string;
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
    genre: opts.genre ?? '',
    genres_mood: opts.genresMood,
    public_cible: opts.publicCible,
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
    genre: opts.genre ?? '',
    genres_mood: opts.genresMood,
    public_cible: opts.publicCible,
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
  it('same evening: only starts after the screening end, labelled ce soir', () => {
    const before = item({
      key: 'th-before',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '18:00',
      heureFin: '19:30',
      ...NEAR,
    });
    const during = item({
      key: 'th-during',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '21:00',
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
      [before, during, after, sameClock, film],
      film,
    );
    assert.deepEqual(
      picked.map((p) => p.key),
      ['mu-after'],
    );
    assert.equal(sameEveningStartOk(film, after), true);
    assert.equal(sameEveningStartOk(film, before), false);
    assert.equal(sameEveningStartOk(film, during), false);
    assert.equal(sameEveningStartOk(film, sameClock), false);
    assert.equal(vivantComplementLead(film, after), 'ce soir');
    assert.equal(vivantComplementLead(film, before), 'ce soir');
  });

  it('other calendar day: date chip, never ce soir, start that day', () => {
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
      ['th-after', 'th-j1', 'th-sat'],
    );
    assert.equal(sameEveningStartOk(film, nextNight), false);
    assert.equal(otherDayStartOk(film, nextNight), true);
    assert.equal(vivantComplementLead(film, after), 'ce soir');
    assert.equal(vivantComplementLead(film, nextNight), 'sam. 5 sept.');
    assert.equal(vivantComplementLead(film, saturday), 'sam. 5 sept.');
    assert.equal(livingSuggestionDateLabel('2026-09-09'), 'mer. 9 sept.');
    assert.ok(!picked.some((p) => vivantComplementLead(film, p) === 'ce soir' && p.dayIso !== '2026-09-04'));
  });

  it('excludes venues outside the 1.2 km walking disk', () => {
    const nearShow = item({
      key: 'th-near',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:15',
      ...NEAR,
    });
    const farShow = item({
      key: 'th-far',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:30',
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
      heure: '22:00',
      ...NEAR,
    });
    const fest = item({
      key: 'fest',
      cat: 'festival',
      day: '2026-09-04',
      heure: '22:00',
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
      heure: '22:15',
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
    assert.ok(at18.some((p) => p.key === 'th-wilson'));
    const later = item({
      key: 'film-22h',
      cat: 'cinema',
      filmId: 'F1',
      day: '2026-09-04',
      heure: '22:00',
      ...CINEMA,
      lieuId: 'L-cine',
    });
    const at22 = pickFilmVivantComplements(pool, later);
    assert.ok(!at22.some((p) => p.key === 'th-wilson'));
  });

  it('hides the block when no candidate survives the filters', () => {
    const farOnly = item({
      key: 'th-far',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:00',
      ...FAR,
    });
    const otherDayFar = item({
      key: 'th-sat',
      cat: 'theatre',
      day: '2026-09-05',
      heure: '20:00',
      ...FAR,
    });
    const noCoords = item({
      key: 'th-nogeo',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:00',
    });
    const untimed = item({
      key: 'th-notime',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '',
      ...NEAR,
    });
    assert.deepEqual(
      pickFilmVivantComplements(
        [farOnly, otherDayFar, noCoords, untimed, film],
        film,
      ),
      [],
    );
  });

  it('with GPS, bonuses a corridor venue outside the cinema disk', () => {
    const onPath = item({
      key: 'th-corridor',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:30',
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
      heure: '22:20',
      ...NEAR,
    });
    const farther = item({
      key: 'ex-farther',
      cat: 'exposition',
      day: '2026-09-04',
      heure: '22:15',
      lat: '43.6045',
      lng: '1.4580',
    });
    const extra = item({
      key: 'fest-4',
      cat: 'festival',
      day: '2026-09-04',
      heure: '22:10',
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

  it('Odyssée 19:00+173: 20:00 rejected; after ~21:53 accepted; other day unchanged', () => {
    const seance19 = item({
      key: 'odyssee-19h',
      cat: 'cinema',
      filmId: 'F1',
      day: '2026-09-07',
      heure: '19:00',
      duree: '173',
      ...CINEMA,
      lieuId: 'L-cine',
    });
    const during = item({
      key: 'mu-20h',
      cat: 'musique',
      day: '2026-09-07',
      heure: '20:00',
      ...NEAR,
    });
    const afterEnd = item({
      key: 'th-after-end',
      cat: 'theatre',
      day: '2026-09-07',
      heure: '21:53',
      ...NEAR,
    });
    const tomorrow = item({
      key: 'th-mardi',
      cat: 'theatre',
      day: '2026-09-08',
      heure: '20:00',
      ...NEAR,
    });
    const picked = pickFilmVivantComplements(
      [during, afterEnd, tomorrow, seance19],
      seance19,
    );
    assert.deepEqual(
      picked.map((p) => p.key),
      ['th-after-end', 'th-mardi'],
    );
    assert.equal(sameEveningStartOk(seance19, during), false);
    assert.equal(sameEveningStartOk(seance19, afterEnd), true);
    assert.equal(otherDayStartOk(seance19, tomorrow), true);
    assert.equal(vivantComplementLead(seance19, afterEnd), 'ce soir');
    assert.equal(vivantComplementLead(seance19, tomorrow), 'mar. 8 sept.');
    assert.ok(!/ce soir/i.test(vivantComplementLead(seance19, tomorrow)));
    assert.ok(!/\d{2}\/\d{2}/.test(vivantComplementLead(seance19, tomorrow)));
  });

  it('Odyssée 19h: official heure_fin and 120-min fallback, never invent beyond', () => {
    const withFin = item({
      key: 'odyssee-fin',
      cat: 'cinema',
      filmId: 'F1',
      day: '2026-09-07',
      heure: '19:00',
      heureFin: '21:53',
      ...CINEMA,
      lieuId: 'L-cine',
    });
    const fallback = item({
      key: 'odyssee-fb',
      cat: 'cinema',
      filmId: 'F1',
      day: '2026-09-07',
      heure: '19:00',
      ...CINEMA,
      lieuId: 'L-cine',
    });
    const at20 = item({
      key: 'mu-20h',
      cat: 'musique',
      day: '2026-09-07',
      heure: '20:00',
      ...NEAR,
    });
    const at2153 = item({
      key: 'th-2153',
      cat: 'theatre',
      day: '2026-09-07',
      heure: '21:53',
      ...NEAR,
    });
    const at21 = item({
      key: 'th-21h',
      cat: 'theatre',
      day: '2026-09-07',
      heure: '21:00',
      ...NEAR,
    });
    assert.equal(sameEveningStartOk(withFin, at20), false);
    assert.equal(sameEveningStartOk(withFin, at2153), true);
    assert.equal(sameEveningStartOk(fallback, at20), false);
    assert.equal(sameEveningStartOk(fallback, at21), true);
    assert.equal(sameEveningStartOk(fallback, at2153), true);
  });

  it('soir adult Odyssée: 0 enfants cards; vernissage / théâtre / concert after end OK', () => {
    const seance19 = item({
      key: 'odyssee-19h',
      cat: 'cinema',
      filmId: 'F1',
      day: '2026-09-07',
      heure: '19:00',
      duree: '173',
      ...CINEMA,
      lieuId: 'L-cine',
    });
    const kids = item({
      key: 'enf',
      cat: 'enfants_famille',
      day: '2026-09-07',
      heure: '22:00',
      ...NEAR,
    });
    const atelier = item({
      key: 'atelier',
      cat: 'atelier',
      day: '2026-09-07',
      heure: '22:00',
      ...NEAR,
    });
    const festKids = item({
      key: 'fest-kids',
      cat: 'festival',
      genre: 'enfants_famille',
      day: '2026-09-07',
      heure: '22:00',
      ...NEAR,
    });
    const kidsTomorrow = item({
      key: 'enf-j1',
      cat: 'enfants_famille',
      day: '2026-09-08',
      heure: '20:00',
      ...NEAR,
    });
    const festRue = item({
      key: 'fest-rue',
      cat: 'festival',
      day: '2026-09-07',
      heure: '22:00',
      ...NEAR,
    });
    const vernissage = item({
      key: 'vern',
      cat: 'exposition',
      genre: 'vernissage',
      day: '2026-09-07',
      heure: '22:00',
      ...NEAR,
    });
    const theatre = item({
      key: 'th',
      cat: 'theatre',
      day: '2026-09-07',
      heure: '22:00',
      ...NEAR,
    });
    const concert = item({
      key: 'mu',
      cat: 'musique',
      day: '2026-09-07',
      heure: '22:00',
      ...NEAR,
    });
    assert.equal(isKidsCinemaSeance(seance19), false);
    assert.equal(seanceAllowsEnfantsSuggestions(seance19), false);
    assert.equal(livingSuggestionForm(kids), null);
    assert.equal(livingSuggestionForm(atelier), null);
    assert.equal(livingSuggestionForm(festKids), null);
    assert.equal(livingSuggestionForm(kidsTomorrow), null);
    assert.equal(livingSuggestionForm(festRue), 'festival');
    assert.equal(livingSuggestionForm(vernissage), 'expo');
    assert.equal(livingSuggestionForm(theatre), 'theatre');
    assert.equal(livingSuggestionForm(concert), 'musique');

    const picked = pickFilmVivantComplements(
      [
        kids,
        atelier,
        festKids,
        kidsTomorrow,
        vernissage,
        theatre,
        concert,
        seance19,
      ],
      seance19,
    );
    assert.deepEqual(
      picked.map((p) => p.key).sort(),
      ['mu', 'th', 'vern'],
    );
    assert.ok(
      picked.every(
        (p) =>
          vivantComplementLead(seance19, p) === 'ce soir' ||
          p.dayIso !== '2026-09-07',
      ),
    );
  });

  it('matin kids film: enfants suggestions allowed after screening end', () => {
    const matinKids = item({
      key: 'kayara-matin',
      cat: 'cinema',
      filmId: 'F67',
      day: '2026-09-07',
      heure: '10:30',
      duree: '90',
      genre: 'animation_jeune_public',
      genresMood: 'animation|famille|jeunesse',
      ...CINEMA,
      lieuId: 'L-cine',
    });
    const duringKids = item({
      key: 'enf-during',
      cat: 'enfants_famille',
      day: '2026-09-07',
      heure: '11:00',
      ...NEAR,
    });
    const afterKids = item({
      key: 'enf-aprem',
      cat: 'enfants_famille',
      day: '2026-09-07',
      heure: '14:00',
      ...NEAR,
    });
    const atelier = item({
      key: 'atelier-aprem',
      cat: 'atelier',
      day: '2026-09-07',
      heure: '15:00',
      ...NEAR,
    });
    const theatre = item({
      key: 'th-aprem',
      cat: 'theatre',
      day: '2026-09-07',
      heure: '14:30',
      ...NEAR,
    });
    const concert = item({
      key: 'mu-aprem',
      cat: 'musique',
      day: '2026-09-07',
      heure: '16:00',
      ...NEAR,
    });
    const kidsTomorrow = item({
      key: 'enf-j1',
      cat: 'enfants_famille',
      day: '2026-09-08',
      heure: '10:00',
      ...NEAR,
    });
    assert.equal(isKidsCinemaSeance(matinKids), true);
    assert.equal(seanceAllowsEnfantsSuggestions(matinKids), true);
    assert.equal(sameEveningStartOk(matinKids, duringKids), false);
    assert.equal(sameEveningStartOk(matinKids, afterKids), true);

    const picked = pickFilmVivantComplements(
      [duringKids, afterKids, atelier, theatre, concert, kidsTomorrow, matinKids],
      matinKids,
    );
    assert.ok(!picked.some((p) => p.key === 'enf-during'));
    assert.ok(picked.some((p) => p.key === 'enf-aprem' || p.key === 'atelier-aprem'));
    assert.ok(picked.some((p) => p.key === 'th-aprem' || p.key === 'mu-aprem'));

    const matinAdult = item({
      key: 'docu-matin',
      cat: 'cinema',
      filmId: 'F2',
      day: '2026-09-07',
      heure: '10:30',
      duree: '90',
      genre: 'documentaire',
      ...CINEMA,
      lieuId: 'L-cine',
    });
    assert.equal(isKidsCinemaSeance(matinAdult), false);
    assert.equal(seanceAllowsEnfantsSuggestions(matinAdult), false);
    const adultPicked = pickFilmVivantComplements(
      [afterKids, atelier, theatre, matinAdult],
      matinAdult,
    );
    assert.ok(!adultPicked.some((p) => p.key === 'enf-aprem' || p.key === 'atelier-aprem'));
    assert.ok(adultPicked.some((p) => p.key === 'th-aprem'));
  });
});
