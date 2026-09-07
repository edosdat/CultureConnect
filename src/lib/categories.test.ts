import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENRE_SLUG_TO_MAIN,
  genreBelongsToMains,
  isEnfantsOnlyChip,
  matchesEnfantsChipContent,
  matchesMainCategories,
} from './categories';
import { itemsForDateRange } from './events';
import type {
  Evenement,
  EventWithDetails,
  Lieu,
  ProgrammeItem,
  ProgrammeWithContext,
} from './types';

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
    date_debut: '2026-09-08',
    date_fin: '2026-09-08',
    heure_debut: '15:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    publication: 'agenda',
    ...p,
  };
}

function ctx(
  opts: {
    id: string;
    cat: string;
    title: string;
    genre?: string;
    tags?: string;
    publicCible?: string;
    filmId?: string;
  },
): ProgrammeWithContext {
  const evenement = ev({
    event_id: opts.id,
    categorie: opts.cat,
    titre: opts.title,
    genre: opts.genre ?? '',
    tags: opts.tags,
    public_cible: opts.publicCible,
  });
  const programme: ProgrammeItem = {
    programme_id: opts.id,
    event_id: opts.id,
    lieu_id: 'L1',
    nom_item: opts.title,
    type_item: '',
    date: '2026-09-08',
    heure_debut: '15:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: opts.genre ?? '',
    artiste_id: '',
    film_id: opts.filmId,
    public_cible: opts.publicCible,
  };
  return { programme, evenement, lieu: lieu() };
}

describe('GENRE_SLUG_TO_MAIN stays exclusive', () => {
  it('keeps animation_jeune_public under cinema and jeune_public under theatre', () => {
    assert.equal(GENRE_SLUG_TO_MAIN.animation_jeune_public, 'cinema');
    assert.equal(GENRE_SLUG_TO_MAIN.jeune_public, 'theatre_danse');
  });
});

describe('isEnfantsOnlyChip', () => {
  it('is true only for the lone Enfants QUOI chip', () => {
    assert.equal(isEnfantsOnlyChip(['enfants_famille']), true);
    assert.equal(isEnfantsOnlyChip([]), false);
    assert.equal(isEnfantsOnlyChip(['enfants_famille', 'expo_patrimoine']), false);
    assert.equal(isEnfantsOnlyChip(['cinema']), false);
  });
});

describe('matchesEnfantsChipContent', () => {
  it('keeps cat enfants_famille / ateliers', () => {
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'enfants_famille',
        genre: '',
      }),
      true,
    );
    assert.equal(
      matchesEnfantsChipContent({ categorie: 'atelier', genre: 'atelier_mediation' }),
      true,
    );
  });

  it('includes animation_jeune films and jeune-public theatre', () => {
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'cinema',
        genre: 'animation_jeune_public',
      }),
      true,
    );
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'theatre_danse',
        genre: 'jeune_public',
      }),
      true,
    );
  });

  it('includes theatre tagged famille|enfants without remapping its main', () => {
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'theatre',
        genre: 'theatre_contemporain',
        tags: 'famille|enfants',
      }),
      true,
    );
  });

  it('does not leak adult thriller or untagged cinema', () => {
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'cinema',
        genre: 'fiction',
        tags: 'Thriller|Drame',
      }),
      false,
    );
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'cinema',
        genre: 'fiction',
        publicCible: 'tout_public',
      }),
      false,
    );
  });

  it('vetoes AlloCiné adult animation tagged animation_jeune_public', () => {
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'cinema',
        genre: 'animation_jeune_public',
        publicCible: 'Interdit - 12 ans',
        ageMin: '12',
      }),
      false,
    );
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'cinema',
        genre: 'animation_jeune_public',
        publicCible: 'tout_public',
      }),
      true,
    );
  });

  it('does not steal concerts via a famille mood tag', () => {
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'concert',
        genre: 'chanson_variete',
        tags: 'famille',
      }),
      false,
    );
  });
});

describe('matchesMainCategories Enfants chip vs exclusive cats', () => {
  it('Enfants chip matches kids films and kids theatre', () => {
    assert.equal(
      matchesMainCategories('cinema', 'animation_jeune_public', ['enfants_famille']),
      true,
    );
    assert.equal(
      matchesMainCategories('theatre_danse', 'jeune_public', ['enfants_famille']),
      true,
    );
    assert.equal(
      matchesMainCategories('theatre', 'theatre_contemporain', ['enfants_famille'], {
        tags: 'jeune_public',
      }),
      true,
    );
  });

  it('Enfants chip rejects adult thriller', () => {
    assert.equal(
      matchesMainCategories('cinema', 'fiction', ['enfants_famille'], {
        tags: 'Thriller',
      }),
      false,
    );
  });

  it('Cinéma chip still includes kids films and excludes theatre (#49)', () => {
    assert.equal(
      matchesMainCategories('cinema', 'animation_jeune_public', ['cinema']),
      true,
    );
    assert.equal(
      matchesMainCategories('theatre_danse', 'jeune_public', ['cinema']),
      false,
    );
    assert.equal(
      matchesMainCategories('enfants_famille', 'atelier_mediation', ['cinema']),
      false,
    );
  });

  it('Théâtre chip still includes jeune public and excludes films', () => {
    assert.equal(
      matchesMainCategories('theatre_danse', 'jeune_public', ['theatre_danse']),
      true,
    );
    assert.equal(
      matchesMainCategories('cinema', 'animation_jeune_public', ['theatre_danse']),
      false,
    );
  });

  it('empty selection stays open', () => {
    assert.equal(matchesMainCategories('cinema', 'fiction', []), true);
  });
});

describe('genreBelongsToMains Enfants', () => {
  it('surfaces animation_jeune_public under the Enfants chip', () => {
    assert.equal(
      genreBelongsToMains(
        { slug: 'animation_jeune_public', famille: 'cinema' },
        ['enfants_famille'],
      ),
      true,
    );
    assert.equal(
      genreBelongsToMains({ slug: 'fiction', famille: 'cinema' }, ['enfants_famille']),
      false,
    );
  });
});

describe('itemsForDateRange Enfants chip', () => {
  const kidsFilm = ctx({
    id: 'kf',
    cat: 'cinema',
    title: 'Toy Story 5',
    genre: 'animation_jeune_public',
    filmId: 'F0016',
  });
  const kidsTheatre = ctx({
    id: 'kt',
    cat: 'theatre_danse',
    title: 'Cosmos 1979',
    genre: 'jeune_public',
  });
  const taggedTheatre = ctx({
    id: 'tt',
    cat: 'theatre',
    title: 'Contes en famille',
    genre: 'theatre_contemporain',
    tags: 'famille|enfants',
  });
  const thriller = ctx({
    id: 'ad',
    cat: 'cinema',
    title: 'Adult thriller',
    genre: 'fiction',
    tags: 'Thriller',
    filmId: 'F-AD',
  });
  const bannedAnim = ctx({
    id: 'jq',
    cat: 'cinema',
    title: 'Jim Queen',
    genre: 'animation_jeune_public',
    publicCible: 'Interdit - 12 ans',
    filmId: 'F0040',
  });
  bannedAnim.evenement!.age_min = '12';
  const atelier = ctx({
    id: 'at',
    cat: 'atelier',
    title: 'Stage vacances',
    genre: 'atelier_mediation',
  });
  const pool = [kidsFilm, kidsTheatre, taggedTheatre, thriller, atelier, bannedAnim];
  const events: EventWithDetails[] = [];

  it('QA: Enfants chip shows kids films + tagged theatre, no thriller leak', () => {
    const items = itemsForDateRange(
      pool,
      events,
      '2026-09-08',
      '2026-09-08',
      ['enfants_famille'],
    );
    const titles = items.map((i) =>
      i.kind === 'programme' ? i.programme.nom_item : i.evenement.titre,
    );
    assert.ok(titles.includes('Toy Story 5'));
    assert.ok(titles.includes('Cosmos 1979'));
    assert.ok(titles.includes('Contes en famille'));
    assert.ok(titles.includes('Stage vacances'));
    assert.equal(titles.includes('Adult thriller'), false);
    assert.equal(titles.includes('Jim Queen'), false);
  });

  it('QA: Cinéma chip stays exclusive (#49) and clear filter is the full catalogue', () => {
    const cine = itemsForDateRange(
      pool,
      events,
      '2026-09-08',
      '2026-09-08',
      ['cinema'],
    ).map((i) => (i.kind === 'programme' ? i.programme.nom_item : i.evenement.titre));
    assert.ok(cine.includes('Toy Story 5'));
    assert.ok(cine.includes('Adult thriller'));
    assert.equal(cine.includes('Cosmos 1979'), false);
    assert.equal(cine.includes('Stage vacances'), false);

    const all = itemsForDateRange(pool, events, '2026-09-08', '2026-09-08', []);
    assert.equal(all.length, 6);
    const cineTitles = cine;
    assert.ok(cineTitles.includes('Jim Queen'));
  });
});
