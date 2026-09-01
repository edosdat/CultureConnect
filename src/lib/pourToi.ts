/**
 * Pour toi chips + reason line + phrase → chip signal.
 * Phrase mapping uses parsePhraseRules (same dico as the search phrase).
 */
import type { MainCategoryId } from '@/lib/categories';
import {
  isTasteMood,
  normalizePhrase,
  parsePhraseRules,
  tasteMoodsOf,
  type PhraseForm,
} from '@/lib/phraseTags';
import {
  SIGNAL_WEIGHTS,
  cineFicheCount,
  entryPct,
  entryWeight,
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

const MOOD_CHIP_LABELS: Record<string, string> = {
  rigolo: 'Rire',
  intense: 'Intense',
  tendre: 'Tendre',
  sortie: 'Sortie',
  cerveau: 'Cerveau',
};

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

/** Main cats are not goûts — hide even if they leaked into genres. */
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

function isCatTasteKey(key: string): boolean {
  return CAT_TASTE_KEYS.has(key.trim().toLowerCase());
}

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
  if (bucket === 'moods') return MOOD_CHIP_LABELS[key] ?? humanizeKey(key);
  return GENRE_CHIP_LABELS[key] ?? humanizeKey(key);
}

const TASTE_SHEET_BUCKETS: readonly ProfileBucket[] = ['moods', 'genres', 'themes'];

export function profileChips(
  profile?: TasteProfile | null,
  max = 8,
): ProfileChip[] {
  if (!profile) return [];
  const raw: ProfileChip[] = [];
  const push = (bucket: ProfileBucket, map?: Record<string, TasteEntry>) => {
    for (const [key, entry] of Object.entries(map ?? {})) {
      const weight = entryWeight(entry);
      if (weight <= 0 || !key || isCatTasteKey(key)) continue;
      if (bucket === 'moods' && !isTasteMood(key)) continue;
      raw.push({
        bucket,
        key,
        label: labelProfileChip(bucket, key),
        weight,
        pct: entryPct(entry),
      });
    }
  };
  push('moods', profile.moods);
  push('genres', profile.genres);
  push('themes', profile.themes);
  // Dedup festival/Festival (same human label across keys).
  const byLabel = new Map<string, ProfileChip>();
  for (const row of raw) {
    const k = normalizePhrase(row.label);
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
  if (best.kind === 'reserve' || best.kind === 'agenda_add' || best.kind === 'ics') {
    return 'D’après tes derniers clics';
  }
  if (best.kind === 'chip_cat' || best.kind === 'search') {
    return 'D’après tes derniers clics';
  }
  return 'D’après tes derniers clics';
}
