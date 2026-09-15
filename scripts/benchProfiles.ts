/**
 * Synthetic AccountTasteState profiles for the reco crash-test bench.
 *
 * Closed vocab: Matching A scores the 16 `TASTE_MOODS` only.
 * `poetique` and `dansant` are in that set (and in the live biblio) — no alias
 * mapping. `sortie` is a catalogue/phrase slug, not a goût: the engine ignores
 * it (`isTasteMood('sortie') === false`). The mixed profile that lists
 * « intense 50 / sortie 30 / festif 20 » keeps `sortie` as specified; only
 * intense + festif are scorable.
 */
import {
  applySignalToProfile,
  emptyProfile,
  emptyTasteState,
  makeSignal,
  recomputeProfilePcts,
  type AccountTasteState,
  type TasteProfile,
} from '../src/lib/signals';

export type BenchProfileGroup = 'mono' | 'mixed' | 'genres' | 'edge';

export type BenchProfile = {
  id: string;
  /** Short label for the terminal table (French, as in the brief). */
  label: string;
  group: BenchProfileGroup;
  /** Vocab / scoring notes for the JSON archive and Top 3 dump. */
  notes: string;
  state: AccountTasteState;
};

function weightsToEntries(
  weights: Record<string, number>,
): Record<string, { weight: number; pct: number }> {
  const out: Record<string, { weight: number; pct: number }> = {};
  for (const [key, weight] of Object.entries(weights)) {
    if (!(weight > 0)) continue;
    out[key] = { weight, pct: 0 };
  }
  return out;
}

/** Build a taste state from raw bucket weights; pcts are renormalized. */
export function stateFromWeights(opts: {
  moods?: Record<string, number>;
  genres?: Record<string, number>;
  themes?: Record<string, number>;
  tastesText?: string;
}): AccountTasteState {
  const profile: TasteProfile = {
    ...emptyProfile(),
    moods: weightsToEntries(opts.moods ?? {}),
    genres: weightsToEntries(opts.genres ?? {}),
    themes: weightsToEntries(opts.themes ?? {}),
  };
  recomputeProfilePcts(profile);
  return {
    signalsRecent: [],
    profile,
    ...(opts.tastesText
      ? { tastesText: opts.tastesText, tastesSetAt: '2026-09-01T10:00:00.000Z' }
      : {}),
  };
}

function mono(mood: string, label: string, extraNotes = ''): BenchProfile {
  return {
    id: `mono-${mood}`,
    label,
    group: 'mono',
    notes: extraNotes || `Mono-ambiance ${mood} 100 % (TASTE_MOODS).`,
    state: stateFromWeights({
      moods: { [mood]: 100 },
      tastesText: `j’aime ${mood}`,
    }),
  };
}

/** One open_card signal — the « un seul signal » edge case. */
function singleSignalRigolo(): AccountTasteState {
  const profile = emptyProfile();
  const signal = makeSignal({
    kind: 'open_card',
    moods: ['rigolo'],
    genres: [],
    event_id: 'bench-signal-rigolo',
    programme_id: 'bench-signal-rigolo-p',
  });
  applySignalToProfile(profile, signal);
  recomputeProfilePcts(profile);
  return { signalsRecent: [signal], profile };
}

/**
 * ~20 crash-test users. Add new ones here; `recoBench.ts` just iterates.
 */
export const BENCH_PROFILES: BenchProfile[] = [
  // --- mono-ambiance (brief §4.2) ---
  mono('rigolo', 'rigolo 100'),
  mono('intimiste', 'intimiste 100'),
  mono('intense', 'intense 100'),
  mono('festif', 'festif 100'),
  mono(
    'poetique',
    'poetique 100',
    'poetique is in TASTE_MOODS / live biblio — no alias.',
  ),
  mono('cerveau', 'cerveau 100'),
  mono(
    'dansant',
    'dansant 100',
    'dansant is in TASTE_MOODS / live biblio — no alias.',
  ),

  // --- mixed ---
  {
    id: 'mix-rigolo-tendre',
    label: 'rigolo 70 / tendre 30',
    group: 'mixed',
    notes: 'Two-mood mix from the brief.',
    state: stateFromWeights({ moods: { rigolo: 70, tendre: 30 } }),
  },
  {
    id: 'mix-intense-sortie-festif',
    label: 'intense 50 / sortie 30 / festif 20',
    group: 'mixed',
    notes:
      'sortie is a phrase/catalogue slug, not a goût — Matching A does not score it. Scorable mix is intense + festif.',
    state: stateFromWeights({
      moods: { intense: 50, sortie: 30, festif: 20 },
    }),
  },
  {
    id: 'mix-poetique-contemplatif-tendre',
    label: 'poetique / contemplatif / tendre',
    group: 'mixed',
    notes: 'Three closed moods, including poetique (in biblio).',
    state: stateFromWeights({
      moods: { poetique: 40, contemplatif: 40, tendre: 20 },
    }),
  },
  {
    id: 'mix-festif-dansant',
    label: 'festif 50 / dansant 50',
    group: 'mixed',
    notes: 'Party / dance floor mix. dansant is a closed goût.',
    state: stateFromWeights({ moods: { festif: 50, dansant: 50 } }),
  },
  {
    id: 'mix-leger-absurde',
    label: 'leger 60 / absurde 40',
    group: 'mixed',
    notes: 'Light + absurde mix.',
    state: stateFromWeights({ moods: { leger: 60, absurde: 40 } }),
  },

  // --- with genres (form cloisonnement) ---
  {
    id: 'genre-theatre-humour',
    label: 'théâtre · rigolo + standup',
    group: 'genres',
    notes: 'Theatre/humour cloisonnement: mood rigolo + genre standup.',
    state: stateFromWeights({
      moods: { rigolo: 80 },
      genres: { standup: 40, humour_standup: 20 },
    }),
  },
  {
    id: 'genre-cine-thriller',
    label: 'ciné · intense + thriller',
    group: 'genres',
    notes: 'Cinema thriller: mood intense + genre thriller.',
    state: stateFromWeights({
      moods: { intense: 80 },
      genres: { thriller: 50 },
    }),
  },
  {
    id: 'genre-concert-electro',
    label: 'concert · dansant + electro',
    group: 'genres',
    notes: 'Music cloisonnement: mood dansant + genre electro.',
    state: stateFromWeights({
      moods: { dansant: 70 },
      genres: { electro: 50 },
    }),
  },
  {
    id: 'genre-cine-comedie',
    label: 'ciné · rigolo + comedie',
    group: 'genres',
    notes: 'Cinema comedy: mood rigolo + genre comedie.',
    state: stateFromWeights({
      moods: { rigolo: 70 },
      genres: { comedie: 50 },
    }),
  },
  {
    id: 'genre-only-comedie',
    label: 'genre comedie (sans mood)',
    group: 'genres',
    notes: 'Genre-only profile — no moods. Tests form cloisonnement without ambiance.',
    state: stateFromWeights({ genres: { comedie: 100 } }),
  },

  // --- edge cases ---
  {
    id: 'empty',
    label: 'profil vide',
    group: 'edge',
    notes: 'Guest / empty state — engine must fall back (never []).',
    state: emptyTasteState(),
  },
  {
    id: 'single-signal-rigolo',
    label: 'un seul signal',
    group: 'edge',
    notes: 'A single open_card signal with mood rigolo (weight 2).',
    state: singleSignalRigolo(),
  },
  {
    id: 'out-of-stock-moods',
    label: 'cerveau / angoissant / brutal',
    group: 'edge',
    notes:
      'NO_BRIDGE_MOODS mix — often thin vivant stock; expect cine overlap and/or fallback.',
    state: stateFromWeights({
      moods: { cerveau: 40, angoissant: 30, brutal: 30 },
    }),
  },
];
