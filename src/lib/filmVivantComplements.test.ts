import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import {
  overlapsScreening,
  pickFilmVivantComplements,
  startsAfterScreening,
  vivantArtsForm,
  vivantComplementLead,
} from './filmVivantComplements';

function lieu(commune = 'Toulouse'): Lieu {
  return {
    lieu_id: 'L1',
    nom: 'Salle',
    type: '',
    adresse: '',
    commune,
    dist_km_capitole: '',
    site_web: '',
    notes: '',
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
  moods?: string;
  themes?: string;
  genre?: string;
  titre?: string;
  commune?: string;
}): DayItem {
  const eventId = opts.eventId ?? opts.key;
  const evenement = ev({
    event_id: eventId,
    categorie: opts.cat,
    titre: opts.titre ?? opts.key,
    genre: opts.genre ?? '',
    moods: opts.moods,
    themes: opts.themes,
    heure_debut: opts.heure ?? '20:00',
    heure_fin: opts.heureFin ?? '',
    duree_min: opts.duree,
    date_debut: opts.day ?? '2026-09-02',
    date_fin: opts.day ?? '2026-09-02',
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
    moods: opts.moods,
    themes: opts.themes,
    film_id: opts.filmId,
  });
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: opts.day ?? '2026-09-02',
    programme,
    evenement,
    lieu: lieu(opts.commune ?? 'Toulouse'),
  };
}

describe('pickFilmVivantComplements', () => {
  const film = item({
    key: 'film',
    cat: 'cinema',
    filmId: 'F1',
    day: '2026-09-04',
    heure: '20:00',
    duree: '120',
    moods: 'rigolo',
    genre: 'fiction',
    themes: 'famille',
    titre: 'Le film',
  });

  it('skips a same-day 20h show that overlaps the screening', () => {
    const compete = item({
      key: 'th-20h',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '20:00',
      moods: 'rigolo',
      genre: 'humour_standup',
      titre: 'Stand-up 20h',
    });
    const after = item({
      key: 'th-after',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:30',
      moods: 'rigolo',
      genre: 'humour_standup',
      titre: 'Après',
    });
    const satTheatre = item({
      key: 'th-sat',
      cat: 'theatre',
      day: '2026-09-05',
      heure: '20:00',
      moods: 'rigolo',
      genre: 'humour_standup',
      titre: 'Samedi théâtre',
    });
    const satMusic = item({
      key: 'mu-sat',
      cat: 'musique',
      day: '2026-09-05',
      heure: '19:00',
      moods: 'festif',
      genre: 'chanson_variete',
      titre: 'Samedi musique',
    });
    const picked = pickFilmVivantComplements(
      [compete, after, satTheatre, satMusic, film],
      film,
    );
    assert.equal(picked[0]?.key, 'th-after');
    assert.ok(picked.every((p) => p.key !== 'th-20h'));
    assert.ok(picked.every((p) => p.evenement?.categorie !== 'cinema'));
    assert.ok(!picked.some((p) => p.key === film.key));
  });

  it('skips the same-day slot when only a competing 20h show exists', () => {
    const compete = item({
      key: 'th-20h',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '20:00',
      moods: 'rigolo',
      genre: 'humour_standup',
    });
    const satTheatre = item({
      key: 'th-sat',
      cat: 'theatre',
      day: '2026-09-05',
      heure: '20:00',
      moods: 'rigolo',
      genre: 'humour_standup',
    });
    const satMusic = item({
      key: 'mu-sat',
      cat: 'musique',
      day: '2026-09-05',
      heure: '21:00',
      moods: 'tendre',
      genre: 'jazz_blues',
    });
    const picked = pickFilmVivantComplements(
      [compete, satTheatre, satMusic, film],
      film,
    );
    assert.ok(picked.every((p) => p.dayIso !== '2026-09-04'));
    assert.deepEqual(
      picked.map((p) => p.key).sort(),
      ['mu-sat', 'th-sat'],
    );
  });

  it('keeps a same-day show that ends before the film starts', () => {
    const before = item({
      key: 'th-before',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '16:00',
      heureFin: '18:00',
      moods: 'rigolo',
      genre: 'humour_standup',
      titre: 'Matinée',
    });
    const satTheatre = item({
      key: 'th-sat',
      cat: 'theatre',
      day: '2026-09-05',
      heure: '20:00',
      moods: 'rigolo',
      genre: 'humour_standup',
    });
    const satMusic = item({
      key: 'mu-sat',
      cat: 'musique',
      day: '2026-09-05',
      heure: '21:00',
      genre: 'jazz_blues',
    });
    const picked = pickFilmVivantComplements(
      [before, satTheatre, satMusic, film],
      film,
    );
    assert.equal(picked[0]?.key, 'th-before');
    assert.equal(vivantComplementLead(film, picked[0]!), 'Avant la séance');
  });

  it('mixes 2 théâtre + 1 musique or 2 musique + 1 théâtre, never films', () => {
    const after = item({
      key: 'th-after',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:30',
      moods: 'rigolo',
      genre: 'humour_standup',
    });
    const extraFilm = item({
      key: 'other-cine',
      cat: 'cinema',
      filmId: 'F9',
      day: '2026-09-05',
      heure: '18:00',
      moods: 'rigolo',
    });
    const t1 = item({
      key: 'th-sat',
      cat: 'theatre',
      day: '2026-09-05',
      heure: '20:00',
      moods: 'rigolo',
      genre: 'humour_standup',
    });
    const t2 = item({
      key: 'th-sun',
      cat: 'theatre',
      day: '2026-09-06',
      heure: '17:00',
      moods: 'rigolo',
      genre: 'theatre_contemporain',
    });
    const m1 = item({
      key: 'mu-sat',
      cat: 'musique',
      day: '2026-09-05',
      heure: '21:00',
      moods: 'festif',
      genre: 'chanson_variete',
    });
    const picked = pickFilmVivantComplements(
      [after, extraFilm, t1, t2, m1, film],
      film,
    );
    assert.ok(picked.length <= 3);
    assert.ok(picked.every((p) => vivantArtsForm(p)));
    assert.ok(picked.every((p) => p.kind !== 'programme' || !p.programme.film_id));
    const forms = picked.map((p) => vivantArtsForm(p));
    const theatre = forms.filter((f) => f === 'theatre').length;
    const musique = forms.filter((f) => f === 'musique').length;
    assert.ok(
      (theatre === 2 && musique === 1) || (theatre === 1 && musique === 2),
    );
  });

  it('keeps Toulouse exact commune and drops Labège', () => {
    const afterTls = item({
      key: 'th-tls',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:30',
      moods: 'rigolo',
      genre: 'humour_standup',
      commune: 'Toulouse',
    });
    const afterLab = item({
      key: 'th-lab',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:45',
      moods: 'rigolo',
      genre: 'humour_standup',
      commune: 'Labège',
    });
    const satLab = item({
      key: 'mu-lab',
      cat: 'musique',
      day: '2026-09-05',
      heure: '20:00',
      genre: 'jazz_blues',
      commune: 'Labège',
    });
    const satTls = item({
      key: 'mu-tls',
      cat: 'musique',
      day: '2026-09-05',
      heure: '20:00',
      genre: 'jazz_blues',
      commune: 'Toulouse',
    });
    const picked = pickFilmVivantComplements(
      [afterTls, afterLab, satLab, satTls, film],
      film,
      { commune: 'Toulouse' },
    );
    assert.ok(picked.every((p) => p.lieu?.commune === 'Toulouse'));
    assert.ok(picked.every((p) => p.key !== 'th-lab' && p.key !== 'mu-lab'));
  });

  it('writes complement copy, never a substitute for the film', () => {
    const after = item({
      key: 'th-after',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '22:30',
      moods: 'rigolo',
      genre: 'humour_standup',
      titre: 'Le Misanthrope',
    });
    const sat = item({
      key: 'mu-sat',
      cat: 'musique',
      day: '2026-09-05',
      heure: '20:00',
      genre: 'jazz_blues',
      titre: 'Jazz cave',
    });
    const picked = pickFilmVivantComplements([after, sat, film], film);
    const leads = picked.map((p) => vivantComplementLead(film, p));
    assert.ok(leads.includes('Après la séance'));
    assert.ok(leads.some((l) => l === 'samedi à Toulouse'));
    for (const lead of leads) {
      assert.ok(!/plutôt/i.test(lead));
      assert.ok(!/plutot/i.test(lead));
    }
  });

  it('treats a 20h15 neighbour as overlap', () => {
    const near = item({
      key: 'near',
      cat: 'theatre',
      day: '2026-09-04',
      heure: '20:15',
      moods: 'rigolo',
      genre: 'humour_standup',
    });
    assert.equal(overlapsScreening(film, near), true);
    assert.equal(startsAfterScreening(film, near), false);
  });
});
