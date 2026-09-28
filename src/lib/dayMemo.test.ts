import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDayMemo } from './dayMemo';

describe('day memo', () => {
  it('returns a value for the same day key inside the TTL', () => {
    const memo = createDayMemo<number>({ ttlMs: 300_000, max: 4 });
    memo.set('2026-09-28|tous|Toulouse', 159, 1_000);
    assert.equal(memo.get('2026-09-28|tous|Toulouse', 1_000 + 299_000), 159);
    assert.equal(memo.get('2026-09-29|tous|Toulouse', 1_000), null);
  });

  it('drops the entry after the TTL so a later miss can recompute', () => {
    const memo = createDayMemo<string>({ ttlMs: 300_000 });
    memo.set('2026-09-28', 'totals', 1_000);
    assert.equal(memo.get('2026-09-28', 1_000 + 300_001), null);
  });

  it('evicts the oldest key when the cap is hit', () => {
    const memo = createDayMemo<number>({ ttlMs: 300_000, max: 2 });
    memo.set('a', 1, 1_000);
    memo.set('b', 2, 2_000);
    memo.set('c', 3, 3_000);
    assert.equal(memo.get('a', 3_000), null);
    assert.equal(memo.get('b', 3_000), 2);
    assert.equal(memo.get('c', 3_000), 3);
  });
});
