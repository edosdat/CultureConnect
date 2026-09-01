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
  TASTE_MOODS,
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
  entities?: string[];
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

const ACTION_KINDS: ReadonlySet<SignalKind> = new Set([
  'open_card',
  'agenda_add',
  'ics',
  'reserve',
]);

/** Mood lexicon — word match only (no short substring ≤ 3). */
const MOOD_PHRASES = [
  'science fiction',
  'stand up',
  'one man',
  'one woman',
  'seul en scene',
] as const;
const MOOD_WORDS = [
  ...TASTE_MOODS,
  'horreur',
  'horror',
  'epouvante',
  'thriller',
  'suspense',
  'polar',
  'comedie',
  'comique',
  'humour',
  'standup',
  'sketch',
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
  entities?: string[];
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
  const norm = normalizeFr(parts.filter(Boolean).join(' '));
  if (!norm) return [];
  const words = wordSet(norm);
  const out: string[] = [];
  const seen = new Set<string>();
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

const SEARCH_FORM_TO_CAT: Record<Exclude<PhraseForm, 'autre'>, string> = {
  cine: 'cinema',
  theatre: 'theatre_danse',
  concert: 'musique',
  festival: 'festival',
  enfants: 'enfants_famille',
};

export function makeSignal(payload: TrackPayload): Signal {
  const kind = payload.kind;
  const weight =
    typeof payload.weight === 'number' ? payload.weight : SIGNAL_WEIGHTS[kind];
  let genres = [
    ...new Set((payload.genres ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean)),
  ];
  let moods = [
    ...new Set((payload.moods ?? []).map((m) => m.trim().toLowerCase()).filter(Boolean)),
  ];
  let themes = [
    ...new Set((payload.themes ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean)),
  ];
  let entities = [
    ...new Set((payload.entities ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean)),
  ];
  let categorie = payload.categorie;
  if ((kind === 'search' || kind === 'tastes_text') && payload.query) {
    const tags = parsePhraseRules(payload.query);
    moods = [...new Set([...moods, ...tags.moods])];
    genres = [...new Set([...genres, ...tags.genres])];
    themes = [...new Set([...themes, ...tags.themes])];
    entities = [...new Set([...entities, ...tags.entities])];
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
    entities,
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
  return ingestMapSignal(signal);
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
      if (bucket === 'moods' && !isTasteMood(key)) continue;
      if (isCatTasteKey(key)) continue;
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

/** Main cats are grid filters, never goûts — even if leaked into genres. */
const CAT_TASTE_KEYS = new Set([
  'cinema',
  'cine',
  'ciné',
  'cinéma',
  'theatre_danse',
  'theatre',
  'théâtre',
  'musique',
  'festival',
  'enfants_famille',
  'enfants',
  'expo_patrimoine',
  'expo',
]);

export function isCatTasteKey(key: string): boolean {
  return CAT_TASTE_KEYS.has(key.trim().toLowerCase());
}

/** Grid filters (Cinéma chip stays chip_cat). Not a goût write by themselves. */
export function isTasteWritingSignal(s: Pick<Signal, 'kind'>): boolean {
  return s.kind !== 'chip_cat' && s.kind !== 'chip_time';
}

/**
 * 89-vocab genre slugs written on mapped ingest signals.
 * Mirror of reco CLOSED_GENRES — do not invent free-text genres.
 */
export const TASTE_GENRE_SLUGS = [
  'comedie',
  'drame',
  'thriller',
  'horreur',
  'sf',
  'romance',
  'polar',
  'animation',
  'documentaire',
  'biopic',
  'patrimoine',
  'aventure',
  'action',
  'rock',
  'electro',
  'jazz',
  'hiphop',
  'classique',
  'chanson',
  'funk',
  'metal',
  'world',
  'contemporain',
  'classique_theatre',
  'standup',
  'danse',
  'cirque',
] as const;

const TASTE_GENRE_SET = new Set<string>(TASTE_GENRE_SLUGS);

function uniqueSlugs(xs: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of xs) {
    const s = raw.trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function hasIngestPhrase(norm: string, phrase: string): boolean {
  const p = normalizeFr(phrase);
  if (!p) return false;
  const re = new RegExp(
    `(?:^|[^a-z0-9])${p.replace(/ /g, '[\\s-]+')}(?:[^a-z0-9]|$)`,
  );
  return re.test(norm);
}

/** open_card / reserve / agenda_add always; chip_genre only if moods[] nonempty. */
export function shouldMapTasteIngest(
  kind: SignalKind,
  moods: readonly string[] | undefined | null,
): boolean {
  if (kind === 'open_card' || kind === 'reserve' || kind === 'agenda_add') {
    return true;
  }
  if (kind === 'chip_genre') {
    return (moods ?? []).some((m) => m.trim().length > 0);
  }
  return false;
}

/**
 * Closed MAP then DROP. Moods ⊆ 16; genres ⊆ 89 slugs. Never sortie / cats.
 * Idempotent. Does not invent a 17th mood.
 */
export function mapThenDropTasteTags(
  moods: readonly string[] | undefined | null,
  genres: readonly string[] | undefined | null,
  extraText?: string,
): { moods: string[]; genres: string[] } {
  const srcMoods = uniqueSlugs(moods ?? []);
  const srcGenres = uniqueSlugs(genres ?? []);
  const norm = normalizeFr(
    [...srcMoods, ...srcGenres, extraText ?? ''].filter(Boolean).join(' '),
  );
  const tokens = wordSet(norm);

  const nextMoods: string[] = [];
  const nextGenres: string[] = [];

  for (const m of srcMoods) {
    if (isTasteMood(m)) nextMoods.push(m);
  }
  for (const g of srcGenres) {
    if (TASTE_GENRE_SET.has(g) && !isCatTasteKey(g)) nextGenres.push(g);
  }
  for (const t of tokens) {
    if (isTasteMood(t)) nextMoods.push(t);
    if (TASTE_GENRE_SET.has(t) && !isCatTasteKey(t)) nextGenres.push(t);
  }

  if (['comedie', 'comique', 'humour'].some((t) => tokens.has(t))) {
    nextMoods.push('rigolo');
    nextGenres.push('comedie');
  }
  if (
    tokens.has('standup') ||
    tokens.has('sketch') ||
    hasIngestPhrase(norm, 'stand up') ||
    hasIngestPhrase(norm, 'one man') ||
    hasIngestPhrase(norm, 'one woman') ||
    hasIngestPhrase(norm, 'seul en scene')
  ) {
    nextMoods.push('rigolo');
    nextGenres.push('standup');
  }
  if (tokens.has('horreur') || tokens.has('horror')) {
    nextMoods.push('angoissant');
    nextGenres.push('horreur');
  }
  if (tokens.has('epouvante')) {
    // Biblio: épouvante is not a 89 slug — mood only.
    nextMoods.push('angoissant');
  }
  if (tokens.has('animation') || tokens.has('animations')) {
    nextGenres.push('animation');
  }
  if (tokens.has('patrimoine') || tokens.has('retro')) {
    nextGenres.push('patrimoine');
  }

  return {
    moods: uniqueSlugs(nextMoods).filter((m) => isTasteMood(m)),
    genres: uniqueSlugs(nextGenres).filter(
      (g) =>
        TASTE_GENRE_SET.has(g) &&
        !isCatTasteKey(g) &&
        g !== 'animation_jeune_public' &&
        g !== 'patrimoine_retro',
    ),
  };
}

export function ingestMapSignal<
  T extends Pick<Signal, 'kind' | 'moods' | 'genres'> & {
    chip?: string;
    query?: string;
  },
>(signal: T): T {
  if (!shouldMapTasteIngest(signal.kind, signal.moods)) return signal;
  const mapped = mapThenDropTasteTags(
    signal.moods,
    signal.genres,
    [signal.chip, signal.query].filter(Boolean).join(' '),
  );
  return { ...signal, moods: mapped.moods, genres: mapped.genres };
}

/** L() — moods / genres / themes only. Never increment profile.cats. */
export function applySignalToProfile(profile: TasteProfile, signal: Signal): void {
  const w = signal.weight;
  // cats are not tastes — never addWeight on profile.cats (cinema chip_cat no-op)
  for (const g of signal.genres) {
    if (isCatTasteKey(g)) continue;
    addWeight(profile.genres, g, w);
  }
  for (const m of signal.moods) {
    if (!isTasteMood(m)) continue;
    addWeight(profile.moods, m, w);
  }
  for (const th of signal.themes ?? []) {
    if (isCatTasteKey(th)) continue;
    addWeight(profile.themes, th, w);
  }
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

/**
 * One-shot remap of CURRENT profile.moods keys outside the 16.
 * Same Biblio table as ingest. Does not replay signalsRecent.
 * Weight 0 / already-dropped keys are not invented.
 */
export function migrateStoredMoodKeys(profile: TasteProfile): TasteProfile {
  const src = coerceProfile(profile);
  const out = copyProfile(src);
  for (const [key, entry] of Object.entries(src.moods)) {
    if (isTasteMood(key)) continue;
    delete out.moods[key];
    if (!(entry.weight > 0)) continue;
    const mapped = mapThenDropTasteTags([key], [], key);
    for (const m of mapped.moods) addWeight(out.moods, m, entry.weight);
    for (const g of mapped.genres) addWeight(out.genres, g, entry.weight);
  }
  return out;
}

/** Drop cats, `sortie`, and any non-biblio mood. 16 TASTE_MOODS only. */
export function sanitizeTasteProfile(profile: TasteProfile): TasteProfile {
  const p = migrateStoredMoodKeys(profile);
  p.cats = {};
  for (const key of Object.keys(p.moods)) {
    if (!isTasteMood(key)) delete p.moods[key];
  }
  for (const bucket of ['genres', 'themes'] as const) {
    for (const key of Object.keys(p[bucket])) {
      if (isCatTasteKey(key)) delete p[bucket][key];
    }
  }
  return recomputeProfilePcts(p);
}

export function profileHasPositiveTastes(profile?: TasteProfile | null): boolean {
  if (!profile) return false;
  const p = sanitizeTasteProfile(profile);
  return (
    hasPositiveEntryWeights(p.moods) ||
    hasPositiveEntryWeights(p.genres) ||
    hasPositiveEntryWeights(p.themes)
  );
}

/** Empty / cinema-only guest never passes zv — do not merge, do not wipe. */
export function guestHasMergeableTastes(
  events?: Signal[] | null,
  profile?: TasteProfile | null,
): boolean {
  const rebuilt = rebuildTasteState(
    events ?? [],
    undefined,
    undefined,
    ACCOUNT_CAP,
    profile ?? emptyProfile(),
  );
  return hasScorableState(rebuilt);
}

export function pickRicherTasteState(
  a?: AccountTasteState | null,
  b?: AccountTasteState | null,
): AccountTasteState {
  const aOk = hasScorableState(a);
  const bOk = hasScorableState(b);
  if (aOk && !bOk) return a!;
  if (bOk && !aOk) return b!;
  if (aOk && bOk) {
    const tastesText = concatTastesText(a!.tastesText, b!.tastesText);
    return {
      signalsRecent: mergeSignalLists(a!.signalsRecent, b!.signalsRecent, ACCOUNT_CAP),
      profile: sanitizeTasteProfile(unionPositiveWeights(a!.profile, b!.profile)),
      tastesText,
      tastesSetAt:
        tastesText && tastesText !== a!.tastesText ? b!.tastesSetAt : a!.tastesSetAt,
    };
  }
  return a ?? b ?? emptyTasteState();
}

/**
 * Login merge: never apply empty guest (or chip_cat-only) onto JWT / store.
 * wroteGuest=false → caller must not persist a wipe.
 */
export function resolveLoginMerge(opts: {
  stored: AccountTasteState | null;
  jwt: AccountTasteState;
  guestSignals: Signal[];
  guestProfile?: TasteProfile | null;
  extraText?: string;
}): { state: AccountTasteState; wroteGuest: boolean } {
  const base = pickRicherTasteState(opts.stored, opts.jwt);
  const guestProfile = opts.guestProfile
    ? sanitizeTasteProfile(opts.guestProfile)
    : null;
  const mergeable = guestHasMergeableTastes(opts.guestSignals, guestProfile);
  const tasteSignals = opts.guestSignals.filter(isTasteWritingSignal);
  if (!mergeable && !(opts.extraText || '').trim()) {
    return { state: { ...base, profile: sanitizeTasteProfile(base.profile) }, wroteGuest: false };
  }
  let overlayPrev = base.profile;
  for (const s of tasteSignals) {
    overlayPrev = unzeroKeysTouchedBySignal(overlayPrev, s);
  }
  const tastesText = concatTastesText(base.tastesText, opts.extraText);
  const tastesSetAt =
    tastesText && tastesText !== base.tastesText
      ? new Date().toISOString()
      : base.tastesSetAt;
  let tasteState = rebuildTasteState(
    mergeSignalLists(base.signalsRecent, tasteSignals, ACCOUNT_CAP),
    tastesText,
    tastesSetAt,
    ACCOUNT_CAP,
    overlayPrev,
  );
  if (mergeable && guestProfile) {
    tasteState = {
      ...tasteState,
      profile: sanitizeTasteProfile(
        unionPositiveWeights(tasteState.profile, guestProfile),
      ),
    };
  } else {
    tasteState = {
      ...tasteState,
      profile: sanitizeTasteProfile(tasteState.profile),
    };
  }
  return { state: tasteState, wroteGuest: mergeable };
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
      genres: [],
      moods: extractMoods(text),
    });
    // Genres/cats from free text are applied in reco via the existing pipeline.
    // Still fold moods + obvious tokens into the profile (additive, weight 0.5).
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
  const profile = sanitizeTasteProfile(overlayZeroWeights(kept, prev));
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
  const profile = sanitizeTasteProfile(
    migrated ?? recalcProfile(signals, o.tastesText),
  );
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
        ? sanitizeTasteProfile(coerceProfile(o.profile))
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

export function moodsFromDayItem(item: DayItem): string[] {
  const raw =
    item.kind === 'programme'
      ? [item.programme.moods, item.evenement?.moods ?? '']
      : [item.evenement.moods];
  return [...new Set(raw.flatMap(splitSlugs))];
}

export function genresMoodFromDayItem(item: DayItem): string[] {
  const raw =
    item.kind === 'programme'
      ? [item.programme.genres_mood, item.evenement?.genres_mood ?? '']
      : [item.evenement.genres_mood];
  return [...new Set(raw.flatMap(splitSlugs))];
}

export function moodSourceFromDayItem(item: DayItem): string {
  if (item.kind === 'programme') {
    return [
      item.programme.nom_item,
      item.programme.genre,
      item.programme.moods,
      item.programme.genres_mood,
      item.programme.notes,
      item.programme.description_item,
      item.evenement?.titre,
      item.evenement?.genre,
      item.evenement?.moods,
      item.evenement?.genres_mood,
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
    item.evenement.moods,
    item.evenement.genres_mood,
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
  const genres = [
    ...new Set([...genresFromDayItem(item), ...genresMoodFromDayItem(item)]),
  ];
  const moods = [
    ...new Set([
      ...moodsFromDayItem(item),
      ...extractMoods(moodSourceFromDayItem(item), genres.join(' ')),
    ]),
  ];
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

/** zv — ignores cats. Cinema-only must not count as « has tastes ». */
export function hasScorableState(state: AccountTasteState | null | undefined): boolean {
  if (!state) return false;
  if ((state.tastesText || '').trim()) return true;
  const p = state.profile;
  const moodHit = Object.entries(p.moods ?? {}).some(
    ([k, e]) => isTasteMood(k) && entryWeight(e) > 0,
  );
  const genreHit = Object.entries(p.genres ?? {}).some(
    ([k, e]) => !isCatTasteKey(k) && entryWeight(e) > 0,
  );
  const themeHit = Object.entries(p.themes ?? {}).some(
    ([k, e]) => !isCatTasteKey(k) && entryWeight(e) > 0,
  );
  return moodHit || genreHit || themeHit || hasPositiveWeights(p.communes);
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
