/**
 * Pour toi chips + reason line + phrase → chip signal.
 * Phrase mapping uses parsePhraseRules (same dico as the search phrase).
 */
import type { MainCategoryId } from '@/lib/categories';
import { parsePhraseRules, type PhraseForm } from '@/lib/phraseTags';
import {
  SIGNAL_WEIGHTS,
  cineFicheCount,
  mappedCategorie,
  type AccountTasteState,
  type ProfileBucket,
  type Signal,
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
  rigolo: 'rire',
  intense: 'intense',
  tendre: 'tendre',
  sortie: 'sortie',
};

const GENRE_CHIP_LABELS: Record<string, string> = {
  funk: 'funk',
  jazz: 'jazz',
  jazz_blues: 'jazz',
  histoire: 'histoire',
  famille: 'famille',
  humour: 'humour',
  cinema: 'Cinéma',
  theatre_danse: 'Théâtre',
};

export type ProfileChip = {
  bucket: ProfileBucket;
  key: string;
  label: string;
  weight: number;
};

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').trim();
}

export function labelProfileChip(bucket: ProfileBucket, key: string): string {
  if (bucket === 'cats') return CAT_CHIP_LABELS[key] ?? humanizeKey(key);
  if (bucket === 'moods') return MOOD_CHIP_LABELS[key] ?? key;
  return GENRE_CHIP_LABELS[key] ?? humanizeKey(key);
}

export function profileChips(
  profile?: TasteProfile | null,
  max = 8,
): ProfileChip[] {
  if (!profile) return [];
  const out: ProfileChip[] = [];
  const push = (bucket: ProfileBucket, map: Record<string, number>) => {
    for (const [key, weight] of Object.entries(map)) {
      if (weight <= 0 || !key) continue;
      out.push({
        bucket,
        key,
        label: labelProfileChip(bucket, key),
        weight,
      });
    }
  };
  push('cats', profile.cats);
  push('moods', profile.moods);
  push('genres', profile.genres);
  out.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label, 'fr'));
  return out.slice(0, Math.max(0, max));
}

/** Same phrase dico → chip signal. Unknown word → null (no invented chip). */
export function phraseToTrackPayload(text: string): TrackPayload | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  const tags = parsePhraseRules(raw);
  const cat =
    tags.form && tags.form !== 'autre' ? FORM_TO_CAT[tags.form] : undefined;
  const moods = [...tags.moods];
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
    if (main === 'theatre_danse') return 'Parce que tu regardes du théâtre';
    if (main === 'cinema' || best.film_id) return 'Parce que tu regardes du ciné';
    if (state && cineFicheCount(state.signalsRecent) >= 1) {
      return 'Parce que tu regardes du ciné';
    }
    return 'D’après tes derniers clics';
  }
  if (best.kind === 'reserve' || best.kind === 'agenda_add' || best.kind === 'ics') {
    return 'Parce que tu as mis ça à l’agenda';
  }
  if (best.kind === 'chip_cat') {
    const main =
      mappedCategorie(best.categorie || best.chip) ??
      best.categorie ??
      best.chip ??
      '';
    const label = CAT_REASON_LABELS[main] ?? (humanizeKey(main) || 'ça');
    return `Parce que tu filtres ${label}`;
  }
  if (best.kind === 'search') {
    const q = (best.query || best.chip || '').trim();
    if (q) return `Parce que tu as cherché « ${q} »`;
  }
  return 'D’après tes derniers clics';
}
