import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  highlightLabel,
  SEARCH_SUGGEST_CAP,
  suggestLocal,
  type SearchSuggestEntry,
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
