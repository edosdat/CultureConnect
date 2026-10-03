import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TASTE_MOODS } from './phraseTags';
import {
  FADERS,
  FIXED_PRESETS,
  NEUTRAL_PROFILE,
  confidenceFactor,
  cosine,
  crossfaderCaption,
  dominantFader,
  faderIndexOfMood,
  mappedMoodCount,
  mixList,
  mixTarget,
  planMoodList,
  presetVector,
  profileFromMoodWeights,
  rankMix,
  snapFader,
  surpriseVector,
  tasteMoodsInOrder,
  vectorFromMoods,
  type MixVector,
} from './mixFaders';

const EXPECTED: Record<string, number> = {
  rigolo: 0,
  absurde: 0,
  leger: 0,
  intense: 1,
  angoissant: 1,
  sombre: 1,
  brutal: 1,
  epique: 1,
  tendre: 2,
  poetique: 2,
  intimiste: 2,
  contemplatif: 2,
  festif: 3,
  dansant: 3,
  cerveau: 4,
  critique: 4,
};

describe('mix fader mood map', () => {
  it('maps each of the 16 taste moods to one fader and ignores sortie', () => {
    assert.equal(TASTE_MOODS.length, 16);
    assert.equal(mappedMoodCount(), 16);
    for (const mood of TASTE_MOODS) {
      assert.equal(faderIndexOfMood(mood), EXPECTED[mood], mood);
    }
    assert.equal(faderIndexOfMood('sortie'), -1);
    assert.equal(tasteMoodsInOrder('sortie|rigolo|festif').join(','), 'rigolo,festif');
  });
});

describe('rank × confidence', () => {
  it('weights 1 / 0.6 / 0.3 by rank and confidence, and drops a 4th mood', () => {
    assert.equal(confidenceFactor('haute'), 1);
    assert.equal(confidenceFactor('moyenne'), 0.8);
    assert.equal(confidenceFactor('basse'), 0.5);
    assert.equal(confidenceFactor(''), 0.8);
    assert.equal(confidenceFactor(undefined), 0.8);

    const haute = vectorFromMoods(['rigolo', 'festif', 'sombre', 'cerveau'], 'haute');
    assert.deepEqual(haute, [1, 0.3, 0, 0.6, 0]);

    const moyenne = vectorFromMoods(['rigolo'], 'moyenne');
    assert.equal(moyenne?.[0], 0.8);

    const basse = vectorFromMoods(['tendre'], 'basse');
    assert.equal(basse?.[2], 0.5);

    const missing = vectorFromMoods(['dansant'], '');
    assert.equal(missing?.[3], 0.8);
  });

  it('takes the max weight inside a fader, not the sum', () => {
    const vector = vectorFromMoods(['rigolo', 'absurde', 'leger'], 'haute');
    assert.equal(vector?.[0], 1);
    assert.notEqual(vector?.[0], 1 + 0.6 + 0.3);
  });
});

describe('profile and crossfader', () => {
  it('scales mood weights so the strongest fader is 0.8', () => {
    const profile = profileFromMoodWeights({ rigolo: 4, festif: 2, sortie: 9 });
    assert.deepEqual(profile, [0.8, 0, 0, 0.4, 0]);
    assert.equal(profileFromMoodWeights({}), null);
    assert.equal(profileFromMoodWeights({ sortie: 3, comedie: 4 }), null);
  });

  it('crossfader at 0 is the profile only', () => {
    const profile: MixVector = [0.8, 0.2, 0.6, 0.5, 0.3];
    const faders: MixVector = [0.05, 0.95, 0.4, 0.2, 0.6];
    assert.deepEqual(mixTarget(profile, faders, 0), profile);
    assert.deepEqual(mixTarget(profile, faders, 100), faders);
    const mid = mixTarget(profile, faders, 70);
    assert.ok(Math.abs(mid[0]! - (profile[0] * 0.3 + faders[0] * 0.7)) < 1e-12);
    assert.equal(crossfaderCaption(0), 'Rien que ton type');
    assert.equal(crossfaderCaption(100), 'Rien que ton envie de ce soir');
    assert.equal(crossfaderCaption(70), '70 % ce soir, 30 % ton type');
  });

  it('Surprends-moi is 1 minus the profile, slider by slider', () => {
    const profile: MixVector = [0.8, 0.2, 0.6, 0.5, 0.3];
    assert.deepEqual(surpriseVector(profile), [0.2, 0.8, 0.4, 0.5, 0.7]);
    assert.deepEqual(presetVector('secoue', profile), FIXED_PRESETS.secoue);
    assert.deepEqual(presetVector('mix', NEUTRAL_PROFILE), NEUTRAL_PROFILE);
  });
});

describe('cosine and the list', () => {
  it('scores cosine and marks the fader with the largest product', () => {
    const axis: MixVector = [1, 0, 0, 0, 0];
    assert.equal(cosine(axis, axis), 1);
    assert.equal(cosine(axis, [0, 1, 0, 0, 0]), 0);
    assert.ok(Math.abs(cosine(axis, [1, 1, 0, 0, 0]) - 1 / Math.sqrt(2)) < 1e-12);
    assert.equal(dominantFader([1, 1, 0, 0, 0], [0.2, 0.9, 0, 0, 0]), 1);
    assert.equal(dominantFader([1, 1, 0, 0, 0], [0.5, 0.5, 0, 0, 0]), 0);
  });

  it('excludes plans with no mood and hides a weak list', () => {
    const target: MixVector = [1, 0, 0, 0, 0];
    const strong = { id: 's', vector: [1, 0, 0, 0, 0] as MixVector, bucket: 'cine' as const };
    const other = { id: 'o', vector: [0, 1, 0, 0, 0] as MixVector, bucket: 'vivant' as const };
    const none = { id: 'n', vector: null, bucket: 'musique' as const };
    const ranked = rankMix([none, other, strong], target, 'tout');
    assert.deepEqual(ranked.map((row) => row.id), ['s', 'o']);
    assert.equal(vectorFromMoods([], 'haute'), null);
    assert.equal(planMoodList({ rowMoods: 'sortie', inheritParent: false }).length, 0);

    const three = rankMix(
      [strong, { ...strong, id: 's2' }, { ...strong, id: 's3' }, other],
      target,
      'tout',
    );
    assert.equal(mixList(three).weak, false);
    assert.equal(mixList(three).top.length, 4);

    const two = rankMix([strong, { ...strong, id: 's2' }, other], target, 'tout');
    assert.equal(mixList(two).weak, true);
    assert.deepEqual(mixList(two).top, []);

    const cineOnly = rankMix([strong, other], target, 'cine');
    assert.deepEqual(cineOnly.map((row) => row.id), ['s']);
  });

  it('snaps a finger position to step 5', () => {
    assert.equal(snapFader(0.83), 0.85);
    assert.equal(snapFader(1.2), 1);
    assert.equal(snapFader(-0.1), 0);
  });
});

describe('preset values', () => {
  it('matches the brief, 0–100', () => {
    assert.deepEqual(FIXED_PRESETS.rire, [0.95, 0.05, 0.2, 0.6, 0.1]);
    assert.deepEqual(FIXED_PRESETS.secoue, [0.05, 0.95, 0.4, 0.2, 0.6]);
    assert.deepEqual(FIXED_PRESETS.doux, [0.2, 0, 0.95, 0, 0.4]);
    assert.deepEqual(FIXED_PRESETS.danse, [0.4, 0.1, 0.1, 1, 0]);
    assert.deepEqual(
      FADERS.map((fader) => fader.label),
      ['Rire', 'Frisson', 'Émotion', 'Fête', 'Cérébral'],
    );
  });
});
