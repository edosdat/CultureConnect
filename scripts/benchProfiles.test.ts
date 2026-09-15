import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BENCH_PROFILES, loadBenchProfileSet } from './benchProfiles';

describe('loadBenchProfileSet', () => {
  it('defaults to the baked-in Eloi 25 file', () => {
    const set = loadBenchProfileSet();
    assert.equal(set.source, 'scripts/benchProfiles.eloi.json');
    assert.equal(set.headline, 'Eloi 25 (A/B/C/D)');
    assert.equal(set.profiles.length, 25);
    assert.equal(set.profiles.length, BENCH_PROFILES.length);
    assert.equal(set.profiles[0]?.id, 'A1');
  });

  it('loads the 2-profile fixture (Eloi object shape)', () => {
    const set = loadBenchProfileSet('scripts/fixtures/bench-profiles-2.json');
    assert.equal(set.profiles.length, 2);
    assert.equal(set.profiles[0]?.id, 'F1');
    assert.equal(set.profiles[0]?.group, 'A');
    assert.equal(set.profiles[1]?.id, 'F2');
    assert.equal(set.profiles[1]?.state.profile.moods.intense?.weight, 70);
    assert.equal(set.profiles[1]?.state.profile.moods.intense?.pct, 100);
  });

  it('loads a bare array with optional id/note/family', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-profiles-'));
    const file = path.join(dir, 'array.json');
    fs.writeFileSync(
      file,
      JSON.stringify([
        {
          id: 'u-hash',
          note: 'real30-ish',
          family: 'R',
          state: {
            signalsRecent: [],
            profile: {
              cats: {},
              moods: { tendre: { weight: 3, pct: 100 } },
              genres: {},
              themes: {},
              communes: {},
            },
          },
        },
      ]),
    );
    const set = loadBenchProfileSet(file);
    assert.equal(set.profiles.length, 1);
    assert.equal(set.profiles[0]?.id, 'u-hash');
    assert.equal(set.profiles[0]?.group, 'R');
    assert.equal(set.profiles[0]?.notes, 'real30-ish');
    assert.equal(set.profiles[0]?.state.profile.moods.tendre?.pct, 100);
  });
});
