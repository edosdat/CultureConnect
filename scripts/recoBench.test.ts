import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { slotsFilledOf } from './benchMetrics';

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
