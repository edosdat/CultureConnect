/**
 * Click-learning signals + aggregated TasteProfile (Phase A, no DB).
 * Guest: sessionStorage / cookie. Logged-in: JWT AccountTasteState.
 */
import {
  mainFromCategorie,
  mainFromGenreSlug,
  type MainCategoryId,
} from '@/lib/categories';
import {
  isTasteMood,
  parsePhraseRules,
  type PhraseForm,
} from '@/lib/phraseTags';
import type { DayItem } from '@/lib/types';

export type SignalKind =
  | 'open_card'
  | 'agenda_add'
  | 'ics'
  | 'reserve'
  | 'chip_time'
  | 'chip_cat'
  | 'chip_genre'
  | 'search'
  | 'tastes_text';

export type Signal = {
  id: string;
  ts: string;
  kind: SignalKind;
  weight: number;
  event_id?: string;
  programme_id?: string;
  film_id?: string;
  lieu_id?: string;
  commune?: string;
  categorie?: string;
  genres: string[];
  moods: string[];
  themes?: string[];
  query?: string;
  chip?: string;
  /** Extra: screening day for « même soirée » scoring. */
  dayIso?: string;
};

export type TasteEntry = { weight: number; pct: number };

export type TasteProfile = {
  cats: Record<string, TasteEntry>;
  moods: Record<string, TasteEntry>;
  genres: Record<string, TasteEntry>;
  themes: Record<string, TasteEntry>;
  communes: Record<string, number>;
};

export type AccountTasteState = {
  signalsRecent: Signal[];
  profile: TasteProfile;
  tastesText?: string;
  tastesSetAt?: string;
};

export type GuestSignalsStore = {
  events: Signal[];
  profile: TasteProfile;
};

export const GUEST_STORAGE_KEY = 'cc_signals_v1';
export const LOGIN_NUDGE_DISMISS_KEY = 'cc_login_nudge_dismissed';
export const GUEST_CAP = 80;
export const ACCOUNT_CAP = 40;
export const DEDUP_MS = 30 * 60 * 1000;
export const COOKIE_MAX_AGE_SEC = 14 * 24 * 60 * 60;

/** Reservation / agenda / ics outrank a fiche open when both exist. */
export const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
  reserve: 5,
  ics: 5,
  agenda_add: 5,
  open_card: 2,
  chip_cat: 1,
  chip_genre: 1,
  search: 1,
  chip_time: 0.5,
  tastes_text: 0.5,
};

const SEARCH_FORM_TO_CAT: Record<Exclude<PhraseForm, 'autre'>, string> = {
  cine: 'cinema',
  theatre: 'theatre_danse',
  concert: 'musique',
  festival: 'festival',
  enfants: 'enfants_famille',
};

/** Search / free-text → closed form / moods / themes / genres (session path). */
export function tagsFromSearchQuery(query: string): {
  form?: PhraseForm;
  moods: string[];
  genres: string[];
  themes: string[];
} {
  const tags = parsePhraseRules(query);
  return {
    form: tags.form,
    moods: [...tags.moods],
    genres: [...tags.genres],
    themes: [...tags.themes],
  };
}

const ACTION_KINDS: ReadonlySet<SignalKind> = new Set([
  'open_card',
  'agenda_add',
  'ics',
  'reserve',
]);

/** Mood lexicon — word match only (no short substring ≤ 3). */
const MOOD_PHRASES = ['science fiction'] as const;
const MOOD_WORDS = [
  'horreur',
  'horror',
  'epouvante',
  'thriller',
  'suspense',
  'polar',
  'comedie',
  'humour',
  'romance',
  'amour',
  'sf',
  'animation',
  'jeunesse',
  'documentaire',
  'docu',
  'retro',
  'patrimoine',
  'classique',
  'festival',
] as const;

export type TrackPayload = {
  kind: SignalKind;
  event_id?: string;
  programme_id?: string;
  film_id?: string;
  lieu_id?: string;
  commune?: string;
  categorie?: string;
  genres?: string[];
  moods?: string[];
  themes?: string[];
  query?: string;
  chip?: string;
  dayIso?: string;
  weight?: number;
};

export function emptyProfile(): TasteProfile {
  return { cats: {}, moods: {}, genres: {}, themes: {}, communes: {} };
}

export function entryWeight(v: number | TasteEntry | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v.weight === "number" && Number.isFinite(v.weight)) return v.weight;
  return 0;
}

export function entryPct(v: number | TasteEntry | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return 0;
  if (typeof v.pct === "number" && Number.isFinite(v.pct)) return v.pct;
  return 0;
}

export function coerceEntry(v: unknown): TasteEntry {
  if (typeof v === "number" && Number.isFinite(v)) {
    return { weight: v, pct: 0 };
  }
  if (v && typeof v === "object") {
    const o = v as { weight?: unknown; pct?: unknown };
    const weight =
      typeof o.weight === "number" && Number.isFinite(o.weight) ? o.weight : 0;
    const pct = typeof o.pct === "number" && Number.isFinite(o.pct) ? o.pct : 0;
    return { weight, pct };
  }
  return { weight: 0, pct: 0 };
}

export function recomputeBucketPcts(
  bucket: Record<string, TasteEntry>,
): Record<string, TasteEntry> {
  let sum = 0;
  for (const entry of Object.values(bucket)) {
    if (entry.weight > 0) sum += entry.weight;
  }
  for (const key of Object.keys(bucket)) {
    const entry = bucket[key]!;
    bucket[key] =
      entry.weight === 0 || sum <= 0
        ? { weight: entry.weight, pct: 0 }
        : { weight: entry.weight, pct: Math.round((100 * entry.weight) / sum) };
  }
  return bucket;
}

function recordNums(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function recordEntries(v: unknown): Record<string, TasteEntry> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, TasteEntry> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!k) continue;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[k] = { weight: raw, pct: 0 };
    } else if (raw && typeof raw === "object") {
      out[k] = coerceEntry(raw);
    }
  }
  return recomputeBucketPcts(out);
}

export function coerceProfile(raw: unknown): TasteProfile {
  if (!raw || typeof raw !== "object") return emptyProfile();
  const o = raw as Partial<TasteProfile>;
  return {
    cats: recordEntries(o.cats),
    moods: recordEntries(o.moods),
    genres: recordEntries(o.genres),
    themes: recordEntries(o.themes),
    communes: recordNums(o.communes),
  };
}

export function recomputeProfilePcts(profile: TasteProfile): TasteProfile {
  recomputeBucketPcts(profile.cats);
  recomputeBucketPcts(profile.moods);
  recomputeBucketPcts(profile.genres);
  recomputeBucketPcts(profile.themes);
  return profile;
}

export function emptyTasteState(): AccountTasteState {
  return { signalsRecent: [], profile: emptyProfile() };
}

export function emptyGuestStore(): GuestSignalsStore {
  return { events: [], profile: emptyProfile() };
}

export function normalizeFr(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’‘]/g, ' ')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[_/]+/g, ' ')
    .replace(/[-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSet(norm: string): Set<string> {
  return new Set(norm.split(/[^a-z0-9]+/i).filter(Boolean));
}

/** Extract moods by whole-word / phrase match (never short substring). */
export function extractMoods(...parts: Array<string | undefined | null>): string[] {
  const joined = parts.filter(Boolean).join(' ');
  const norm = normalizeFr(joined);
  if (!norm) return [];
  const words = wordSet(norm);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const mood of tagsFromSearchQuery(joined).moods) {
    if (!seen.has(mood)) {
      seen.add(mood);
      out.push(mood);
    }
  }
  for (const phrase of MOOD_PHRASES) {
    const pn = normalizeFr(phrase);
    const re = new RegExp(`(?:^|[^a-z0-9])${pn.replace(/ /g, '[\\s-]+')}(?:[^a-z0-9]|$)`);
    if (re.test(norm) && !seen.has(phrase)) {
      seen.add(phrase);
      out.push(phrase);
    }
  }
  for (const mood of MOOD_WORDS) {
    if (words.has(mood) && !seen.has(mood)) {
      seen.add(mood);
      out.push(mood);
    }
  }
  return out;
}

export function signalTarget(s: Pick<Signal, 'film_id' | 'event_id' | 'programme_id' | 'chip' | 'query'>): string {
  return (
    (s.film_id || '').trim() ||
    (s.event_id || '').trim() ||
    (s.programme_id || '').trim() ||
    (s.chip || '').trim() ||
    (s.query || '').trim() ||
    ''
  );
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeSignal(payload: TrackPayload): Signal {
  const kind = payload.kind;
  const weight =
    typeof payload.weight === 'number' ? payload.weight : SIGNAL_WEIGHTS[kind];
  let genres = [
    ...new Set((payload.genres ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean)),
  ];
  let moods = [...new Set(payload.moods ?? [])];
  let themes = [
    ...new Set((payload.themes ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean)),
  ];
  let categorie = payload.categorie;
  if ((kind === 'search' || kind === 'tastes_text') && payload.query) {
    const tags = tagsFromSearchQuery(payload.query);
    moods = [...new Set([...moods, ...tags.moods])];
    genres = [...new Set([...genres, ...tags.genres])];
    themes = [...new Set([...themes, ...tags.themes])];
    if (!categorie && tags.form && tags.form !== 'autre') {
      categorie = SEARCH_FORM_TO_CAT[tags.form];
    }
  }
  const signal: Signal = {
    id: newId(),
    ts: new Date().toISOString(),
    kind,
    weight,
    genres,
    moods,
    themes,
  };
  if (payload.event_id) signal.event_id = payload.event_id;
  if (payload.programme_id) signal.programme_id = payload.programme_id;
  if (payload.film_id) signal.film_id = payload.film_id;
  if (payload.lieu_id) signal.lieu_id = payload.lieu_id;
  if (payload.commune) signal.commune = payload.commune;
  if (categorie) signal.categorie = categorie;
  if (payload.query) signal.query = payload.query;
  if (payload.chip) signal.chip = payload.chip;
  if (payload.dayIso) signal.dayIso = payload.dayIso;
  return signal;
}

/** Same kind + target within 30 min → keep one, weight = max. */
export function dedupAppend(list: Signal[], incoming: Signal, cap: number): Signal[] {
  const target = signalTarget(incoming);
  const incomingTs = Date.parse(incoming.ts) || Date.now();
  let replaced = false;
  const next: Signal[] = [];
  for (const s of list) {
    const same =
      s.kind === incoming.kind &&
      signalTarget(s) === target &&
      Math.abs((Date.parse(s.ts) || 0) - incomingTs) <= DEDUP_MS;
    if (same) {
      if (!replaced) {
        next.push(incoming.weight >= s.weight ? incoming : s);
        replaced = true;
      }
      continue;
    }
    next.push(s);
  }
  if (!replaced) next.push(incoming);
  while (next.length > cap) next.shift();
  return next;
}

export function mergeSignalLists(
  account: Signal[],
  guest: Signal[],
  cap: number,
): Signal[] {
  let out = [...account];
  const sorted = [...guest].sort(
    (a, b) => (Date.parse(a.ts) || 0) - (Date.parse(b.ts) || 0),
  );
  for (const s of sorted) {
    out = dedupAppend(out, s, cap);
  }
  return out;
}

export function addWeight(map: Record<string, TasteEntry>, key: string, w: number) {
  const k = key.trim();
  if (!k || !w) return;
  const cur = coerceEntry(map[k]);
  map[k] = { weight: cur.weight + w, pct: 0 };
  recomputeBucketPcts(map);
}

function addCommuneWeight(map: Record<string, number>, key: string, w: number) {
  const k = key.trim();
  if (!k || !w) return;
  map[k] = (map[k] ?? 0) + w;
}

export function mappedCategorie(raw: string | undefined): MainCategoryId | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return (
    mainFromCategorie(trimmed) ??
    mainFromGenreSlug(trimmed) ??
    (['musique', 'theatre_danse', 'festival', 'cinema', 'expo_patrimoine', 'enfants_famille'].includes(
      trimmed,
    )
      ? (trimmed as MainCategoryId)
      : null)
  );
}

export type ProfileBucket = 'cats' | 'moods' | 'genres' | 'themes';

/** Goût buckets only — cats are not tastes. */
const TASTE_BUCKETS: readonly ProfileBucket[] = ['moods', 'genres', 'themes'];

function copyProfile(profile: TasteProfile): TasteProfile {
  return {
    cats: { ...profile.cats },
    moods: { ...profile.moods },
    genres: { ...profile.genres },
    themes: { ...(profile.themes ?? {}) },
    communes: { ...profile.communes },
  };
}

/** Re-apply keys that were wiped to 0 so recalc/addWeight cannot resurrect them. */
export function overlayZeroWeights(
  next: TasteProfile,
  prev?: TasteProfile | null,
): TasteProfile {
  const out = copyProfile(coerceProfile(next));
  if (!prev) return recomputeProfilePcts(out);
  const prevC = coerceProfile(prev);
  for (const bucket of TASTE_BUCKETS) {
    for (const [key, entry] of Object.entries(prevC[bucket])) {
      if (entry.weight === 0) out[bucket][key] = { weight: 0, pct: 0 };
    }
  }
  return recomputeProfilePcts(out);
}

/**
 * Overlay stored 0s, but skip (and keep/apply) keys incoming is unzeroing (+).
 * incoming weight > 0 wins; incoming 0 (wipe) and absent keys still lose to existing 0.
 */
export function overlayZeroWeightsExceptIncomingPositives(
  next: TasteProfile,
  existing?: TasteProfile | null,
  incoming?: TasteProfile | null,
): TasteProfile {
  const out = copyProfile(coerceProfile(next));
  const incomingC = incoming ? coerceProfile(incoming) : null;
  const existingC = existing ? coerceProfile(existing) : null;
  if (incomingC) {
    for (const bucket of TASTE_BUCKETS) {
      for (const [key, entry] of Object.entries(incomingC[bucket])) {
        if (entry.weight > 0) {
          out[bucket][key] = {
            weight: Math.max(entryWeight(out[bucket][key]), entry.weight),
            pct: 0,
          };
        }
      }
    }
  }
  if (!existingC) return recomputeProfilePcts(out);
  for (const bucket of TASTE_BUCKETS) {
    for (const [key, entry] of Object.entries(existingC[bucket])) {
      if (entry.weight !== 0) continue;
      if (entryWeight(incomingC?.[bucket][key]) > 0) continue;
      out[bucket][key] = { weight: 0, pct: 0 };
    }
  }
  return recomputeProfilePcts(out);
}

/** Keep fused/stored positives that recalc cannot reconstruct (no leftover signals). */
export function unionPositiveWeights(
  base: TasteProfile,
  extra?: TasteProfile | null,
): TasteProfile {
  const out = copyProfile(coerceProfile(base));
  if (!extra) return out;
  const extraC = coerceProfile(extra);
  for (const bucket of TASTE_BUCKETS) {
    for (const [key, entry] of Object.entries(extraC[bucket])) {
      if (!(entry.weight > 0)) continue;
      if (entryWeight(out[bucket][key]) === 0 && out[bucket][key]) continue;
      out[bucket][key] = {
        weight: Math.max(entryWeight(out[bucket][key]), entry.weight),
        pct: 0,
      };
    }
  }
  return out;
}

export function wipeProfileKey(
  profile: TasteProfile,
  bucket: ProfileBucket,
  key: string,
): TasteProfile {
  const k = key.trim();
  const base = coerceProfile(profile);
  if (!k) return copyProfile(base);
  const map = { ...base[bucket], [k]: { weight: 0, pct: 0 } };
  recomputeBucketPcts(map);
  return { ...base, [bucket]: map };
}

export function unzeroProfileKey(
  profile: TasteProfile,
  bucket: ProfileBucket,
  key: string,
): TasteProfile {
  const base = coerceProfile(profile);
  const map = { ...base[bucket] };
  delete map[key];
  recomputeBucketPcts(map);
  return { ...base, [bucket]: map };
}

export function unzeroKeysTouchedBySignal(
  profile: TasteProfile,
  signal: Signal,
): TasteProfile {
  let next = profile;
  // chip_cat is a grid filter, not a goût — do not unzero cats.
  for (const g of signal.genres) next = unzeroProfileKey(next, 'genres', g);
  for (const m of signal.moods) {
    if (!isTasteMood(m)) continue;
    next = unzeroProfileKey(next, 'moods', m);
  }
  for (const th of signal.themes ?? []) next = unzeroProfileKey(next, 'themes', th);
  return next;
}

export function profileHasZeroWeights(profile?: TasteProfile | null): boolean {
  if (!profile) return false;
  const p = coerceProfile(profile);
  for (const bucket of TASTE_BUCKETS) {
    if (Object.values(p[bucket]).some((e) => e.weight === 0)) return true;
  }
  return false;
}

function hasPositiveEntryWeights(map: Record<string, TasteEntry>): boolean {
  return Object.values(map).some((e) => entryWeight(e) > 0);
}

function hasPositiveWeights(map: Record<string, number>): boolean {
  return Object.values(map).some((n) => n > 0);
}

export function applySignalToProfile(profile: TasteProfile, signal: Signal): void {
  const w = signal.weight;
  // cats are not tastes — never addWeight on profile.cats
  for (const g of signal.genres) addWeight(profile.genres, g, w);
  for (const m of signal.moods) {
    if (!isTasteMood(m)) continue;
    addWeight(profile.moods, m, w);
  }
  for (const th of signal.themes ?? []) addWeight(profile.themes, th, w);
  if (signal.commune) addCommuneWeight(profile.communes, signal.commune.trim(), w);
}

export function concatTastesText(
  existing: string | undefined,
  incoming: string | undefined,
): string | undefined {
  const a = (existing || '').trim();
  const b = (incoming || '').trim();
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  if (b.includes(a)) return b;
  if (a.includes(b)) return a;
  return `${a}. ${b}`;
}

export function recalcProfile(
  signals: Signal[],
  tastesText?: string,
): TasteProfile {
  const profile = emptyProfile();
  for (const s of signals) applySignalToProfile(profile, s);
  const text = (tastesText || '').trim();
  if (text) {
    const virtual = makeSignal({
      kind: 'tastes_text',
      query: text,
      genres: [],
      moods: extractMoods(text),
    });
    applySignalToProfile(profile, virtual);
  }
  return profile;
}

export function rebuildTasteState(
  signals: Signal[],
  tastesText?: string,
  tastesSetAt?: string,
  cap = ACCOUNT_CAP,
  prevProfile?: TasteProfile | null,
): AccountTasteState {
  const signalsRecent = signals.slice(-cap);
  const text = (tastesText || '').trim() || undefined;
  // read raw → migrate numbers → union stored positives → overlay 0 LAST
  const prev = prevProfile ? coerceProfile(prevProfile) : null;
  const recalc = recalcProfile(signalsRecent, text);
  const kept = unionPositiveWeights(recalc, prev);
  const profile = overlayZeroWeights(kept, prev);
  profile.cats = {};
  return {
    signalsRecent,
    profile,
    tastesText: text,
    tastesSetAt: text ? tastesSetAt : tastesSetAt,
  };
}

export function parseTasteState(raw: unknown): AccountTasteState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<AccountTasteState>;
  const signals = Array.isArray(o.signalsRecent)
    ? o.signalsRecent.filter(isSignal)
    : [];
  // Migrate leftover numbers → TasteEntry + bucket pcts first (before any overlay).
  const migrated =
    o.profile && typeof o.profile === 'object'
      ? coerceProfile(o.profile)
      : null;
  const profile = migrated ?? recalcProfile(signals, o.tastesText);
  return {
    signalsRecent: signals.slice(-ACCOUNT_CAP),
    profile,
    tastesText: typeof o.tastesText === 'string' ? o.tastesText : undefined,
    tastesSetAt: typeof o.tastesSetAt === 'string' ? o.tastesSetAt : undefined,
  };
}

function isSignal(v: unknown): v is Signal {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<Signal>;
  return (
    typeof s.id === 'string' &&
    typeof s.ts === 'string' &&
    typeof s.kind === 'string' &&
    typeof s.weight === 'number' &&
    Array.isArray(s.genres) &&
    Array.isArray(s.moods)
  );
}

export function parseGuestStore(raw: unknown): GuestSignalsStore {
  if (!raw || typeof raw !== 'object') return emptyGuestStore();
  const o = raw as Partial<GuestSignalsStore>;
  const events = Array.isArray(o.events) ? o.events.filter(isSignal) : [];
  const capped = events.slice(-GUEST_CAP);
  return {
    events: capped,
    // Migrate leftover numbers → TasteEntry + bucket pcts first (before any overlay).
    profile:
      o.profile && typeof o.profile === 'object'
        ? coerceProfile(o.profile)
        : recalcProfile(capped),
  };
}

export function isCinemaSignal(s: Signal): boolean {
  if (s.film_id) return true;
  const main = mappedCategorie(s.categorie);
  if (main === 'cinema') return true;
  return s.genres.some((g) => mainFromGenreSlug(g) === 'cinema');
}

export function hasActionSignals(signals: Signal[]): boolean {
  return signals.some((s) => ACTION_KINDS.has(s.kind));
}

/** Cinema share of open_card + agenda + reserve (+ ics) weights. */
export function cinemaActionShare(signals: Signal[]): number {
  let cine = 0;
  let total = 0;
  for (const s of signals) {
    if (!ACTION_KINDS.has(s.kind)) continue;
    total += s.weight;
    if (isCinemaSignal(s)) cine += s.weight;
  }
  if (total <= 0) return 0;
  return cine / total;
}

/** Distinct cinema fiches (open_card targets). */
export function cineFicheCount(signals: Signal[]): number {
  const seen = new Set<string>();
  for (const s of signals) {
    if (s.kind !== 'open_card') continue;
    if (!isCinemaSignal(s)) continue;
    const t = signalTarget(s) || s.id;
    seen.add(t);
  }
  return seen.size;
}

export function lastOpenCardDayIso(signals: Signal[]): string | undefined {
  for (let i = signals.length - 1; i >= 0; i--) {
    const s = signals[i]!;
    if (s.kind === 'open_card' && s.dayIso) return s.dayIso;
  }
  return undefined;
}

/** 2 open_card OR 1 agenda/ics/reserve → header micro-prompt. */
export function shouldPromptLogin(signals: Signal[]): boolean {
  let opens = 0;
  const openTargets = new Set<string>();
  for (const s of signals) {
    if (s.kind === 'agenda_add' || s.kind === 'ics' || s.kind === 'reserve') {
      return true;
    }
    if (s.kind === 'open_card') {
      const t = signalTarget(s) || s.id;
      if (!openTargets.has(t)) {
        openTargets.add(t);
        opens += 1;
        if (opens >= 2) return true;
      }
    }
  }
  return false;
}

export function userMentionedGuinguette(state: AccountTasteState): boolean {
  const text = normalizeFr(
    [
      state.tastesText ?? '',
      ...state.signalsRecent.map((s) =>
        [s.chip, s.query, s.genres.join(' ')].filter(Boolean).join(' '),
      ),
    ].join(' '),
  );
  if (!text) return false;
  const words = wordSet(text);
  return (
    words.has('guinguette') ||
    words.has('guinguettes') ||
    words.has('bal') ||
    words.has('sortie') ||
    words.has('sorties') ||
    state.signalsRecent.some((s) =>
      s.genres.includes('guinguette_sorties') || s.chip === 'guinguette_sorties',
    )
  );
}

function splitSlugs(raw: string | undefined | null): string[] {
  return String(raw || '')
    .split(/[,;/|]+/)
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
}

export function themesFromDayItem(item: DayItem): string[] {
  const raw =
    item.kind === 'programme'
      ? [item.programme.themes, item.evenement?.themes ?? '']
      : [item.evenement.themes];
  return [...new Set(raw.flatMap(splitSlugs))];
}

export function genresFromDayItem(item: DayItem): string[] {
  const raw =
    item.kind === 'programme'
      ? [item.programme.genre, item.evenement?.genre ?? '']
      : [item.evenement.genre];
  return [...new Set(raw.flatMap(splitSlugs))];
}

export function categorieFromDayItem(item: DayItem): string {
  const raw =
    item.kind === 'programme'
      ? (item.evenement?.categorie || '').trim()
      : (item.evenement.categorie || '').trim();
  const mapped = mappedCategorie(raw);
  if (mapped) return mapped;
  const genres = genresFromDayItem(item);
  for (const g of genres) {
    const fromG = mainFromGenreSlug(g);
    if (fromG) return fromG;
  }
  return raw;
}

export function moodSourceFromDayItem(item: DayItem): string {
  if (item.kind === 'programme') {
    return [
      item.programme.nom_item,
      item.programme.genre,
      item.programme.notes,
      item.programme.description_item,
      item.evenement?.titre,
      item.evenement?.genre,
      item.evenement?.categorie,
      item.evenement?.description_courte,
      item.evenement?.description_longue,
      item.evenement?.tags,
    ]
      .filter(Boolean)
      .join(' ');
  }
  return [
    item.evenement.titre,
    item.evenement.genre,
    item.evenement.categorie,
    item.evenement.description_courte,
    item.evenement.description_longue,
    item.evenement.tags,
  ]
    .filter(Boolean)
    .join(' ');
}

export function payloadFromDayItem(
  item: DayItem,
  kind: Extract<SignalKind, 'open_card' | 'agenda_add' | 'ics' | 'reserve'>,
): TrackPayload {
  const genres = genresFromDayItem(item);
  const moods = extractMoods(moodSourceFromDayItem(item), genres.join(' '));
  const themes = themesFromDayItem(item);
  const categorie = categorieFromDayItem(item);
  const payload: TrackPayload = {
    kind,
    genres,
    moods,
    themes,
    commune: item.lieu?.commune?.trim() || undefined,
    lieu_id: item.lieu?.lieu_id || undefined,
    dayIso: item.dayIso,
  };
  // open_card: moods/genres/themes of the fiche, not categorie (not a goût).
  if (kind !== 'open_card') payload.categorie = categorie || undefined;
  if (item.kind === 'programme') {
    payload.programme_id = item.programme.programme_id || undefined;
    payload.event_id =
      item.programme.event_id || item.evenement?.event_id || undefined;
    payload.film_id = (item.programme.film_id || '').trim() || undefined;
    if (!payload.lieu_id) payload.lieu_id = item.programme.lieu_id || undefined;
  } else {
    payload.event_id = item.evenement.event_id || undefined;
  }
  return payload;
}

export function hasScorableState(state: AccountTasteState | null | undefined): boolean {
  if (!state) return false;
  const p = state.profile;
  if ((state.tastesText || '').trim()) return true;
  const hasTasteMood = Object.entries(p.moods).some(
    ([key, e]) => isTasteMood(key) && entryWeight(e) > 0,
  );
  return (
    hasTasteMood ||
    hasPositiveEntryWeights(p.genres) ||
    hasPositiveEntryWeights(p.themes) ||
    hasPositiveWeights(p.communes)
  );
}

export function profileMaxWeight(profile: TasteProfile): number {
  const all = [
    ...Object.values(profile.cats).map(entryWeight),
    ...Object.values(profile.moods).map(entryWeight),
    ...Object.values(profile.genres).map(entryWeight),
    ...Object.values(profile.themes ?? {}).map(entryWeight),
    ...Object.values(profile.communes),
  ];
  let max = 1;
  for (const n of all) {
    if (n > max) max = n;
  }
  return max;
}
