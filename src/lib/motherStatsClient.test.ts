import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMotherStatsPayload,
  resetMotherStatsClientForTests,
} from './motherStatsClient';

describe('motherStatsClient', () => {
  it('parseMotherStatsPayload normalizes mine + counters', () => {
    resetMotherStatsClientForTests();
    assert.deepEqual(parseMotherStatsPayload(null), {
      envie: 0,
      going: 0,
      mine: null,
    });
    assert.deepEqual(
      parseMotherStatsPayload({ envie: 2, going: 1, mine: 'envie' }),
      { envie: 2, going: 1, mine: 'envie' },
    );
    assert.deepEqual(
      parseMotherStatsPayload({ envie: 1, going: 0, mine: 'nope' }),
      { envie: 1, going: 0, mine: null },
    );
  });
});
