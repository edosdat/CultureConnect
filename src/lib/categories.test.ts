import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENRE_SLUG_TO_MAIN,
  genreBelongsToMains,
  isEnfantsOnlyChip,
  matchesEnfantsChipContent,
  matchesMainCategories,
} from './categories';

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
