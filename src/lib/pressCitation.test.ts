import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import {
  cataloguePressRating,
  pickPressCatalogueFields,
  pressCitationOf,
  pressItemForFiche,
  theatrePressCitation,
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
  it('hides when citation fields are empty', () => {
    const row = item({ key: 'th-empty', cat: 'theatre_danse' });
    assert.equal(pressCitationOf(row), null);
    assert.equal(theatrePressCitation(row), null);
  });

  it('reads citation + media + https url + optional Télérama note', () => {
    const row = item({
      key: 'th-telerama',
      cat: 'theatre_danse',
      evenement: {
        citation_presse: 'Une pièce d’une rare intensité.',
        presse_media: 'Télérama',
        presse_url: 'https://www.telerama.fr/scenes/exemple',
        presse_note: 'TTTT',
      },
    });
    assert.deepEqual(pressCitationOf(row), {
      quote: '« Une pièce d’une rare intensité. »',
      source: 'Télérama',
      url: 'https://www.telerama.fr/scenes/exemple',
      rating: 'TTTT',
    });
  });

  it('wraps French guillemets and clips to two sentences', () => {
    const row = item({
      key: 'th-long',
      cat: 'theatre_danse',
      evenement: {
        citation_presse:
          'Premier souffle. Deuxième souffle. Troisième souffle qu’on ne doit pas voir.',
        presse_media: 'Sceneweb',
        presse_url: 'https://sceneweb.fr/article',
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
        citation_presse: 'Vif et juste.',
        presse_source: 'La Dépêche',
        presse_url: 'http://ladepeche.fr/interdit',
        presse_note: '4',
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
        citation_presse: 'Court régional.',
        presse_media: 'La Dépêche',
        presse_url: 'https://www.ladepeche.fr/a',
        citation_presse_2: 'Un peu plus long côté Sceneweb.',
        presse_media_2: 'Sceneweb',
        presse_url_2: 'https://www.sceneweb.fr/b',
        citation_presse_3: 'Regard Télérama.',
        presse_media_3: 'Télérama',
        presse_url_3: 'https://www.telerama.fr/c',
      },
    });
    const c = pressCitationOf(row);
    assert.ok(c);
    assert.equal(c!.source, 'Télérama');
    assert.equal(c!.quote, '« Regard Télérama. »');
  });

  it('otherwise picks the shortest quote of at most two sentences', () => {
    const row = item({
      key: 'th-short',
      cat: 'theatre_danse',
      evenement: {
        citation_presse: 'Très long avis d’un blog local sans nom connu ici vraiment.',
        presse_media: 'Blog local',
        presse_url: 'https://example.org/long',
        citation_presse_2: 'Bref.',
        presse_media_2: 'Autre blog',
        presse_url_2: 'https://example.org/short',
      },
    });
    const c = pressCitationOf(row);
    assert.ok(c);
    assert.equal(c!.quote, '« Bref. »');
  });

  it('parses packed citation|media|url|note when other cells are empty', () => {
    const row = item({
      key: 'th-pack',
      cat: 'theatre_danse',
      evenement: {
        citation_presse:
          'Élégant et dru.|La Terrasse|https://www.journal-laterrasse.fr/x|TT',
      },
    });
    assert.deepEqual(pressCitationOf(row), {
      quote: '« Élégant et dru. »',
      source: 'La Terrasse',
      url: 'https://www.journal-laterrasse.fr/x',
      rating: 'TT',
    });
  });
});

describe('theatrePressCitation', () => {
  it('stays off cinema and music fiches even when press fields exist', () => {
    const press = {
      citation_presse: 'Ne doit pas s’afficher ici.',
      presse_media: 'Télérama',
      presse_url: 'https://www.telerama.fr/cine',
      presse_note: 'TTT',
    };
    const cine = item({
      key: 'cine-1',
      cat: 'cinema',
      filmId: 'F0001',
      evenement: press,
    });
    const music = item({
      key: 'mu-1',
      cat: 'musique',
      form: 'concert',
      evenement: press,
    });
    const theatre = item({
      key: 'th-1',
      cat: 'theatre_danse',
      evenement: press,
    });
    assert.equal(theatrePressCitation(cine), null);
    assert.equal(theatrePressCitation(music), null);
    assert.ok(theatrePressCitation(theatre));
  });

  it('reuses detail press cells for another séance of the same event', () => {
    const slim = item({ key: 'th-a', cat: 'theatre_danse' });
    const detail = item({
      key: 'th-b',
      cat: 'theatre_danse',
      evenement: {
        event_id: slim.evenement!.event_id,
        citation_presse: 'Même spectacle.',
        presse_media: 'Télérama',
        presse_url: 'https://www.telerama.fr/same',
      },
    });
    const merged = pressItemForFiche(slim, detail);
    assert.equal(theatrePressCitation(slim), null);
    assert.equal(theatrePressCitation(merged)?.quote, '« Même spectacle. »');
  });
});

describe('pickPressCatalogueFields', () => {
  it('keeps only presse / citation cells for the detail slim', () => {
    assert.deepEqual(
      pickPressCatalogueFields({
        citation_presse: '  Oui.  ',
        presse_url: 'https://www.telerama.fr/z',
        notes: 'scrape debug',
        url_source: 'https://lieu.fr',
        citation_presse_2: 'Autre.',
      }),
      {
        citation_presse: 'Oui.',
        presse_url: 'https://www.telerama.fr/z',
        citation_presse_2: 'Autre.',
      },
    );
  });

  it('detailDayItem keeps press cells so the fiche can show them', () => {
    const raw = item({
      key: 'th-slim',
      cat: 'theatre_danse',
      evenement: {
        citation_presse: 'Gardé après slim.',
        presse_media: 'Télérama',
        presse_url: 'https://www.telerama.fr/slim',
        presse_note: 'T',
      },
    });
    const slim = detailDayItem(raw);
    assert.deepEqual(theatrePressCitation(slim), {
      quote: '« Gardé après slim. »',
      source: 'Télérama',
      url: 'https://www.telerama.fr/slim',
      rating: 'T',
    });
  });

  it('never treats scrape notes as a press citation', () => {
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
