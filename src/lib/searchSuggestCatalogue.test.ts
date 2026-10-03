import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryAgenda } from './agendaQuery';
import {
  buildSearchIndex,
  clearSearchIndexMemoForTests,
} from './searchSuggestCatalogue';
import { SEARCH_SUGGEST_CAP, suggestArtistes, suggestLocal, suggestSalles } from './searchSuggest';
import type { DayItem } from './types';

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

function eventIdOf(item: DayItem): string {
  if (item.kind === 'programme') return item.programme.event_id || '';
  return item.evenement.event_id || '';
}

describe('artist suggestion lists every upcoming date of that artist', () => {
  const base = {
    scope: 'tous' as const,
    commune: 'Toulouse',
    cats: [] as string[],
    genres: [] as string[],
    lieuId: null,
    selectedDate: null,
    year: 2026,
    month: 10,
    q: '',
  };

  it('quarteto proposes Cuarteto Tafi, then the name lists TAQ0020 without dropping E496 early', () => {
    clearSearchIndexMemoForTests();
    const now = new Date('2026-10-03T12:00:00+02:00');
    const index = buildSearchIndex(now);
    for (const query of ['quarteto', 'Quarteto', 'cuartéto']) {
      const hits = suggestArtistes(index.suggest, query);
      const hit = hits.find((row) => row.label === 'Cuarteto Tafi');
      assert.ok(hit, `${query} proposes Cuarteto Tafi`);
      assert.equal(hit.kind, 'artiste');
      assert.equal(hit.id, 'Cuarteto Tafi');
    }
    assert.deepEqual(suggestArtistes(index.suggest, 'zzzzqxqqqq'), []);
    assert.equal(suggestSalles(index.lieux, 'taquin')[0]?.label, 'Le Taquin');

    const listed = queryAgenda({ ...base, q: 'Cuarteto Tafi' }, now);
    assert.ok(listed.items.some((item) => eventIdOf(item) === 'TAQ0020'));
    assert.equal(
      listed.items.some((item) => eventIdOf(item) === 'E496'),
      false,
    );

    const earlier = new Date('2026-08-20T12:00:00+02:00');
    const both = queryAgenda({ ...base, q: 'Cuarteto Tafi' }, earlier);
    assert.ok(both.items.some((item) => eventIdOf(item) === 'TAQ0020'));
    assert.ok(both.items.some((item) => eventIdOf(item) === 'E496'));
  });
});
