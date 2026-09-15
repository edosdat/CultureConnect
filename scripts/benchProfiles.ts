/**
 * Synthetic AccountTasteState profiles for the reco crash-test bench.
 *
 * Default: `benchProfiles.eloi.json` (Eloi, 25 profils A/B/C/D) —
 * weight / pct / cats / moods / genres / themes / communes are not renormalized.
 * `moodStockReference` is the catalogue mood stock used in the report header.
 *
 * External JSON (`--profiles`): same shape as the Eloi file — a `{ profiles }`
 * object or a bare array. Each row is AccountTasteState plus optional
 * id / note / family (aliases: user_hash, notes, group, n_signals).
 *
 * Closed vocab: Matching A scores the 16 `TASTE_MOODS` only.
 * `poetique` and `dansant` are in that set (and in the live biblio) — no alias
 * mapping. `sortie` is a catalogue/phrase slug, not a goût: the engine ignores
 * it (`isTasteMood('sortie') === false`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { cloneTasteStateAsIs } from '../src/lib/real30Export';
import type { AccountTasteState, TasteProfile } from '../src/lib/signals';

export type BenchProfileGroup = string;

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

export type BenchProfileSet = {
  profiles: BenchProfile[];
  source: string;
  note: string;
  /** Table header, e.g. "Eloi 25 (A/B/C/D)". */
  headline: string;
  moodStockReference: MoodStockReference;
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
const ELOI_SOURCE = 'scripts/benchProfiles.eloi.json';

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

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTasteProfileShape(value: unknown): value is TasteProfile {
  if (!isRecord(value)) return false;
  return 'cats' in value || 'moods' in value || 'genres' in value;
}

function isTasteStateShape(value: unknown): value is AccountTasteState {
  return isRecord(value) && isRecord(value.profile);
}

function extractState(row: Record<string, unknown>): AccountTasteState {
  if (isTasteStateShape(row.state)) return cloneTasteStateAsIs(row.state);
  if (isTasteStateShape(row.profile)) return cloneTasteStateAsIs(row.profile);
  if (isTasteStateShape(row)) return cloneTasteStateAsIs(row);
  if (isTasteProfileShape(row.profile)) {
    return cloneTasteStateAsIs({
      signalsRecent: Array.isArray(row.signalsRecent) ? (row.signalsRecent as AccountTasteState['signalsRecent']) : [],
      profile: row.profile,
      ...(typeof row.tastesText === 'string' ? { tastesText: row.tastesText } : {}),
      ...(typeof row.tastesSetAt === 'string' ? { tastesSetAt: row.tastesSetAt } : {}),
    });
  }
  throw new Error('profile row has no AccountTasteState (expected `state` or `profile`)');
}

function groupOf(id: string, family: string): BenchProfileGroup {
  if (family) return family;
  const letter = id.charAt(0).toUpperCase();
  if (letter === 'A' || letter === 'B' || letter === 'C' || letter === 'D') {
    return letter;
  }
  return 'R';
}

function toBenchProfile(raw: unknown, index: number): BenchProfile {
  if (!isRecord(raw)) {
    throw new Error(`profile[${index}] must be an object`);
  }
  const state = extractState(raw);
  const id =
    asText(raw.id) ||
    asText(raw.user_hash) ||
    asText(raw.userKey) ||
    asText(raw.user_key) ||
    `P${index + 1}`;
  const notes = asText(raw.note) || asText(raw.notes);
  const label = asText(raw.label) || id;
  const family = asText(raw.family) || asText(raw.group);
  const signalCount =
    asNumber(raw.signalCount) ?? asNumber(raw.n_signals) ?? asNumber(raw.nSignals);
  return {
    id,
    label,
    group: groupOf(id, family),
    notes,
    ...(typeof signalCount === 'number' ? { signalCount } : {}),
    state,
  };
}

function extractRawList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data.profiles)) return data.profiles;
  throw new Error('profiles JSON must be an array or `{ profiles: [...] }`');
}

const ELOI = loadEloiFile();

export const ELOI_PROFILES_META = {
  version: ELOI.version,
  generatedFor: ELOI.generatedFor ?? '',
  note: ELOI.note ?? '',
  source: ELOI_SOURCE,
} as const;

export const MOOD_STOCK_REFERENCE: MoodStockReference = ELOI.moodStockReference;

/**
 * 25 crash-test users (families A/B/C/D). Default when `--profiles` is omitted.
 */
export const BENCH_PROFILES: BenchProfile[] = ELOI.profiles.map((p) => ({
  id: p.id,
  label: p.label,
  group: familyOf(p.id),
  notes: p.note,
  ...(typeof p.signalCount === 'number' ? { signalCount: p.signalCount } : {}),
  state: cloneTasteStateAsIs(p.state),
}));

export function defaultEloiProfileSet(): BenchProfileSet {
  return {
    profiles: BENCH_PROFILES,
    source: ELOI_SOURCE,
    note: ELOI_PROFILES_META.note,
    headline: 'Eloi 25 (A/B/C/D)',
    moodStockReference: MOOD_STOCK_REFERENCE,
  };
}

/** Load Eloi25 or an external real30 / fixture JSON (as-is, no renormalize). */
export function loadBenchProfileSet(filePath?: string | null): BenchProfileSet {
  if (!filePath) return defaultEloiProfileSet();
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`--profiles: fichier introuvable: ${resolved}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  } catch (err) {
    throw new Error(`--profiles: JSON illisible (${resolved}): ${String(err)}`);
  }
  const rawList = extractRawList(data);
  if (rawList.length === 0) {
    throw new Error(`--profiles: aucun profil dans ${resolved}`);
  }
  const profiles = rawList.map((row, i) => toBenchProfile(row, i));
  const rel = path.relative(process.cwd(), resolved) || resolved;
  const note = isRecord(data) && typeof data.note === 'string' ? data.note : '';
  const moodStock =
    isRecord(data) && isRecord(data.moodStockReference)
      ? (data.moodStockReference as MoodStockReference)
      : MOOD_STOCK_REFERENCE;
  return {
    profiles,
    source: rel,
    note,
    headline: `${profiles.length} profils`,
    moodStockReference: moodStock,
  };
}
