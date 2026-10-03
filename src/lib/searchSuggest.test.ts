import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  highlightLabel,
  SALLE_SUGGEST_CAP,
  SEARCH_SUGGEST_CAP,
  suggestLocal,
  suggestSalles,
  type SearchSuggestEntry,
  type SalleSuggestLieu,
} from './searchSuggest';

const ENTRIES: SearchSuggestEntry[] = [
  { kind: 'titre', label: 'Les Misérables', id: 'p:P1', sub: 'Théâtre' },
  { kind: 'titre', label: 'Dune', id: 'p:P2' },
  { kind: 'artiste', label: 'Dune Orchestra', id: 'Dune Orchestra' },
  { kind: 'titre', label: 'Soirée jazz manouche', id: 'p:P3' },
  ...Array.from({ length: 12 }, (_, i) => ({
    kind: 'titre' as const,
    label: `Jazz ${i}`,
    id: `p:J${i}`,
  })),
];

describe('suggestLocal', () => {
  it('caps at 8 and ranks a prefix title before an artist', () => {
    const hits = suggestLocal(ENTRIES, 'du');
    assert.ok(hits.length <= SEARCH_SUGGEST_CAP);
    assert.equal(hits.length, 2);
    assert.equal(hits[0]?.id, 'p:P2');
    assert.equal(hits[1]?.kind, 'artiste');
  });

  it('returns nothing under 2 characters', () => {
    assert.deepEqual(suggestLocal(ENTRIES, 'd'), []);
  });

  it('bolds the matched substring, accents included', () => {
    const parts = highlightLabel('Les Misérables', 'miser');
    assert.equal(parts.some((p) => p.bold && p.text.toLowerCase().startsWith('misér')), true);
  });
});

const LIEUX: SalleSuggestLieu[] = [
  { id: 'L-taquin', nom: 'Le Taquin', commune: 'Toulouse' },
  { id: 'L-metro', nom: 'Le Metronum', commune: 'Toulouse' },
  { id: 'L-rex', nom: 'Le Rex', commune: 'Toulouse' },
  { id: 'L-bikini', nom: 'Le Bikini', commune: 'Ramonville' },
  { id: 'L-petit', nom: 'Le Petit Bikini', commune: 'Ramonville' },
];

describe('suggestSalles', () => {
  it('proposes the venue for any case, including a 3-letter name', () => {
    for (const query of ['taquin', 'Taquin', 'TAQUIN']) {
      const hits = suggestSalles(LIEUX, query);
      assert.equal(hits.length, 1);
      assert.equal(hits[0]?.kind, 'salle');
      assert.equal(hits[0]?.label, 'Le Taquin');
      assert.equal(hits[0]?.id, 'L-taquin');
    }
    assert.equal(suggestSalles(LIEUX, 'metronum')[0]?.label, 'Le Metronum');
    assert.equal(suggestSalles(LIEUX, 'rex')[0]?.label, 'Le Rex');
    assert.equal(suggestSalles(LIEUX, 'REX')[0]?.id, 'L-rex');
  });

  it('keeps every matching salle and ignores a city or a nonsense query', () => {
    const bikini = suggestSalles(LIEUX, 'bikini').map((row) => row.label);
    assert.deepEqual(bikini, ['Le Bikini', 'Le Petit Bikini']);
    assert.ok(bikini.length <= SALLE_SUGGEST_CAP);
    assert.deepEqual(suggestSalles(LIEUX, 'zzzzqxqqqq'), []);
    assert.deepEqual(suggestSalles(LIEUX, 'toulouse'), []);
    assert.deepEqual(suggestSalles(LIEUX, 'le'), []);
  });

  it('does not spend the title cap, so a salle stays beside spectacle titles', () => {
    const titles = suggestLocal(ENTRIES, 'jazz');
    assert.equal(titles.length, SEARCH_SUGGEST_CAP);
    assert.ok(titles.every((row) => row.kind === 'titre'));
    const salles = suggestSalles(LIEUX, 'taquin');
    assert.equal(salles[0]?.kind, 'salle');
    assert.equal(salles[0]?.label, 'Le Taquin');
  });
});

describe('omnibox does not auto-apply', () => {
  it('confirms from the preview and keeps tous free of a 14-day default', async () => {
    const ui = await readFile(
      new URL('../components/SearchOmnibox.tsx', import.meta.url),
      'utf8',
    );
    assert.match(ui, /Confirmer/);
    assert.match(ui, /Annuler/);
    assert.match(ui, /SEARCH_NL_DEBOUNCE_MS/);
    assert.match(ui, /z-40/);
    assert.match(ui, /SEARCH_NL_HINT/);
    assert.equal(ui.includes('google.com'), false);
    assert.equal(ui.includes('suggestqueries'), false);

    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    assert.match(app, /nlTimeScope\(parsed\)/);
    assert.equal(app.includes('applyParsedChips'), false);
  });
});
