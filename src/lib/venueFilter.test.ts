import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { retainSelectedLieuId, venueFilterVisible } from './venueFilter';

describe('venueFilterVisible', () => {
  it('hides Salles when no QUOI category', () => {
    assert.equal(venueFilterVisible([]), false);
  });

  it('shows Salles when a category is on', () => {
    assert.equal(venueFilterVisible(['cinema']), true);
  });
});

describe('retainSelectedLieuId', () => {
  const venues = [{ lieu_id: 'L017' }, { lieu_id: 'L042' }];

  it('clears when category cleared', () => {
    assert.equal(retainSelectedLieuId('L017', [], venues), null);
  });

  it('clears when salle left the category options', () => {
    assert.equal(retainSelectedLieuId('L099', ['cinema'], venues), null);
  });

  it('keeps salle still in options', () => {
    assert.equal(retainSelectedLieuId('L017', ['cinema'], venues), 'L017');
  });

  it('keeps selection while options are still empty (in-flight)', () => {
    assert.equal(retainSelectedLieuId('L017', ['cinema'], []), 'L017');
  });

  it('noop when nothing selected', () => {
    assert.equal(retainSelectedLieuId(null, ['cinema'], venues), null);
  });
});
