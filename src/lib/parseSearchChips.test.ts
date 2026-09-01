import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchChips } from './parseSearchChips';

/** Tuesday 1 September 2026, afternoon Paris. */
const NOW = new Date('2026-09-01T14:00:00+02:00');

describe('parseSearchChips', () => {
  it('maps « un film ce soir » to Cinéma + Ce soir, no title leftover', () => {
    const p = parseSearchChips('un film ce soir', NOW);
    assert.deepEqual(p.categories, ['cinema']);
    assert.equal(p.scope, 'soir');
    assert.equal(p.selectedDate, '2026-09-01');
    assert.equal(p.titleQuery, '');
  });

  it('maps « concert samedi » to Musique + calendar Saturday', () => {
    const p = parseSearchChips('concert samedi', NOW);
    assert.deepEqual(p.categories, ['musique']);
    assert.equal(p.scope, 'date');
    assert.equal(p.selectedDate, '2026-09-05');
    assert.equal(p.titleQuery, '');
  });

  it('maps « théâtre ce week-end » to Théâtre + Ce WE', () => {
    const p = parseSearchChips('théâtre ce week-end', NOW);
    assert.deepEqual(p.categories, ['theatre_danse']);
    assert.equal(p.scope, 'weekend');
    assert.equal(p.titleQuery, '');
  });

  it('keeps a bare title as title search', () => {
    const p = parseSearchChips('Les Misérables', NOW);
    assert.deepEqual(p.categories, []);
    assert.equal(p.scope, null);
    assert.equal(p.titleQuery, 'Les Misérables');
  });

  it('keeps leftover title when date/category are present', () => {
    const p = parseSearchChips('Dune ce soir', NOW);
    assert.equal(p.scope, 'soir');
    assert.deepEqual(p.categories, []);
    assert.equal(p.titleQuery, 'dune');
  });

  it('maps expo / enfants / cette semaine / a calendar date', () => {
    const expo = parseSearchChips('expo aujourd’hui', NOW);
    assert.deepEqual(expo.categories, ['expo_patrimoine']);
    assert.equal(expo.scope, 'aujourdhui');

    const kids = parseSearchChips('enfants cette semaine', NOW);
    assert.deepEqual(kids.categories, ['enfants_famille']);
    assert.equal(kids.scope, 'semaine');

    const fest = parseSearchChips('festival 12 septembre', NOW);
    assert.deepEqual(fest.categories, ['festival']);
    assert.equal(fest.scope, 'date');
    assert.equal(fest.selectedDate, '2026-09-12');
  });

  it('does not treat mood-only phrases as chips', () => {
    const p = parseSearchChips('un truc intimiste', NOW);
    assert.deepEqual(p.categories, []);
    assert.equal(p.scope, null);
    assert.equal(p.titleQuery, 'un truc intimiste');
  });

  it('picks one QUAND chip, most specific first (Ce soir > Date…)', () => {
    const p = parseSearchChips('samedi soir', NOW);
    assert.equal(p.scope, 'soir');
    assert.equal(p.selectedDate, '2026-09-01');
    assert.equal(p.titleQuery, '');
  });

  it('allows several QUOI chips', () => {
    const p = parseSearchChips('un film et un concert ce soir', NOW);
    assert.equal(p.scope, 'soir');
    assert.deepEqual(p.categories, ['cinema', 'musique']);
    assert.equal(p.titleQuery, '');
  });
});
