/**
 * Pour toi chips + reason line + phrase → chip signal.
 * Phrase mapping uses parsePhraseRules (same dico as the search phrase).
 */
import type { MainCategoryId } from '@/lib/categories';
import {
  canonicalTasteMood,
  isTasteMood,
  normalizePhrase,
  parsePhraseRules,
  TASTE_MOODS,
  tasteMoodsOf,
  type PhraseForm,
  type TasteMood,
} from '@/lib/phraseTags';
import {
  SIGNAL_WEIGHTS,
  cineFicheCount,
  entryPct,
  entryWeight,
  isCatTasteKey,
  mappedCategorie,
  type AccountTasteState,
  type ProfileBucket,
  type Signal,
  type TasteEntry,
  type TasteProfile,
  type TrackPayload,
} from '@/lib/signals';

const FORM_TO_CAT: Record<Exclude<PhraseForm, 'autre'>, MainCategoryId> = {
  cine: 'cinema',
  theatre: 'theatre_danse',
  concert: 'musique',
  festival: 'festival',
  enfants: 'enfants_famille',
};

const CAT_CHIP_LABELS: Record<string, string> = {
  cinema: 'Cinéma',
  theatre_danse: 'Théâtre',
  musique: 'Musique',
  festival: 'Festival',
  expo_patrimoine: 'Expo',
  enfants_famille: 'Famille',
};

const CAT_REASON_LABELS: Record<string, string> = {
  cinema: 'ciné',
  theatre_danse: 'théâtre',
  musique: 'musique',
  festival: 'festival',
  expo_patrimoine: 'expo',
  enfants_famille: 'famille',
};

/**
 * Display-only FR labels for the 16 locked taste moods.
 * Overlay + reco why-lines. Never a 17th. Slugs / scoring unchanged.
 */
export const TASTE_MOOD_LABELS_FR: Record<TasteMood, string> = {
  rigolo: 'Rire',
  tendre: 'Tendre',
  intense: 'Intense',
  angoissant: 'Angoissant',
  epique: 'Épique',
  brutal: 'Brutal',
  festif: 'Festif',
  cerveau: 'Cerveau',
  intimiste: 'Intimiste',
  absurde: 'Absurde',
  critique: 'Satirique',
  sombre: 'Sombre',
  poetique: 'Poétique',
  dansant: 'Dansant',
  contemplatif: 'Contemplatif',
  leger: 'Léger',
};

/** Display label for a locked mood slug, or null. Never invents a 17th. */
export function labelTasteMood(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  if (!isTasteMood(key)) return null;
  return TASTE_MOOD_LABELS_FR[key as TasteMood];
}

const GENRE_CHIP_LABELS: Record<string, string> = {
  funk: 'Funk',
  jazz: 'Jazz',
  jazz_blues: 'Jazz',
  histoire: 'Histoire',
  famille: 'Famille',
  humour: 'Humour',
  comedie: 'Comédie',
  retro: 'Rétro',
  patrimoine_retro: 'Rétro',
  animation_jeune_public: 'Animation jeune public',
};

export type ProfileChip = {
  bucket: ProfileBucket;
  key: string;
  label: string;
  weight: number;
  pct: number;
};

function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function labelProfileChip(bucket: ProfileBucket, key: string): string {
  if (bucket === 'cats') return CAT_CHIP_LABELS[key] ?? humanizeKey(key);
  if (bucket === 'moods') return labelTasteMood(key) ?? humanizeKey(key);
  return GENRE_CHIP_LABELS[key] ?? humanizeKey(key);
}

const TASTE_SHEET_BUCKETS: readonly ProfileBucket[] = ['moods', 'genres', 'themes'];

/** Fy — Ambiances / Genres / Thèmes only. Never read profile.cats. */
export function profileChips(
  profile?: TasteProfile | null,
  max = 8,
): ProfileChip[] {
  if (!profile) return [];
  const raw: ProfileChip[] = [];
  const foldedMoods = new Map<
    TasteMood,
    { weight: number; pct: number }
  >();
  const foldMood = (key: string, entry: TasteEntry) => {
    const canon = canonicalTasteMood(key);
    if (!canon) return;
    const weight = entryWeight(entry);
    if (weight <= 0) return;
    const prev = foldedMoods.get(canon);
    if (!prev || weight > prev.weight) {
      foldedMoods.set(canon, { weight, pct: entryPct(entry) });
    }
  };
  for (const [key, entry] of Object.entries(profile.moods ?? {})) {
    foldMood(key, entry);
  }
  // Mood slugs leaked into genres/themes still belong in Ambiances.
  for (const bucket of ['genres', 'themes'] as const) {
    for (const [key, entry] of Object.entries(profile[bucket] ?? {})) {
      if (isTasteMood(key)) foldMood(key, entry);
    }
  }
  // Product lock: all 16 locked Ambiances, including 0% / absent (Neon).
  for (const key of TASTE_MOODS) {
    const hit = foldedMoods.get(key);
    raw.push({
      bucket: 'moods',
      key,
      label: labelTasteMood(key) ?? key,
      weight: hit?.weight ?? 0,
      pct: hit?.pct ?? 0,
    });
  }
  const pushOther = (
    bucket: Exclude<ProfileBucket, 'cats' | 'moods'>,
    map?: Record<string, TasteEntry>,
  ) => {
    for (const [key, entry] of Object.entries(map ?? {})) {
      const weight = entryWeight(entry);
      if (weight <= 0 || !key || isCatTasteKey(key)) continue;
      // Locked taste moods render under Ambiances only.
      if (isTasteMood(key)) continue;
      raw.push({
        bucket,
        key,
        label: labelProfileChip(bucket, key),
        weight,
        pct: entryPct(entry),
      });
    }
  };
  pushOther('genres', profile.genres);
  pushOther('themes', profile.themes);
  // Dedup festival/Festival within a bucket. Never drop a locked mood.
  const byLabel = new Map<string, ProfileChip>();
  for (const row of raw) {
    if (row.bucket === 'moods') {
      byLabel.set(`moods:${row.key}`, row);
      continue;
    }
    const k = `${row.bucket}:${normalizePhrase(row.label)}`;
    const prev = byLabel.get(k);
    if (!prev || row.pct > prev.pct) byLabel.set(k, row);
  }
  const out = [...byLabel.values()];
  out.sort((a, b) => {
    const bi =
      TASTE_SHEET_BUCKETS.indexOf(a.bucket) -
      TASTE_SHEET_BUCKETS.indexOf(b.bucket);
    if (bi !== 0) return bi;
    return b.pct - a.pct || a.label.localeCompare(b.label, 'fr');
  });
  return out.slice(0, Math.max(0, max));
}

export const SHEET_BUCKET_TITLES: { bucket: ProfileBucket; title: string }[] = [
  { bucket: 'moods', title: 'Ambiances' },
  { bucket: 'genres', title: 'Genres' },
  { bucket: 'themes', title: 'Thèmes' },
];

export type SheetProfileSource = {
  profile: TasteProfile | null;
  pending: boolean;
};

function positiveSheetRows(profile?: TasteProfile | null): number {
  return profileChips(profile, 64).filter((c) => c.weight > 0).length;
}

/**
 * Overlay rows: JWT/account first (16 Ambiances always, plus non-zero
 * genres/thèmes), then display cache, then guest. Pending only while loading
 * with no cache — Ambiances still paint 16 rows at 0% once a profile exists.
 */
export function resolveSheetProfile(opts: {
  sessionStatus: 'loading' | 'authenticated' | 'unauthenticated';
  accountProfile?: TasteProfile | null;
  guestProfile?: TasteProfile | null;
  cachedAccount?: TasteProfile | null;
}): SheetProfileSource {
  const accountRows = positiveSheetRows(opts.accountProfile);
  const cachedRows = positiveSheetRows(opts.cachedAccount);
  if (opts.sessionStatus === 'authenticated') {
    if (accountRows > 0) {
      return { profile: opts.accountProfile ?? null, pending: false };
    }
    if (cachedRows > 0) {
      return { profile: opts.cachedAccount ?? null, pending: false };
    }
    return { profile: opts.accountProfile ?? opts.guestProfile ?? null, pending: false };
  }
  if (opts.sessionStatus === 'loading') {
    if (cachedRows > 0) {
      return { profile: opts.cachedAccount ?? null, pending: false };
    }
    if (accountRows > 0) {
      return { profile: opts.accountProfile ?? null, pending: false };
    }
    return { profile: null, pending: true };
  }
  return { profile: opts.guestProfile ?? null, pending: false };
}

const CINEMA_EXACT = new Set(['cinema', 'cine', 'ciné', 'cinéma']);

/** Same phrase dico → chip signal. Unknown word → null (no invented chip). */
export function phraseToTrackPayload(text: string): TrackPayload | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  const norm = normalizePhrase(raw);
  if (CINEMA_EXACT.has(norm) || CINEMA_EXACT.has(raw.toLowerCase())) {
    return {
      kind: 'chip_cat',
      categorie: 'cinema',
      chip: 'cinema',
      genres: [],
      moods: [],
    };
  }
  const tags = parsePhraseRules(raw);
  const cat =
    tags.form && tags.form !== 'autre' ? FORM_TO_CAT[tags.form] : undefined;
  const moods = tasteMoodsOf(tags.moods);
  const genres = [...new Set([...tags.genres, ...tags.themes])];
  if (!cat && moods.length === 0 && genres.length === 0) return null;
  if (cat && moods.length === 0 && genres.length === 0) {
    return { kind: 'chip_cat', categorie: cat, chip: cat, genres: [], moods: [] };
  }
  if (cat) {
    return { kind: 'chip_cat', categorie: cat, chip: cat, genres, moods };
  }
  return {
    kind: 'chip_genre',
    genres,
    moods,
    chip: genres[0] || moods[0],
  };
}

function strongestSignal(signals: Signal[]): Signal | null {
  if (signals.length === 0) return null;
  let best = signals[0]!;
  let bestW = SIGNAL_WEIGHTS[best.kind] ?? best.weight;
  let bestTs = Date.parse(best.ts) || 0;
  for (let i = 1; i < signals.length; i++) {
    const s = signals[i]!;
    const w = SIGNAL_WEIGHTS[s.kind] ?? s.weight;
    const ts = Date.parse(s.ts) || 0;
    if (w > bestW || (w === bestW && ts >= bestTs)) {
      best = s;
      bestW = w;
      bestTs = ts;
    }
  }
  return best;
}

export function reasonLineForState(
  state: AccountTasteState | null,
  guestEvents?: Signal[],
): string {
  const signals =
    state?.signalsRecent && state.signalsRecent.length > 0
      ? state.signalsRecent
      : (guestEvents ?? []);
  const best = strongestSignal(signals);
  if (!best) return 'D’après tes derniers clics';

  if (best.kind === 'open_card') {
    const main = mappedCategorie(best.categorie);
    if (main === 'theatre_danse') return 'D’après tes derniers clics';
    if (main === 'cinema' || best.film_id) return 'D’après tes derniers clics';
    if (state && cineFicheCount(state.signalsRecent) >= 1) {
      return 'D’après tes derniers clics';
    }
    return 'D’après tes derniers clics';
  }
  if (
    best.kind === 'reserve' ||
    best.kind === 'agenda_add' ||
    best.kind === 'ics' ||
    best.kind === 'favorite' ||
    best.kind === 'outbound_click' ||
    best.kind === 'share'
  ) {
    return 'D’après tes derniers clics';
  }
  if (best.kind === 'chip_cat' || best.kind === 'search') {
    return 'D’après tes derniers clics';
  }
  return 'D’après tes derniers clics';
}
