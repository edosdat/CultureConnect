import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INHERITED_FAMILY_MIN_PARENT_MOODS,
  isSeasonMegaMoodParent,
  slotsFilledOf,
} from './benchMetrics';

describe('slotsFilledOf — top-3 metric', () => {
  it('counts distinct cine / theatre / concert slots', () => {
    assert.equal(
      slotsFilledOf([{ slot: 'cine' }, { slot: 'theatre' }, { slot: 'concert' }]),
      3,
    );
    assert.equal(slotsFilledOf([{ slot: 'cine' }, { slot: 'theatre' }]), 2);
    assert.equal(slotsFilledOf([{ slot: 'cine' }]), 1);
    assert.equal(slotsFilledOf([]), 0);
  });

  it('does not count a missing living slot as filled', () => {
    assert.equal(
      slotsFilledOf([{ slot: 'cine' }, { slot: 'cine' }, { slot: null }]),
      1,
    );
  });
});

describe('isSeasonMegaMoodParent — inherited family', () => {
  const mega = [
    'rigolo',
    'cerveau',
    'epique',
    'tendre',
    'festif',
    'critique',
    'leger',
    'intense',
  ];

  it(`flags a cine parent with ≥ ${INHERITED_FAMILY_MIN_PARENT_MOODS} moods`, () => {
    assert.equal(isSeasonMegaMoodParent(mega, 'cine', 'cinema'), true);
    assert.equal(isSeasonMegaMoodParent(mega.slice(0, 7), 'cine', 'cinema'), false);
  });

  it('does not flag theatre or a cine event with few moods', () => {
    assert.equal(isSeasonMegaMoodParent(mega, 'theatre', 'theatre'), false);
    assert.equal(isSeasonMegaMoodParent(['rigolo', 'tendre'], 'cine', 'cinema'), false);
  });
});
