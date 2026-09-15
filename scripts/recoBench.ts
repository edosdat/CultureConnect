/**
 * CultureConnect — banc d'essai du moteur de recommandation (dev-only).
 *
 * Read-only on Matching A: calls `recommendForProfile` and never writes `data/`.
 * Exit 0 even when ⚠ thresholds fire — this is a dashboard, not a test.
 *
 * Windows (fixed Europe/Paris `now` = Monday 2026-09-21 00:00):
 *   lundi    — that calendar day
 *   vendredi — Friday 2026-09-25
 *   semaine  — next 7 days inclusive  [now, now+6]
 *   mois     — next 30 days inclusive [now, now+29]
 *
 * Usage:
 *   npm run bench
 *   npm run bench -- --compare bench-results/2026-09-15.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { BENCH_PROFILES, type BenchProfile } from './benchProfiles';
import { loadBenchCatalogue } from './loadCatalogue';
import { itemsForDateRange, itemsForDay } from '../src/lib/events';
import { nouveauFilmIds } from '../src/lib/nouveautesCine';
import { recoWhyForMood } from '../src/lib/displayHome';
import {
  isTimeReachable,
  itemIdentity,
  recommendForProfile,
  resolvedFormOfItem,
  slotFormOfItem,
  workIdOf,
  type RecoReason,
  type RecoReasonSource,
  type RecoSlotForm,
  type ScoredDayItem,
} from '../src/lib/reco';
import { TASTE_MOODS, isTasteMood } from '../src/lib/phraseTags';
import { addDaysIso, parisParts } from '../src/lib/timeScope';
import type { DayItem } from '../src/lib/types';
import { entryPct, entryWeight, type AccountTasteState } from '../src/lib/signals';

const FALLBACK_SOURCES = new Set<string>(['popularite', 'nouveaute', 'rarete']);
const KL_EPS = 0.01;
const TOP_N = 3;

/** ⚠ thresholds — brief §4.5. Never fail the process. */
const THRESHOLD = {
  coverage: 0.15,
  diversity: 0.3,
  fallback: 0.5,
} as const;

/**
 * Pin the clock so before/after JSON compares the same windows.
 * 00:00 Paris → every séance that calendar day is still reachable.
 */
const FIXED_NOW = new Date('2026-09-21T00:00:00+02:00');

type ScenarioId = 'monday' | 'friday' | 'week' | 'month';

type Scenario = {
  id: ScenarioId;
  label: string;
  /** Inclusive YYYY-MM-DD. */
  startIso: string;
  endIso: string;
  now: Date;
  definition: string;
};

type ListRow = {
  key: string;
  workId: string;
  title: string;
  slot: RecoSlotForm | null;
  form: string;
  moods: string[];
  dayIso: string;
  reasonSource: RecoReasonSource | 'rarete' | string;
  reasonMood?: string;
  reasonGenre?: string;
  reasonPhrase: string | null;
};

type RunRecord = {
  profileId: string;
  scenarioId: ScenarioId;
  vivantShare: number | null;
  diversity: number | null;
  calibration: number | null;
  fallbackRate: number | null;
  elapsedMs: number;
  list: ListRow[];
};

type Coverage = {
  recommended: number;
  feasible: number;
  ratio: number | null;
};

type BenchJson = {
  meta: {
    generatedAt: string;
    engine: 'recommendForProfile';
    fixedNow: string;
    windows: Record<
      ScenarioId,
      { startIso: string; endIso: string; definition: string }
    >;
    moodVocab: {
      poetique: string;
      dansant: string;
      sortie: string;
    };
    thresholds: typeof THRESHOLD;
    catalogue: {
      evenements: number;
      programme: number;
      maxIso: string;
    };
    vivantRule: string;
  };
  profiles: Array<{
    id: string;
    label: string;
    group: string;
    notes: string;
  }>;
  scenarios: Scenario[];
  stock: Record<
    ScenarioId,
    { items: number; works: number; vivantWorks: number; cineWorks: number }
  >;
  runs: RunRecord[];
  byProfile: Array<{
    profileId: string;
    label: string;
    vivantShare: number | null;
    diversity: number | null;
    calibration: number | null;
    fallbackRate: number | null;
    meanElapsedMs: number;
  }>;
  global: {
    coverage: Coverage;
    vivantShare: number | null;
    fallbackRate: number | null;
    meanElapsedMs: number;
  };
};

function titleOf(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.nom_item || '').trim() ||
      (item.evenement?.titre || '').trim() ||
      item.key
    );
  }
  return (item.evenement.titre || '').trim() || item.key;
}

function splitTags(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(/[|,]/);
  return parts.map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Closed goût slugs on the item (ambiance vector). */
function itemTasteMoods(item: DayItem): string[] {
  const ev = item.evenement ?? null;
  const prog = item.kind === 'programme' ? item.programme : null;
  const raw = [
    ...splitTags(prog?.moods),
    ...splitTags(ev?.moods),
    ...splitTags(prog?.genres_mood),
    ...splitTags(ev?.genres_mood),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of raw) {
    if (!isTasteMood(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function workKey(item: DayItem): string {
  return workIdOf(item) || itemIdentity(item) || item.key;
}

/**
 * Vivant = theatre | concert slot via `slotFormOfItem` (not raw `form`).
 * Festival / enfants rows that resolve to those slots count; cine does not.
 */
function isVivantSlot(item: DayItem): boolean {
  const slot = slotFormOfItem(item);
  return slot === 'theatre' || slot === 'concert';
}

function moodVector(moods: readonly string[]): number[] {
  return TASTE_MOODS.map((m) => (moods.includes(m) ? 1 : 0));
}

function cosine(a: number[], b: number[]): number | null {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Mean pairwise 1 − cos on closed-mood vectors. Null if < 2 usable pairs. */
function intraListDiversity(lists: readonly DayItem[]): number | null {
  const vectors = lists.map((item) => moodVector(itemTasteMoods(item)));
  const dists: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const c = cosine(vectors[i]!, vectors[j]!);
      if (c == null) continue;
      dists.push(1 - c);
    }
  }
  if (dists.length === 0) return null;
  return dists.reduce((s, d) => s + d, 0) / dists.length;
}

function normalizeDist(weights: Record<string, number>): Record<string, number> {
  let sum = 0;
  for (const w of Object.values(weights)) {
    if (w > 0) sum += w;
  }
  const out: Record<string, number> = {};
  if (sum <= 0) return out;
  for (const [k, w] of Object.entries(weights)) {
    if (w > 0) out[k] = w / sum;
  }
  return out;
}

function profileMoodDist(state: AccountTasteState): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const [slug, entry] of Object.entries(state.profile.moods ?? {})) {
    if (!isTasteMood(slug)) continue;
    const pct = entryPct(entry);
    const w = pct > 0 ? pct : entryWeight(entry);
    if (w > 0) raw[slug] = w;
  }
  return normalizeDist(raw);
}

function listMoodDist(items: readonly DayItem[]): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const item of items) {
    for (const mood of itemTasteMoods(item)) {
      raw[mood] = (raw[mood] ?? 0) + 1;
    }
  }
  return normalizeDist(raw);
}

/** KL(p ‖ q̃) with q̃ = (1−ε)q + εp. Null when the profile has no goût. */
function calibrationKl(
  state: AccountTasteState,
  items: readonly DayItem[],
): number | null {
  const p = profileMoodDist(state);
  const keys = Object.keys(p);
  if (keys.length === 0) return null;
  const q = listMoodDist(items);
  let kl = 0;
  for (const t of keys) {
    const pt = p[t] ?? 0;
    if (pt <= 0) continue;
    const qt = (1 - KL_EPS) * (q[t] ?? 0) + KL_EPS * pt;
    kl += pt * Math.log(pt / qt);
  }
  return kl;
}

function mean(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (xs.length === 0) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function ratio(num: number, den: number): number | null {
  if (den <= 0) return null;
  return num / den;
}

function isFallbackSource(source: string | undefined): boolean {
  return Boolean(source && FALLBACK_SOURCES.has(source));
}

function reasonPhrase(reason: RecoReason | undefined): string | null {
  if (!reason) return null;
  if (reason.source === 'popularite') return 'repli popularité';
  if (reason.source === 'nouveaute') return 'repli nouveauté';
  if ((reason.source as string) === 'rarete') return 'repli rareté';
  const why = recoWhyForMood(reason.mood);
  if (why) return why;
  if (reason.genre) return `parce que tu aimes ${reason.genre}`;
  return 'profil';
}

function toListRow(scored: ScoredDayItem): ListRow {
  const { item, reason } = scored;
  return {
    key: item.key,
    workId: workKey(item),
    title: titleOf(item),
    slot: slotFormOfItem(item),
    form: resolvedFormOfItem(item),
    moods: itemTasteMoods(item),
    dayIso: item.dayIso,
    reasonSource: reason?.source ?? 'popularite',
    ...(reason?.mood ? { reasonMood: reason.mood } : {}),
    ...(reason?.genre ? { reasonGenre: reason.genre } : {}),
    reasonPhrase: reasonPhrase(reason),
  };
}

function buildScenarios(now: Date): Scenario[] {
  const start = parisParts(now).iso;
  const monday = start;
  // Next Friday of this pinned week (Mon + 4).
  const friday = addDaysIso(start, 4);
  const weekEnd = addDaysIso(start, 6);
  const monthEnd = addDaysIso(start, 29);
  const fridayNow = new Date('2026-09-25T00:00:00+02:00');
  return [
    {
      id: 'monday',
      label: 'lundi',
      startIso: monday,
      endIso: monday,
      now,
      definition: `Single Paris day ${monday} (lundi) — thin vivant stock.`,
    },
    {
      id: 'friday',
      label: 'vendredi',
      startIso: friday,
      endIso: friday,
      now: fridayNow,
      definition: `Single Paris day ${friday} (vendredi) — richer vivant stock.`,
    },
    {
      id: 'week',
      label: 'semaine',
      startIso: start,
      endIso: weekEnd,
      now,
      definition: `Next 7 days inclusive from pinned Paris now: ${start} → ${weekEnd}.`,
    },
    {
      id: 'month',
      label: 'mois',
      startIso: start,
      endIso: monthEnd,
      now,
      definition: `Next 30 days inclusive from pinned Paris now: ${start} → ${monthEnd}.`,
    },
  ];
}

function loadWindowItems(
  catalogue: ReturnType<typeof loadBenchCatalogue>,
  scenario: Scenario,
): DayItem[] {
  if (scenario.startIso === scenario.endIso) {
    return itemsForDay(
      catalogue.programmeWithContext,
      catalogue.events,
      scenario.startIso,
    );
  }
  return itemsForDateRange(
    catalogue.programmeWithContext,
    catalogue.events,
    scenario.startIso,
    scenario.endIso,
  );
}

function feasibleItems(items: DayItem[], now: Date): DayItem[] {
  const reachable = items.filter((item) => isTimeReachable(item, now));
  return reachable.length > 0 ? reachable : items;
}

function stockSnapshot(items: DayItem[], now: Date) {
  const feasible = feasibleItems(items, now);
  const works = new Set<string>();
  const vivantWorks = new Set<string>();
  const cineWorks = new Set<string>();
  for (const item of feasible) {
    const id = workKey(item);
    works.add(id);
    const slot = slotFormOfItem(item);
    if (slot === 'theatre' || slot === 'concert') vivantWorks.add(id);
    if (slot === 'cine') cineWorks.add(id);
  }
  return {
    items: feasible.length,
    works: works.size,
    vivantWorks: vivantWorks.size,
    cineWorks: cineWorks.size,
  };
}

function pad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const s = text.length > width ? text.slice(0, width) : text;
  return align === 'right' ? s.padStart(width) : s.padEnd(width);
}

function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function fmtDelta(v: number | null | undefined, digits = 2, asPct = false): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const shown = asPct ? v * 100 : v;
  const sign = shown > 0 ? '+' : '';
  const suffix = asPct ? 'pt' : '';
  return `${sign}${shown.toFixed(digits)}${suffix}`;
}

function warnMark(flag: boolean): string {
  return flag ? ' ⚠' : '';
}

function parseArgs(argv: string[]): { compare: string | null } {
  const i = argv.indexOf('--compare');
  if (i < 0) return { compare: null };
  const file = argv[i + 1];
  if (!file || file.startsWith('--')) {
    console.error('Usage: npm run bench -- --compare <file.json>');
    return { compare: null };
  }
  return { compare: file };
}

function resultsDir(): string {
  return path.join(process.cwd(), 'bench-results');
}

function datedOutPath(generatedAt: Date): string {
  const iso = generatedAt.toISOString().slice(0, 10);
  const dir = resultsDir();
  const base = path.join(dir, `${iso}.json`);
  if (!fs.existsSync(base)) return base;
  const stamp = generatedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(dir, `${stamp}.json`);
}

function coverageOf(
  recommended: ReadonlySet<string>,
  feasible: ReadonlySet<string>,
): Coverage {
  return {
    recommended: recommended.size,
    feasible: feasible.size,
    ratio: ratio(recommended.size, feasible.size),
  };
}

function runBench(): BenchJson {
  const catalogue = loadBenchCatalogue();
  const scenarios = buildScenarios(FIXED_NOW);
  const nouveauIds = nouveauFilmIds(catalogue.programmeWithContext, FIXED_NOW);

  const windowItems = new Map<ScenarioId, DayItem[]>();
  const stock = {} as BenchJson['stock'];
  for (const scenario of scenarios) {
    const items = loadWindowItems(catalogue, scenario);
    windowItems.set(scenario.id, items);
    stock[scenario.id] = stockSnapshot(items, scenario.now);
  }

  const runs: RunRecord[] = [];
  const recommendedVivant = new Set<string>();
  const feasibleVivant = new Set<string>();

  for (const scenario of scenarios) {
    const items = windowItems.get(scenario.id) ?? [];
    const feasible = feasibleItems(items, scenario.now);
    for (const item of feasible) {
      if (isVivantSlot(item)) feasibleVivant.add(workKey(item));
    }

    for (const profile of BENCH_PROFILES) {
      const t0 = performance.now();
      const scored = recommendForProfile(items, profile.state, TOP_N, {
        now: scenario.now,
        nouveauFilmIds: nouveauIds,
      });
      const elapsedMs = performance.now() - t0;
      const listItems = scored.map((s) => s.item);
      for (const item of listItems) {
        if (isVivantSlot(item)) recommendedVivant.add(workKey(item));
      }
      const vivantCount = listItems.filter(isVivantSlot).length;
      const fallbackCount = scored.filter((s) =>
        isFallbackSource(s.reason?.source),
      ).length;
      runs.push({
        profileId: profile.id,
        scenarioId: scenario.id,
        vivantShare: listItems.length ? vivantCount / listItems.length : null,
        diversity: intraListDiversity(listItems),
        calibration: calibrationKl(profile.state, listItems),
        fallbackRate: scored.length ? fallbackCount / scored.length : null,
        elapsedMs,
        list: scored.map(toListRow),
      });
    }
  }

  const byProfile = BENCH_PROFILES.map((profile) => {
    const mine = runs.filter((r) => r.profileId === profile.id);
    return {
      profileId: profile.id,
      label: profile.label,
      vivantShare: mean(mine.map((r) => r.vivantShare)),
      diversity: mean(mine.map((r) => r.diversity)),
      calibration: mean(mine.map((r) => r.calibration)),
      fallbackRate: mean(mine.map((r) => r.fallbackRate)),
      meanElapsedMs: mean(mine.map((r) => r.elapsedMs)) ?? 0,
    };
  });

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      engine: 'recommendForProfile',
      fixedNow: FIXED_NOW.toISOString(),
      windows: Object.fromEntries(
        scenarios.map((s) => [
          s.id,
          { startIso: s.startIso, endIso: s.endIso, definition: s.definition },
        ]),
      ) as BenchJson['meta']['windows'],
      moodVocab: {
        poetique: 'in TASTE_MOODS (16 closed goûts) — no alias needed',
        dansant: 'in TASTE_MOODS (16 closed goûts) — no alias needed',
        sortie:
          'phrase/catalogue slug, not a goût; kept on mix-intense-sortie-festif but not scored',
      },
      thresholds: THRESHOLD,
      catalogue: {
        evenements: catalogue.evenements.length,
        programme: catalogue.programme.length,
        maxIso: catalogue.maxIso,
      },
      vivantRule:
        'slotFormOfItem ∈ {theatre, concert} (festival/enfants follow that resolver; raw form is ignored)',
    },
    profiles: BENCH_PROFILES.map((p) => ({
      id: p.id,
      label: p.label,
      group: p.group,
      notes: p.notes,
    })),
    scenarios,
    stock,
    runs,
    byProfile,
    global: {
      coverage: coverageOf(recommendedVivant, feasibleVivant),
      vivantShare: mean(runs.map((r) => r.vivantShare)),
      fallbackRate: mean(runs.map((r) => r.fallbackRate)),
      meanElapsedMs: mean(runs.map((r) => r.elapsedMs)) ?? 0,
    },
  };
}

function printTable(result: BenchJson): void {
  const date = result.meta.generatedAt.slice(0, 10);
  console.log(`CultureConnect — banc d'essai reco          ${date}`);
  console.log('');
  console.log(
    `fenêtres (Paris, now=${result.meta.fixedNow}):`,
  );
  for (const s of result.scenarios) {
    const st = result.stock[s.id];
    console.log(
      `  ${pad(s.label, 10)} ${s.startIso} → ${s.endIso}   vivant faisable: ${st.vivantWorks} works / ${st.items} rows  (ciné ${st.cineWorks})`,
    );
  }
  console.log('');
  console.log(
    `${pad('profil', 32)} ${pad('vivant%', 8, 'right')} ${pad('divers', 7, 'right')} ${pad('calib', 7, 'right')} ${pad('repli', 7, 'right')}`,
  );
  console.log('-'.repeat(64));
  for (const row of result.byProfile) {
    const flags =
      (row.diversity != null && row.diversity < THRESHOLD.diversity) ||
      (row.fallbackRate != null && row.fallbackRate > THRESHOLD.fallback);
    const line = `${pad(row.label, 32)} ${pad(fmtPct(row.vivantShare, 0), 8, 'right')} ${pad(fmtNum(row.diversity, 2), 7, 'right')} ${pad(fmtNum(row.calibration, 2), 7, 'right')} ${pad(fmtPct(row.fallbackRate, 0), 7, 'right')}${warnMark(flags)}`;
    console.log(line);
  }
  console.log('');
  const cov = result.global.coverage;
  const covWarn = cov.ratio != null && cov.ratio < THRESHOLD.coverage;
  const fbWarn =
    result.global.fallbackRate != null &&
    result.global.fallbackRate > THRESHOLD.fallback;
  console.log(
    `couverture catalogue vivant : ${fmtPct(cov.ratio, 0)}  (${cov.recommended} / ${cov.feasible} items)${warnMark(covWarn)}`,
  );
  console.log(`part de vivant moyenne      : ${fmtPct(result.global.vivantShare, 0)}`);
  console.log(
    `taux de repli global        : ${fmtPct(result.global.fallbackRate, 0)}${warnMark(fbWarn)}`,
  );
  console.log(
    `temps moyen / appel         : ${fmtNum(result.global.meanElapsedMs, 1)} ms`,
  );
  console.log('');
  console.log(
    '⚠ seuils: couverture < 15 % · diversité < 0.3 · repli > 50 %  (exit 0 quand même)',
  );
  console.log(
    'vivant = slotFormOfItem théâtre|concert — pas le champ form brut.',
  );
}

function printTop3(result: BenchJson, profiles: BenchProfile[]): void {
  const dumpIds: ScenarioId[] = ['week', 'month'];
  console.log('');
  console.log('=== Top 3 — semaine & mois (crash-test Eloi) ===');
  console.log(
    'semaine = 7 j. à partir du lundi Paris fixé · mois = 30 j. à partir du même now',
  );
  for (const profile of profiles) {
    console.log('');
    console.log(`— ${profile.label}  [${profile.id}]`);
    if (profile.notes) console.log(`  ${profile.notes}`);
    for (const sid of dumpIds) {
      const run = result.runs.find(
        (r) => r.profileId === profile.id && r.scenarioId === sid,
      );
      const label = sid === 'week' ? 'semaine' : 'mois';
      if (!run) {
        console.log(`  ${label}: (pas de run)`);
        continue;
      }
      console.log(
        `  ${label}  vivant=${fmtPct(run.vivantShare, 0)}  divers=${fmtNum(run.diversity)}  calib=${fmtNum(run.calibration)}  repli=${fmtPct(run.fallbackRate, 0)}  ${fmtNum(run.elapsedMs, 1)}ms`,
      );
      if (run.list.length === 0) {
        console.log('    (liste vide)');
        continue;
      }
      run.list.forEach((row, i) => {
        const slot = row.slot ?? row.form || '?';
        const moods = row.moods.length ? row.moods.join('|') : '—';
        const why = [row.reasonSource, row.reasonPhrase].filter(Boolean).join(' · ');
        console.log(
          `    ${i + 1}. ${row.title}  [${slot}]  ${moods}  — ${why}  (${row.dayIso})`,
        );
      });
    }
  }
}

function loadCompare(file: string): BenchJson | null {
  const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(resolved)) {
    console.error(`--compare: fichier introuvable: ${resolved}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf-8')) as BenchJson;
  } catch (err) {
    console.error(`--compare: JSON illisible (${resolved}):`, err);
    return null;
  }
}

function printCompare(current: BenchJson, previous: BenchJson, file: string): void {
  console.log('');
  console.log(`=== Δ vs ${file}  (${previous.meta.generatedAt.slice(0, 10)}) ===`);
  const prevBy = new Map(previous.byProfile.map((r) => [r.profileId, r]));
  console.log(
    `${pad('profil', 32)} ${pad('Δvivant', 9, 'right')} ${pad('Δdivers', 8, 'right')} ${pad('Δcalib', 8, 'right')} ${pad('Δrepli', 8, 'right')}`,
  );
  console.log('-'.repeat(68));
  for (const row of current.byProfile) {
    const prev = prevBy.get(row.profileId);
    const dV =
      row.vivantShare != null && prev?.vivantShare != null
        ? row.vivantShare - prev.vivantShare
        : null;
    const dD =
      row.diversity != null && prev?.diversity != null
        ? row.diversity - prev.diversity
        : null;
    const dC =
      row.calibration != null && prev?.calibration != null
        ? row.calibration - prev.calibration
        : null;
    const dF =
      row.fallbackRate != null && prev?.fallbackRate != null
        ? row.fallbackRate - prev.fallbackRate
        : null;
    console.log(
      `${pad(row.label, 32)} ${pad(fmtDelta(dV, 1, true), 9, 'right')} ${pad(fmtDelta(dD, 2), 8, 'right')} ${pad(fmtDelta(dC, 2), 8, 'right')} ${pad(fmtDelta(dF, 1, true), 8, 'right')}`,
    );
  }
  const cCov = current.global.coverage.ratio;
  const pCov = previous.global.coverage.ratio;
  const dCov = cCov != null && pCov != null ? cCov - pCov : null;
  const dViv =
    current.global.vivantShare != null && previous.global.vivantShare != null
      ? current.global.vivantShare - previous.global.vivantShare
      : null;
  const dFb =
    current.global.fallbackRate != null && previous.global.fallbackRate != null
      ? current.global.fallbackRate - previous.global.fallbackRate
      : null;
  console.log('');
  console.log(
    `Δ couverture : ${fmtDelta(dCov, 1, true)}   Δ vivant : ${fmtDelta(dViv, 1, true)}   Δ repli : ${fmtDelta(dFb, 1, true)}`,
  );
}

function main(): void {
  const { compare } = parseArgs(process.argv.slice(2));
  const result = runBench();

  printTable(result);
  printTop3(result, BENCH_PROFILES);

  if (compare) {
    const prev = loadCompare(compare);
    if (prev) printCompare(result, prev, compare);
  }

  fs.mkdirSync(resultsDir(), { recursive: true });
  const outPath = datedOutPath(new Date());
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
  console.log('');
  console.log(`JSON archivé : ${path.relative(process.cwd(), outPath)}`);
}

main();
