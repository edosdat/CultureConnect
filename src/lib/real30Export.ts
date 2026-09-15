/**
 * Real-30 calibration export — hash-only AccountTasteState snapshots.
 *
 * Internal / allowlist CLI. J0 (first Paris calendar day) is ignored unless
 * another anti-noise rule fires. States are cloned as-is (no pct renormalize).
 * Never writes `data/`. Never emits a clear email or prénom.
 */
import { hashEmailKey } from './adminAnalytics';
import { hasScorableState, type AccountTasteState, type TasteProfile } from './signals';
import { addDaysIso, parisParts } from './timeScope';

export const REAL30_VERSION = 1;
export const REAL30_GENERATED_FOR = 'CultureConnect — real30 calibration (INTERNE)';
export const REAL30_NOTE =
  'Hash only. J0 ignored. Hors git public / hors chat large.';
export const REAL30_FILTER_RULE =
  'J2+ OR signalCount>=8 OR age_since_first_signal>=24h';

const MS_24H = 24 * 60 * 60 * 1000;

export type Real30AdminRow = {
  userKey: string;
  state: AccountTasteState;
  updatedAt?: string;
};

export type Real30ProfileRow = {
  id: string;
  label: string;
  note?: string;
  signalCount?: number;
  state: AccountTasteState;
};

export type Real30ExportJson = {
  version: number;
  generatedFor: string;
  note: string;
  generatedAt: string;
  filter: {
    ignoreJ0: true;
    rule: string;
  };
  counts: {
    n_total: number;
    n_eligible: number;
    n_cold: number;
  };
  profiles: Real30ProfileRow[];
};

export type Real30EligibilityReason = 'j2' | 'signals_24h' | 'age_scorable' | 'cold';

export type Real30Eligibility = {
  eligible: boolean;
  reason: Real30EligibilityReason;
};

/** Deep-copy AccountTasteState without touching weights or pcts. */
export function cloneTasteStateAsIs(raw: AccountTasteState): AccountTasteState {
  const profile = (raw.profile ?? {}) as Partial<TasteProfile>;
  const state: AccountTasteState = {
    signalsRecent: Array.isArray(raw.signalsRecent)
      ? structuredClone(raw.signalsRecent)
      : [],
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

function parseMs(raw?: string | Date | null): number | null {
  if (!raw) return null;
  const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}

function signalTimes(state: AccountTasteState): number[] {
  const out: number[] = [];
  for (const s of state.signalsRecent ?? []) {
    const t = parseMs(s.ts);
    if (t != null) out.push(t);
  }
  return out;
}

function firstActivityMs(state: AccountTasteState, updatedAt?: string): number | null {
  const times = signalTimes(state);
  const setAt = parseMs(state.tastesSetAt);
  if (setAt != null) times.push(setAt);
  const updated = parseMs(updatedAt);
  if (updated != null) times.push(updated);
  if (times.length === 0) return null;
  return Math.min(...times);
}

function lastActivityMs(state: AccountTasteState, updatedAt?: string): number | null {
  const times = signalTimes(state);
  const setAt = parseMs(state.tastesSetAt);
  if (setAt != null) times.push(setAt);
  const updated = parseMs(updatedAt);
  if (updated != null) times.push(updated);
  if (times.length === 0) return null;
  return Math.max(...times);
}

/**
 * Anti-bruit J1 — eligible if at least one rule holds:
 *   1. Paris snapshot day ≥ J2 (first activity day + 2)
 *   2. signalsRecent.length ≥ 8 AND last update/signal ≥ 24h after first signal
 *   3. age since first activity ≥ 24h AND hasScorableState
 */
export function real30Eligibility(
  row: { state: AccountTasteState; updatedAt?: string },
  now = new Date(),
): Real30Eligibility {
  const { state, updatedAt } = row;
  const first = firstActivityMs(state, updatedAt);
  if (first == null) return { eligible: false, reason: 'cold' };

  const firstIso = parisParts(new Date(first)).iso;
  const snapshotIso = parisParts(now).iso;
  if (snapshotIso >= addDaysIso(firstIso, 2)) {
    return { eligible: true, reason: 'j2' };
  }

  const signals = signalTimes(state);
  const last = lastActivityMs(state, updatedAt);
  if (signals.length >= 8 && last != null && last >= Math.min(...signals) + MS_24H) {
    return { eligible: true, reason: 'signals_24h' };
  }

  if (now.getTime() >= first + MS_24H && hasScorableState(state)) {
    return { eligible: true, reason: 'age_scorable' };
  }

  return { eligible: false, reason: 'cold' };
}

export function buildReal30Export(
  rows: readonly Real30AdminRow[],
  now = new Date(),
): Real30ExportJson {
  const eligibleRows: Real30AdminRow[] = [];
  let nCold = 0;
  for (const row of rows) {
    if (real30Eligibility(row, now).eligible) eligibleRows.push(row);
    else nCold += 1;
  }

  const profiles: Real30ProfileRow[] = eligibleRows.map((row, i) => {
    const id = hashEmailKey(row.userKey);
    const signalCount = Array.isArray(row.state.signalsRecent)
      ? row.state.signalsRecent.length
      : 0;
    const out: Real30ProfileRow = {
      id,
      label: `u${String(i + 1).padStart(2, '0')}|${id.slice(0, 6)}`,
      signalCount,
      state: cloneTasteStateAsIs(row.state),
    };
    if (!hasScorableState(row.state)) out.note = 'cold';
    return out;
  });

  return {
    version: REAL30_VERSION,
    generatedFor: REAL30_GENERATED_FOR,
    note: REAL30_NOTE,
    generatedAt: now.toISOString(),
    filter: { ignoreJ0: true, rule: REAL30_FILTER_RULE },
    counts: {
      n_total: rows.length,
      n_eligible: profiles.length,
      n_cold: nCold,
    },
    profiles,
  };
}
