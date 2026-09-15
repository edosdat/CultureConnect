import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashEmailKey } from './adminAnalytics';
import { emptyProfile, emptyTasteState, type AccountTasteState, type Signal } from './signals';
import {
  buildReal30Export,
  cloneTasteStateAsIs,
  real30Eligibility,
} from './real30Export';

const NOW = new Date('2026-09-15T12:00:00+02:00');

function signal(ts: string, i: number): Signal {
  return {
    id: `s${i}`,
    ts,
    kind: 'open_card',
    weight: 2,
    genres: [],
    moods: ['intense'],
  };
}

function state(partial: Partial<AccountTasteState>): AccountTasteState {
  return {
    ...emptyTasteState(),
    ...partial,
    profile: partial.profile ?? emptyProfile(),
  };
}

function scorable(): AccountTasteState {
  return state({
    profile: {
      ...emptyProfile(),
      moods: { intense: { weight: 4, pct: 100 } },
    },
  });
}

describe('real30Eligibility J1 filter', () => {
  it('ignores J0 (same Paris day as first activity)', () => {
    const row = {
      state: scorable(),
      updatedAt: '2026-09-15T08:00:00+02:00',
    };
    assert.deepEqual(real30Eligibility(row, NOW), { eligible: false, reason: 'cold' });
  });

  it('accepts J2+ (Paris snapshot ≥ first day + 2)', () => {
    const row = {
      state: state({}),
      updatedAt: '2026-09-13T09:00:00+02:00',
    };
    assert.deepEqual(real30Eligibility(row, NOW), { eligible: true, reason: 'j2' });
  });

  it('accepts ≥8 signals spanning 24h even before J2', () => {
    const signals = Array.from({ length: 8 }, (_, i) =>
      signal(i === 0 ? '2026-09-14T10:00:00+02:00' : '2026-09-15T11:00:00+02:00', i),
    );
    const row = {
      state: state({ signalsRecent: signals }),
      updatedAt: '2026-09-15T11:00:00+02:00',
    };
    assert.deepEqual(real30Eligibility(row, NOW), {
      eligible: true,
      reason: 'signals_24h',
    });
  });

  it('accepts age ≥24h + scorable before J2', () => {
    const row = {
      state: {
        ...scorable(),
        tastesSetAt: '2026-09-14T10:00:00+02:00',
      },
      updatedAt: '2026-09-14T10:00:00+02:00',
    };
    assert.deepEqual(real30Eligibility(row, NOW), {
      eligible: true,
      reason: 'age_scorable',
    });
  });

  it('keeps a J1 empty profile cold', () => {
    const row = {
      state: state({}),
      updatedAt: '2026-09-14T18:00:00+02:00',
    };
    assert.deepEqual(real30Eligibility(row, NOW), { eligible: false, reason: 'cold' });
  });
});

describe('buildReal30Export', () => {
  it('hashes userKey, drops clear email, keeps state as-is', () => {
    const raw = {
      ...scorable(),
      tastesText: 'jazz',
      profile: {
        ...emptyProfile(),
        moods: { poetique: { weight: 12.5, pct: 37 } },
      },
    };
    const json = buildReal30Export(
      [
        {
          userKey: 'Eloi@Gmail.com',
          state: raw,
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          userKey: 'j0@gmail.com',
          state: scorable(),
          updatedAt: '2026-09-15T08:00:00+02:00',
        },
      ],
      NOW,
    );
    assert.equal(json.version, 1);
    assert.equal(json.counts.n_total, 2);
    assert.equal(json.counts.n_eligible, 1);
    assert.equal(json.counts.n_cold, 1);
    assert.equal(json.profiles.length, 1);
    const row = json.profiles[0]!;
    assert.equal(row.id, hashEmailKey('Eloi@Gmail.com'));
    assert.equal(row.id.includes('@'), false);
    assert.match(row.label, /^u01\|/);
    assert.equal(row.state.profile.moods.poetique?.weight, 12.5);
    assert.equal(row.state.profile.moods.poetique?.pct, 37);
    const dumped = JSON.stringify(json);
    assert.equal(dumped.includes('Eloi@Gmail.com'), false);
    assert.equal(dumped.includes('j0@gmail.com'), false);
    const clone = cloneTasteStateAsIs(raw);
    clone.profile.moods.poetique!.weight = 0;
    assert.equal(raw.profile.moods.poetique?.weight, 12.5);
  });
});
