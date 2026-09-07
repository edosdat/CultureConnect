import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Artiste, DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import {
  artistPressCitation,
  cataloguePressRating,
  fichePressCitation,
  pickPressCatalogueFields,
  pressCitationOf,
  pressItemForFiche,
  withConcertArtistPress,
} from './pressCitation';
import { detailDayItem } from './slim';

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

function ev(
  p: Partial<Evenement> & Pick<Evenement, 'event_id' | 'categorie' | 'titre'>,
): Evenement {
  return {
    lieu_id: 'L1',
    date_debut: '2026-09-12',
    date_fin: '2026-09-12',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: 'Pitch',
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
    date: '2026-09-12',
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
  filmId?: string;
  form?: string;
  genre?: string;
  evenement?: Partial<Evenement>;
  programme?: Partial<ProgrammeItem>;
}): DayItem {
  const eventId = opts.key;
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: '2026-09-12',
    programme: prog({
      programme_id: `p-${opts.key}`,
      event_id: eventId,
      nom_item: opts.key,
      form: opts.form,
      genre: opts.genre ?? '',
      film_id: opts.filmId,
      ...opts.programme,
    }),
    evenement: ev({
      event_id: eventId,
      categorie: opts.cat,
      titre: opts.key,
      form: opts.form,
      genre: opts.genre ?? '',
      ...opts.evenement,
    }),
    lieu: lieu(),
  };
}

const PRESS = {
  citation: 'Une pièce d’une rare intensité.',
  source: 'Télérama',
  source_url: 'https://www.telerama.fr/scenes/exemple',
  note_presse: 'TTTT',
};

describe('cataloguePressRating', () => {
  it('keeps Télérama T→TTTT from catalogue, never invents from scores', () => {
    assert.equal(cataloguePressRating('TTTT'), 'TTTT');
    assert.equal(cataloguePressRating('tt'), 'TT');
    assert.equal(cataloguePressRating('T T T'), 'TTT');
    assert.equal(cataloguePressRating('4/5'), '');
    assert.equal(cataloguePressRating('★★★★'), '');
    assert.equal(cataloguePressRating(''), '');
  });
});

describe('pressCitationOf', () => {
  it('hides when citation is empty', () => {
    const row = item({ key: 'th-empty', cat: 'theatre_danse' });
    assert.equal(pressCitationOf(row), null);
    assert.equal(fichePressCitation(row), null);
  });

  it('reads official citation|source|source_url|note_presse', () => {
    const row = item({
      key: 'th-telerama',
      cat: 'theatre_danse',
      evenement: PRESS,
    });
    assert.deepEqual(pressCitationOf(row), {
      quote: '« Une pièce d’une rare intensité. »',
      source: 'Télérama',
      url: 'https://www.telerama.fr/scenes/exemple',
      rating: 'TTTT',
    });
  });

  it('uses score_presse as badge only when it is already T–TTTT', () => {
    const ok = item({
      key: 'th-score-ok',
      cat: 'theatre_danse',
      evenement: {
        citation: 'Vif.',
        source: 'Télérama',
        source_url: 'https://www.telerama.fr/v',
        score_presse: 'TTT',
      },
    });
    const no = item({
      key: 'th-score-no',
      cat: 'theatre_danse',
      evenement: {
        citation: 'Vif.',
        source: 'Télérama',
        source_url: 'https://www.telerama.fr/v2',
        score_presse: '4/5',
      },
    });
    assert.equal(pressCitationOf(ok)?.rating, 'TTT');
    assert.equal(pressCitationOf(no)?.rating, '');
  });

  it('wraps French guillemets and clips to two sentences', () => {
    const row = item({
      key: 'th-long',
      cat: 'theatre_danse',
      evenement: {
        citation:
          'Premier souffle. Deuxième souffle. Troisième souffle qu’on ne doit pas voir.',
        source: 'Sceneweb',
        source_url: 'https://sceneweb.fr/article',
      },
    });
    const c = pressCitationOf(row);
    assert.ok(c);
    assert.equal(c!.quote, '« Premier souffle. Deuxième souffle. »');
    assert.ok(!c!.quote.includes('Troisième'));
  });

  it('drops http / invalid urls and does not invent a rating', () => {
    const row = item({
      key: 'th-http',
      cat: 'theatre_danse',
      evenement: {
        citation: 'Vif et juste.',
        source: 'La Dépêche',
        source_url: 'http://ladepeche.fr/interdit',
        note_presse: '4',
      },
    });
    assert.deepEqual(pressCitationOf(row), {
      quote: '« Vif et juste. »',
      source: 'La Dépêche',
      url: '',
      rating: '',
    });
  });

  it('prefers Télérama over Sceneweb / regional when several exist', () => {
    const row = item({
      key: 'th-multi',
      cat: 'theatre_danse',
      evenement: {
        citation: 'Court régional.',
        source: 'La Dépêche',
        source_url: 'https://www.ladepeche.fr/a',
        citation_2: 'Un peu plus long côté Sceneweb.',
        source_2: 'Sceneweb',
        source_url_2: 'https://www.sceneweb.fr/b',
        citation_3: 'Regard Télérama.',
        source_3: 'Télérama',
        source_url_3: 'https://www.telerama.fr/c',
      },
    });
    const c = pressCitationOf(row);
    assert.ok(c);
    assert.equal(c!.source, 'Télérama');
    assert.equal(c!.quote, '« Regard Télérama. »');
  });

  it('never treats scrape notes or source_extrait as a press citation', () => {
    const row = item({
      key: 'th-notes',
      cat: 'theatre_danse',
      evenement: {
        source_extrait: '« Faux extrait scrape » (Télérama)',
      },
      programme: {
        notes: 'Scrape https://sceneweb.fr/debug',
      },
    });
    assert.equal(pressCitationOf(row), null);
  });
});

describe('fichePressCitation', () => {
  it('shows theatre and concert, never cinema', () => {
    const cine = item({
      key: 'cine-1',
      cat: 'cinema',
      filmId: 'F0001',
      evenement: PRESS,
    });
    const music = item({
      key: 'mu-1',
      cat: 'musique',
      form: 'concert',
      evenement: PRESS,
    });
    const theatre = item({
      key: 'th-1',
      cat: 'theatre_danse',
      evenement: PRESS,
    });
    const expo = item({
      key: 'ex-1',
      cat: 'expo_patrimoine',
      evenement: PRESS,
    });
    assert.equal(fichePressCitation(cine), null);
    assert.ok(fichePressCitation(music));
    assert.ok(fichePressCitation(theatre));
    assert.equal(fichePressCitation(expo), null);
  });

  it('reuses detail press cells for another séance of the same event', () => {
    const slim = item({ key: 'th-a', cat: 'theatre_danse' });
    const detail = item({
      key: 'th-b',
      cat: 'theatre_danse',
      evenement: {
        event_id: slim.evenement!.event_id,
        ...PRESS,
        citation: 'Même spectacle.',
      },
    });
    const merged = pressItemForFiche(slim, detail);
    assert.equal(fichePressCitation(slim), null);
    assert.equal(fichePressCitation(merged)?.quote, '« Même spectacle. »');
  });
});

describe('concert artist_id fallback', () => {
  const artist: Artiste = {
    artiste_id: 'A9',
    nom: 'Combo',
    nom_normalise: 'combo',
    genre_principal: '',
    genres_secondaires: '',
    url_photo: '',
    notes: '',
    citation: 'Une voix qui porte loin.',
    source: 'La Terrasse',
    source_url: 'https://www.journal-laterrasse.fr/a',
    note_presse: 'TT',
  };

  it('concert uses programme.citation first, else artistes.csv via artiste_id', () => {
    const ownProg = item({
      key: 'mu-own2',
      cat: 'musique',
      form: 'concert',
      programme: {
        artiste_id: 'A9',
        citation: 'Sur scène.',
        source: 'Télérama',
        source_url: 'https://www.telerama.fr/live',
      },
    });
    const viaArtist = item({
      key: 'mu-fb',
      cat: 'musique',
      form: 'concert',
      programme: { artiste_id: 'A9' },
    });
    assert.equal(fichePressCitation(ownProg)?.source, 'Télérama');
    assert.equal(fichePressCitation(viaArtist), null);
    assert.equal(
      fichePressCitation(viaArtist, [artist])?.quote,
      '« Une voix qui porte loin. »',
    );
    const merged = withConcertArtistPress(viaArtist, [artist]);
    assert.equal(fichePressCitation(merged)?.source, 'La Terrasse');
    const keepOwn = withConcertArtistPress(ownProg, [artist]);
    assert.equal(fichePressCitation(keepOwn)?.source, 'Télérama');
  });

  it('theatre does not fall back to the artist row', () => {
    const th = item({
      key: 'th-noart',
      cat: 'theatre_danse',
      programme: { artiste_id: 'A9' },
    });
    assert.equal(fichePressCitation(th, [artist]), null);
    assert.equal(withConcertArtistPress(th, [artist]), th);
  });

  it('cinema stays empty even when the artist has a citation', () => {
    const cine = item({
      key: 'cine-fb',
      cat: 'cinema',
      filmId: 'F9',
      programme: { artiste_id: 'A9' },
    });
    assert.equal(fichePressCitation(cine, [artist]), null);
    assert.equal(withConcertArtistPress(cine, [artist]), cine);
  });
});

describe('artistPressCitation', () => {
  it('hides when the artist has no citation, shows official fields', () => {
    const empty: Artiste = {
      artiste_id: 'A1',
      nom: 'Solo',
      nom_normalise: 'solo',
      genre_principal: '',
      genres_secondaires: '',
      url_photo: '',
      notes: '',
    };
    const filled: Artiste = {
      ...empty,
      citation: 'Une voix qui porte loin.',
      source: 'La Terrasse',
      source_url: 'https://www.journal-laterrasse.fr/a',
      note_presse: 'TT',
    };
    assert.equal(artistPressCitation(empty), null);
    assert.deepEqual(artistPressCitation(filled), {
      quote: '« Une voix qui porte loin. »',
      source: 'La Terrasse',
      url: 'https://www.journal-laterrasse.fr/a',
      rating: 'TT',
    });
  });
});

describe('pickPressCatalogueFields', () => {
  it('keeps official press cells and ignores scrape notes', () => {
    assert.deepEqual(
      pickPressCatalogueFields({
        citation: '  Oui.  ',
        source: 'Télérama',
        source_url: 'https://www.telerama.fr/z',
        note_presse: 'T',
        notes: 'scrape debug',
        url_source: 'https://lieu.fr',
        source_extrait: 'nope',
        mood_confiance: 'haute',
      }),
      {
        citation: 'Oui.',
        source: 'Télérama',
        source_url: 'https://www.telerama.fr/z',
        note_presse: 'T',
      },
    );
  });

  it('detailDayItem keeps official press cells so the fiche can show them', () => {
    const raw = item({
      key: 'th-slim',
      cat: 'theatre_danse',
      evenement: {
        citation: 'Gardé après slim.',
        source: 'Télérama',
        source_url: 'https://www.telerama.fr/slim',
        note_presse: 'T',
      },
    });
    const slim = detailDayItem(raw);
    assert.deepEqual(fichePressCitation(slim), {
      quote: '« Gardé après slim. »',
      source: 'Télérama',
      url: 'https://www.telerama.fr/slim',
      rating: 'T',
    });
  });
});
