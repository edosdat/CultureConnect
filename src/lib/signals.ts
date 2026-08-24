/**
 * Click-learning signals + aggregated TasteProfile (Phase A, no DB).
 * Guest: sessionStorage / cookie. Logged-in: JWT AccountTasteState.
 */
import {
  mainFromCategorie,
  mainFromGenreSlug,
  type MainCategoryId,
} from '@/lib/categories';
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
  query?: string;
  chip?: string;
  /** Extra: screening day for « même soirée » scoring. */
  dayIso?: string;
};

export type TasteProfile = {
  cats: Record<string, number>;
  genres: Record<string, number>;
  moods: Record<string, number>;
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
  query?: string;
  chip?: string;
  dayIso?: string;
  weight?: number;
};

export function emptyProfile(): TasteProfile {
  return { cats: {}, genres: {}, moods: {}, communes: {} };
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

export function makeSignal(payload: TrackPayload): Signal {
  const kind = payload.kind;
  const weight =
    typeof payload.weight === 'number' ? payload.weight : SIGNAL_WEIGHTS[kind];
  const signal: Signal = {
    id: newId(),
    ts: new Date().toISOString(),
    kind,
    weight,
    genres: [...new Set((payload.genres ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean))],
    moods: [...new Set(payload.moods ?? [])],
  };
  if (payload.event_id) signal.event_id = payload.event_id;
  if (payload.programme_id) signal.programme_id = payload.programme_id;
  if (payload.film_id) signal.film_id = payload.film_id;
  if (payload.lieu_id) signal.lieu_id = payload.lieu_id;
  if (payload.commune) signal.commune = payload.commune;
  if (payload.categorie) signal.categorie = payload.categorie;
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

function addWeight(map: Record<string, number>, key: string, w: number) {
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

export function applySignalToProfile(profile: TasteProfile, signal: Signal): void {
  const w = signal.weight;
  const main = mappedCategorie(signal.categorie);
  if (main) addWeight(profile.cats, main, w);
  for (const g of signal.genres) addWeight(profile.genres, g, w);
  for (const m of signal.moods) addWeight(profile.moods, m, w);
  if (signal.commune) addWeight(profile.communes, signal.commune.trim(), w);
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
): AccountTasteState {
  const signalsRecent = signals.slice(-cap);
  const text = (tastesText || '').trim() || undefined;
  return {
    signalsRecent,
    profile: recalcProfile(signalsRecent, text),
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
  const profile =
    o.profile && typeof o.profile === 'object'
      ? {
          cats: recordNums(o.profile.cats),
          genres: recordNums(o.profile.genres),
          moods: recordNums(o.profile.moods),
          communes: recordNums(o.profile.communes),
        }
      : recalcProfile(signals, o.tastesText);
  return {
    signalsRecent: signals.slice(-ACCOUNT_CAP),
    profile,
    tastesText: typeof o.tastesText === 'string' ? o.tastesText : undefined,
    tastesSetAt: typeof o.tastesSetAt === 'string' ? o.tastesSetAt : undefined,
  };
}

function recordNums(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  }
  return out;
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
    profile:
      o.profile && typeof o.profile === 'object'
        ? {
            cats: recordNums(o.profile.cats),
            genres: recordNums(o.profile.genres),
            moods: recordNums(o.profile.moods),
            communes: recordNums(o.profile.communes),
          }
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
  const categorie = categorieFromDayItem(item);
  const payload: TrackPayload = {
    kind,
    genres,
    moods,
    categorie,
    commune: item.lieu?.commune?.trim() || undefined,
    lieu_id: item.lieu?.lieu_id || undefined,
    dayIso: item.dayIso,
  };
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
  return (
    Object.keys(p.cats).length > 0 ||
    Object.keys(p.genres).length > 0 ||
    Object.keys(p.moods).length > 0 ||
    Object.keys(p.communes).length > 0
  );
}

export function profileMaxWeight(profile: TasteProfile): number {
  const all = [
    ...Object.values(profile.cats),
    ...Object.values(profile.genres),
    ...Object.values(profile.moods),
    ...Object.values(profile.communes),
  ];
  let max = 1;
  for (const n of all) {
    if (n > max) max = n;
  }
  return max;
}
