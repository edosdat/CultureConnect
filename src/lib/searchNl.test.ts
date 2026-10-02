import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bootTimeScope, upcomingRange } from './timeScope';
import {
  nlCategoriesToApply,
  nlHasFilter,
  nlTimeScope,
  parseSearchNl,
  previewChips,
  SEARCH_NL_HINT,
  searchNlMode,
  type SearchNlDict,
} from './searchNl';

/** Tuesday 1 September 2026, afternoon Paris. */
const NOW = new Date('2026-09-01T14:00:00+02:00');

const DICT: SearchNlDict = {
  genres: [
    { slug: 'jazz_blues', label: 'Jazz / blues' },
    { slug: 'rock_metal_punk', label: 'Rock / metal / punk' },
    { slug: 'classique_lyrique', label: 'Classique / lyrique' },
    { slug: 'theatre_classique', label: 'Théâtre classique' },
  ],
  communes: ['Toulouse', 'Blagnac', 'Labège', "L'Union"],
  lieux: [
    {
      id: 'L083',
      nom: 'Le Bikini',
      label: 'Ramonville-Saint-Agne — Le Bikini',
      commune: 'Ramonville-Saint-Agne',
    },
    {
      id: 'L093',
      nom: 'Le Petit Bikini',
      label: 'Ramonville-Saint-Agne — Le Petit Bikini',
      commune: 'Ramonville-Saint-Agne',
    },
    {
      id: 'L001',
      nom: 'Une salle',
      label: 'Toulouse — Une salle',
      commune: 'Toulouse',
    },
  ],
};

function salleChips(parsed: ReturnType<typeof parseSearchNl>) {
  return previewChips(parsed, DICT).filter(
    (c) => c.key.startsWith('salle:') || c.label === 'Le Bikini' || c.label === 'Une salle',
  );
}

describe('parseSearchNl', () => {
  it('maps jazz ce week-end to genre + Ce WE, no leftover title', () => {
    const parsed = parseSearchNl('jazz ce week-end', DICT, NOW);
    assert.equal(parsed.scope, 'weekend');
    assert.deepEqual(parsed.genres, ['jazz_blues']);
    assert.equal(parsed.titleQuery, '');
    assert.deepEqual(nlCategoriesToApply(parsed), ['musique']);
    const labels = previewChips(parsed, DICT).map((c) => c.label);
    assert.ok(labels.includes('Ce WE'));
    assert.ok(labels.includes('Jazz / blues'));
    assert.ok(labels.includes('Musique'));
    assert.equal(labels.includes('Cette semaine'), false);
  });

  it('0 date chip stays off the preview and confirms as full ≥ today', () => {
    const parsed = parseSearchNl('jazz', DICT, NOW);
    assert.equal(parsed.scope, null);
    assert.equal(nlTimeScope(parsed), 'tous');
    assert.equal(bootTimeScope(), 'tous');
    const quand = previewChips(parsed, DICT).filter((c) => c.axis === 'quand');
    assert.equal(quand.length, 0);
    const range = upcomingRange('2026-10-01', '2027-06-01');
    assert.equal(range.startIso, '2026-10-01');
    assert.equal(range.endIso, '2027-06-01');
    assert.ok(range.days.length > 30);
  });

  it('keeps an intentional date phrase', () => {
    const theatre = parseSearchNl('théâtre demain', DICT, NOW);
    assert.deepEqual(theatre.categories, ['theatre_danse']);
    assert.equal(theatre.scope, 'date');
    assert.equal(theatre.selectedDate, '2026-09-02');
    assert.equal(nlTimeScope(theatre), 'date');
    assert.equal(previewChips(theatre, DICT)[0]?.label, '2 sept.');

    const cine = parseSearchNl('ciné enfants ce soir', DICT, NOW);
    assert.equal(cine.scope, 'soir');
    assert.deepEqual(cine.categories, ['cinema', 'enfants_famille']);
    assert.equal(nlTimeScope(cine), 'soir');
  });

  it('maps a named commune to a ville chip', () => {
    const city = parseSearchNl('jazz à Blagnac', DICT, NOW);
    assert.equal(city.commune, 'Blagnac');
    assert.deepEqual(city.genres, ['jazz_blues']);
    assert.equal(city.scope, null);
    assert.equal(city.lieuId, null);
    const chips = previewChips(city, DICT);
    assert.ok(chips.some((c) => c.axis === 'ville' && c.label === 'Blagnac'));
    assert.equal(chips.filter((c) => c.axis === 'genre').length, 1);
    assert.equal(salleChips(city).length, 0);
  });

  it('does not pin a salle or infer its commune from a venue name', () => {
    const salle = parseSearchNl('au bikini', DICT, NOW);
    assert.equal(salle.lieuId, null);
    assert.equal(salle.lieuLabel, null);
    assert.equal(salle.commune, null);
    assert.equal(salle.scope, null);
    assert.equal(nlHasFilter(salle), false);
    assert.equal(salleChips(salle).length, 0);
    assert.equal(previewChips(salle, DICT).length, 0);

    const petit = parseSearchNl('petit bikini', DICT, NOW);
    assert.equal(petit.lieuId, null);
    assert.equal(petit.lieuLabel, null);
    assert.equal(petit.commune, null);
    assert.equal(salleChips(petit).length, 0);

    const vague = parseSearchNl('une salle', DICT, NOW);
    assert.equal(vague.lieuId, null);
    assert.equal(vague.lieuLabel, null);
    assert.equal(vague.commune, null);
    assert.equal(nlHasFilter(vague), false);
    assert.equal(salleChips(vague).length, 0);
    assert.equal(previewChips(vague, DICT).length, 0);

    const withGenre = parseSearchNl('jazz au bikini', DICT, NOW);
    assert.deepEqual(withGenre.genres, ['jazz_blues']);
    assert.equal(withGenre.commune, null);
    assert.equal(withGenre.lieuId, null);
    const chips = previewChips(withGenre, DICT);
    assert.ok(chips.some((c) => c.axis === 'genre' && c.label === 'Jazz / blues'));
    assert.ok(chips.some((c) => c.axis === 'quoi' && c.label === 'Musique'));
    assert.equal(chips.some((c) => c.axis === 'ville'), false);
    assert.equal(salleChips(withGenre).length, 0);
  });

  it('does not invent QUAND or QUOI for a bare title', () => {
    const parsed = parseSearchNl('Les Misérables', DICT, NOW);
    assert.equal(nlHasFilter(parsed), false);
    assert.equal(parsed.scope, null);
    assert.equal(previewChips(parsed, DICT).length, 0);
    assert.match(parsed.titleQuery, /mis[eé]rables/i);
  });

  it('drops an ambiguous single genre token claimed by two chips', () => {
    const parsed = parseSearchNl('classique', DICT, NOW);
    assert.deepEqual(parsed.genres, []);
  });
});

describe('searchNlMode', () => {
  it('stays closed under 2 chars, while unsettled, and after dismiss', () => {
    assert.equal(
      searchNlMode({
        query: 'j',
        settled: true,
        chipCount: 0,
        hitCount: 3,
        dismissed: false,
      }),
      'closed',
    );
    assert.equal(
      searchNlMode({
        query: 'jazz',
        settled: false,
        chipCount: 1,
        hitCount: 0,
        dismissed: false,
      }),
      'closed',
    );
    assert.equal(
      searchNlMode({
        query: 'jazz',
        settled: true,
        chipCount: 1,
        hitCount: 4,
        dismissed: true,
      }),
      'closed',
    );
  });

  it('prefers chips, then catalogue, then the French hint', () => {
    assert.equal(
      searchNlMode({
        query: 'jazz ce week-end',
        settled: true,
        chipCount: 2,
        hitCount: 8,
        dismissed: false,
      }),
      'chips',
    );
    assert.equal(
      searchNlMode({
        query: 'Dune',
        settled: true,
        chipCount: 0,
        hitCount: 1,
        dismissed: false,
      }),
      'catalogue',
    );
    assert.equal(
      searchNlMode({
        query: 'zzzz',
        settled: true,
        chipCount: 0,
        hitCount: 0,
        dismissed: false,
      }),
      'hint',
    );
    assert.match(SEARCH_NL_HINT, /On n’a pas trouvé de filtre/);
  });
});

describe('NL confirm does not pin salle', () => {
  it('handleNlConfirm applies commune and categories, never lieu', async () => {
    const src = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    const start = src.indexOf('function handleNlConfirm');
    const end = src.indexOf('function handleSuggestTitre');
    assert.ok(start > 0 && end > start);
    const body = src.slice(start, end);
    assert.equal(body.includes('setSelectedLieuId'), false);
    assert.equal(body.includes('setVenueOptions'), false);
    assert.equal(body.includes('lieuPinRef'), false);
    assert.match(body, /setSelectedCommune\(parsed\.commune\)/);
    assert.match(body, /nlCategoriesToApply\(parsed\)/);
    assert.match(body, /nlTimeScope\(parsed\)/);
    assert.equal(src.includes('lieuPinRef'), false);
  });
});

describe('agenda default range', () => {
  it('tous uses the catalogue end, not a 14-day cap', async () => {
    const src = await readFile(new URL('./agendaQuery.ts', import.meta.url), 'utf8');
    assert.match(
      src,
      /scope === 'tous'\s*\?\s*upcomingRange\(paris\.iso, dataMaxIso\(\)\)/,
    );
    assert.equal(src.includes('upcomingRange(paris.iso, dataMaxIso(), 14)'), false);
  });
});
