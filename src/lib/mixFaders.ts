/**
 * Mon mix — pure scoring. Moods v1 only. No writes, no reco.ts changes.
 *
 * Rank is the position among taste moods after `sortie` and unknown slugs
 * are dropped (they do not consume a slot). Only the first three count:
 * 1, 0.6, 0.3. A fourth taste mood is ignored — the brief names three ranks.
 * One confidence for the plan: haute 1, moyenne 0.8, basse 0.5, missing 0.8.
 */

import { isTasteMood, TASTE_MOODS, type TasteMood } from './phraseTags';

export type MixVector = [number, number, number, number, number];

export type MixFaderId = 'rire' | 'frisson' | 'emotion' | 'fete' | 'cerebral';

export type MixBucket = 'cine' | 'musique' | 'vivant';

export type MixFilter = 'tout' | MixBucket;

export const FADER_COUNT = 5;

/** Guest, or a signed-in account with no taste-mood weight. */
export const NEUTRAL_PROFILE: MixVector = [0.5, 0.2, 0.5, 0.5, 0.3];

export const MIX_TOP = 10;
export const MIX_STRONG_SCORE = 0.3;
export const MIX_STRONG_MIN = 3;

const RANK_WEIGHT = [1, 0.6, 0.3] as const;

export const FADERS: ReadonlyArray<{
  id: MixFaderId;
  label: string;
  color: string;
  moods: readonly TasteMood[];
}> = [
  { id: 'rire', label: 'Rire', color: '#FF9E6D', moods: ['rigolo', 'absurde', 'leger'] },
  {
    id: 'frisson',
    label: 'Frisson',
    color: '#FF4D6D',
    moods: ['intense', 'angoissant', 'sombre', 'brutal', 'epique'],
  },
  {
    id: 'emotion',
    label: 'Émotion',
    color: '#5EEAD4',
    moods: ['tendre', 'poetique', 'intimiste', 'contemplatif'],
  },
  { id: 'fete', label: 'Fête', color: '#FFD23F', moods: ['festif', 'dansant'] },
  { id: 'cerebral', label: 'Cérébral', color: '#B98CFF', moods: ['cerveau', 'critique'] },
];

const FADER_OF_MOOD = new Map<string, number>();
for (let i = 0; i < FADERS.length; i++) {
  for (const mood of FADERS[i]!.moods) FADER_OF_MOOD.set(mood, i);
}

export type MixPresetKey =
  | 'mix'
  | 'rire'
  | 'secoue'
  | 'doux'
  | 'danse'
  | 'surprise';

export const MIX_PRESETS: ReadonlyArray<{ key: MixPresetKey; label: string }> = [
  { key: 'mix', label: 'Ton mix' },
  { key: 'rire', label: 'Soirée fou rire' },
  { key: 'secoue', label: 'Un truc qui secoue' },
  { key: 'doux', label: 'Tout doux' },
  { key: 'danse', label: 'Ça va danser' },
  { key: 'surprise', label: 'Surprends-moi' },
];

/** Fixed presets, 0–1. Ton mix and Surprends-moi come from the profile. */
export const FIXED_PRESETS: Record<
  'rire' | 'secoue' | 'doux' | 'danse',
  MixVector
> = {
  rire: [0.95, 0.05, 0.2, 0.6, 0.1],
  secoue: [0.05, 0.95, 0.4, 0.2, 0.6],
  doux: [0.2, 0, 0.95, 0, 0.4],
  danse: [0.4, 0.1, 0.1, 1, 0],
};

export function faderIndexOfMood(mood: string): number {
  return FADER_OF_MOOD.get(mood.trim().toLowerCase()) ?? -1;
}

/** haute 1, moyenne 0.8, basse 0.5, anything else (missing) 0.8. */
export function confidenceFactor(raw: string | null | undefined): number {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'haute') return 1;
  if (s === 'moyenne') return 0.8;
  if (s === 'basse') return 0.5;
  return 0.8;
}

/** Catalogue cell → ordered slugs. Pipe or comma. Order kept. */
export function splitMoodCell(raw: string | readonly string[] | null | undefined): string[] {
  if (!raw) return [];
  const parts = typeof raw === 'string' ? raw.split(/[|,]/) : [...raw];
  const out: string[] = [];
  for (const part of parts) {
    const slug = part.trim().toLowerCase();
    if (slug) out.push(slug);
  }
  return out;
}

/**
 * Taste moods only, principal first. `sortie` and unknown slugs are removed
 * before ranking, so they do not take the 1 / 0.6 / 0.3 slots.
 */
export function tasteMoodsInOrder(
  raw: string | readonly string[] | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slug of splitMoodCell(raw)) {
    if (slug === 'sortie' || !isTasteMood(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function planMoodList(input: {
  rowMoods: string | readonly string[] | null | undefined;
  parentMoods?: string | readonly string[] | null | undefined;
  inheritParent: boolean;
}): string[] {
  const row = tasteMoodsInOrder(input.rowMoods);
  const parent = input.inheritParent ? tasteMoodsInOrder(input.parentMoods) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slug of [...row, ...parent]) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/** null when the plan has no v1 taste mood. Never invent one. */
export function vectorFromMoods(
  moods: readonly string[],
  confiance: string | null | undefined,
): MixVector | null {
  if (moods.length === 0) return null;
  const factor = confidenceFactor(confiance);
  const acc: MixVector = [0, 0, 0, 0, 0];
  for (let i = 0; i < moods.length && i < RANK_WEIGHT.length; i++) {
    const fader = faderIndexOfMood(moods[i]!);
    if (fader < 0) continue;
    const weight = RANK_WEIGHT[i]! * factor;
    if (weight > acc[fader]!) acc[fader] = weight;
  }
  return acc;
}

/**
 * Mood weights → five faders (max per fader, same groups as a plan),
 * then scale so the strongest is 0.8 and the others stay proportional.
 * null when nothing maps — caller uses NEUTRAL_PROFILE.
 */
export function profileFromMoodWeights(
  weights: Record<string, number> | null | undefined,
): MixVector | null {
  const raw: MixVector = [0, 0, 0, 0, 0];
  let any = false;
  for (const [mood, weight] of Object.entries(weights ?? {})) {
    if (!isTasteMood(mood)) continue;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const fader = faderIndexOfMood(mood);
    if (fader < 0) continue;
    any = true;
    if (weight > raw[fader]!) raw[fader] = weight;
  }
  if (!any) return null;
  const max = Math.max(...raw);
  if (max <= 0) return null;
  const scale = 0.8 / max;
  return raw.map((value) => value * scale) as MixVector;
}

export function surpriseVector(profile: MixVector): MixVector {
  return profile.map((value) => Math.round((1 - value) * 100) / 100) as MixVector;
}

export function presetVector(key: MixPresetKey, profile: MixVector): MixVector {
  if (key === 'mix') return profile.slice() as MixVector;
  if (key === 'surprise') return surpriseVector(profile);
  return FIXED_PRESETS[key].slice() as MixVector;
}

/** 0–1 snapped to 5 points (step 5 on a 0–100 slider). */
export function snapFader(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const snapped = Math.round(value * 20) / 20;
  return Math.min(1, Math.max(0, snapped));
}

export function mixTarget(
  profile: MixVector,
  faders: MixVector,
  crossfader: number,
): MixVector {
  const dosage = Math.min(100, Math.max(0, crossfader)) / 100;
  const keep = 1 - dosage;
  return profile.map((value, i) => value * keep + faders[i]! * dosage) as MixVector;
}

export function crossfaderCaption(crossfader: number): string {
  const xf = Math.min(100, Math.max(0, Math.round(crossfader)));
  if (xf <= 0) return 'Rien que ton type';
  if (xf >= 100) return 'Rien que ton envie de ce soir';
  return `${xf} % ce soir, ${100 - xf} % ton type`;
}

export function cosine(a: MixVector, b: MixVector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < FADER_COUNT; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const da = Math.sqrt(na);
  const db = Math.sqrt(nb);
  if (da === 0 || db === 0) return 0;
  return dot / (da * db);
}

/** Fader where (target × plan) is largest. First index wins a tie. */
export function dominantFader(target: MixVector, plan: MixVector): number {
  let best = 0;
  for (let i = 1; i < FADER_COUNT; i++) {
    if (plan[i]! * target[i]! > plan[best]! * target[best]!) best = i;
  }
  return best;
}

export type MixCandidate = {
  id: string;
  vector: MixVector | null;
  bucket: MixBucket;
};

export type MixRanked = {
  id: string;
  score: number;
  fader: number;
};

export function rankMix(
  plans: readonly MixCandidate[],
  target: MixVector,
  filter: MixFilter,
): MixRanked[] {
  const rows: MixRanked[] = [];
  for (const plan of plans) {
    if (!plan.vector) continue;
    if (filter !== 'tout' && plan.bucket !== filter) continue;
    rows.push({
      id: plan.id,
      score: cosine(target, plan.vector),
      fader: dominantFader(target, plan.vector),
    });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

/**
 * Fewer than 3 plans with score > 0.3 → no list.
 * Otherwise the top 10, including weaker scores past that floor.
 */
export function mixList(ranked: readonly MixRanked[]): {
  weak: boolean;
  top: MixRanked[];
} {
  let strong = 0;
  for (const row of ranked) {
    if (row.score > MIX_STRONG_SCORE) strong += 1;
  }
  if (strong < MIX_STRONG_MIN) return { weak: true, top: [] };
  return { weak: false, top: ranked.slice(0, MIX_TOP) };
}

export function plansTitle(count: number): string {
  return count === 1 ? '1 plan' : `${count} plans`;
}

/** Every v1 taste mood belongs to exactly one fader. Used by the test. */
export function mappedMoodCount(): number {
  let n = 0;
  for (const mood of TASTE_MOODS) {
    if (faderIndexOfMood(mood) >= 0) n += 1;
  }
  return n;
}
