import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchIndex,
  clearSearchIndexMemoForTests,
} from './searchSuggestCatalogue';
import { SEARCH_SUGGEST_CAP, suggestLocal } from './searchSuggest';

describe('buildSearchIndex', () => {
  it('lists upcoming titles and known salles from the local catalogue', () => {
    clearSearchIndexMemoForTests();
    const index = buildSearchIndex(new Date('2026-08-01T10:00:00+02:00'));
    assert.ok(index.suggest.some((row) => row.kind === 'titre'));
    assert.ok(
      index.suggest.every((row) => row.kind === 'titre' || row.kind === 'artiste'),
    );
    assert.ok(index.lieux.some((lieu) => lieu.nom === 'Le Bikini'));
    assert.ok(suggestLocal(index.suggest, 'jazz').length <= SEARCH_SUGGEST_CAP);
  });
});
