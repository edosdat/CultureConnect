/**
 * Synthetic AccountTasteState profiles for the reco crash-test bench.
 *
 * Loaded as-is from `benchProfiles.eloi.json` (Eloi, 25 profils A/B/C/D) —
 * weight / pct / cats / moods / genres / themes / communes are not renormalized.
 * `moodStockReference` is the catalogue mood stock used in the report header.
 *
 * Closed vocab: Matching A scores the 16 `TASTE_MOODS` only.
 * `poetique` and `dansant` are in that set (and in the live biblio) — no alias
 * mapping. `sortie` is a catalogue/phrase slug, not a goût: the engine ignores
 * it (`isTasteMood('sortie') === false`).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AccountTasteState, TasteProfile } from '../src/lib/signals';

export type BenchProfileGroup = 'A' | 'B' | 'C' | 'D';

export type MoodFormCounts = {
  cine: number;
  theatre: number;
  concert: number;
  festival: number;
  enfants: number;
};

export type MoodStockReference = {
  comment?: string;
  [mood: string]: MoodFormCounts | string | undefined;
};

export type BenchProfile = {
  id: string;
  /** Short label for the terminal table (French, as in the brief). */
  label: string;
  group: BenchProfileGroup;
  /** Vocab / scoring notes for the JSON archive and Top 3 dump. */
  notes: string;
  signalCount?: number;
  state: AccountTasteState;
};

type EloiProfileRaw = {
  id: string;
  label: string;
  note: string;
  signalCount?: number;
  state: AccountTasteState;
};

type EloiFile = {
  version: number;
  generatedFor?: string;
  note?: string;
  moodStockReference: MoodStockReference;
  profiles: EloiProfileRaw[];
};

const ELOI_JSON = path.join(process.cwd(), 'scripts', 'benchProfiles.eloi.json');

function loadEloiFile(): EloiFile {
  return JSON.parse(fs.readFileSync(ELOI_JSON, 'utf-8')) as EloiFile;
}

function familyOf(id: string): BenchProfileGroup {
  const letter = id.charAt(0);
  if (letter === 'A' || letter === 'B' || letter === 'C' || letter === 'D') {
    return letter;
  }
  throw new Error(`Eloi profile id must start with A/B/C/D: ${id}`);
}

/** Deep-copy the JSON state without touching weights or pcts. */
function stateAsIs(raw: AccountTasteState): AccountTasteState {
  const profile = (raw.profile ?? {}) as Partial<TasteProfile>;
  const state: AccountTasteState = {
    signalsRecent: Array.isArray(raw.signalsRecent) ? structuredClone(raw.signalsRecent) : [],
    profile: {
      cats: structuredClone(profile.cats ?? {}),
      moods: structuredClone(profile.moods ?? {}),
      genres: structuredClone(profile.genres ?? {}),
      themes: structuredClone(profile.themes ?? {}),
      communes: structuredClone(profile.communes ?? {}),
    },
  };
  if (raw.tastesText) state.tastesText = raw.tastesText;
  if (raw.tastesSetAt) state.tastesSetAt = raw.tastesSetAt;
  return state;
}

const ELOI = loadEloiFile();

export const ELOI_PROFILES_META = {
  version: ELOI.version,
  generatedFor: ELOI.generatedFor ?? '',
  note: ELOI.note ?? '',
  source: 'scripts/benchProfiles.eloi.json',
} as const;

export const MOOD_STOCK_REFERENCE: MoodStockReference = ELOI.moodStockReference;

/**
 * 25 crash-test users (families A/B/C/D). `recoBench.ts` just iterates.
 */
export const BENCH_PROFILES: BenchProfile[] = ELOI.profiles.map((p) => ({
  id: p.id,
  label: p.label,
  group: familyOf(p.id),
  notes: p.note,
  ...(typeof p.signalCount === 'number' ? { signalCount: p.signalCount } : {}),
  state: stateAsIs(p.state),
}));
