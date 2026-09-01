import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhraseRules, isTasteMood, TASTE_MOODS } from './phraseTags';
import {
  displayReasonForItem,
  recoWhyForMood,
  shouldShowTop3Section,
  top3GridClass,
  top3Heading,
  visibleTop3Items,
} from './displayHome';
import { pickAussiCeSoir } from './nouveautesCine';
import {
  recommendForProfile,
  recommendSlice,
  slotFormOfItem,
  SLOT_ORDER,
  itemIdentity,
  itemIsUntagged,
  workIdOf,
  densifiedCineSeanceCounts,
} from './reco';
import {
  applySignalToProfile,
  emptyProfile,
  emptyTasteState,
  guestHasMergeableTastes,
  hasScorableState,
  makeSignal,
  resolveLoginMerge,
  sanitizeTasteProfile,
  SIGNAL_WEIGHTS,
} from './signals';
import { profileChips, resolveSheetProfile } from './pourToi';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import type { AccountTasteState, TasteProfile } from './signals';

function lieu(commune = 'Toulouse'): Lieu {
  return {
    lieu_id: 'L1',
    nom: 'Salle',
    type: '',
    adresse: '',
    commune,
    dist_km_capitole: '',
    site_web: '',
    notes: '',
  };
}

function ev(
  p: Partial<Evenement> & Pick<Evenement, 'event_id' | 'categorie' | 'titre'>,
): Evenement {
  return {
    lieu_id: 'L1',
    date_debut: '2026-09-02',
    date_fin: '2026-09-02',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    ...p,
  };
}

function prog(
  p: Partial<ProgrammeItem> & Pick<ProgrammeItem, 'programme_id' | 'event_id' | 'nom_item'>,
): ProgrammeItem {
  return {
    lieu_id: 'L1',
    type_item: '',
    date: '2026-09-02',
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: '',
    artiste_id: '',
    ...p,
  };
}

function item(opts: {
  key: string;
  cat: string;
  day?: string;
  heure?: string;
  eventId?: string;
  filmId?: string;
  moods?: string;
  genre?: string;
  titre?: string;
  commune?: string;
}): DayItem {
  const eventId = opts.eventId ?? opts.key;
  const evenement = ev({
    event_id: eventId,
    categorie: opts.cat,
    titre: opts.titre ?? opts.key,
    genre: opts.genre ?? '',
    moods: opts.moods,
    heure_debut: opts.heure ?? '20:00',
    date_debut: opts.day ?? '2026-09-02',
    date_fin: opts.day ?? '2026-09-02',
  });
  const programme = prog({
    programme_id: `p-${opts.key}`,
    event_id: eventId,
    nom_item: opts.titre ?? opts.key,
    date: opts.day ?? '2026-09-02',
    heure_debut: opts.heure ?? '20:00',
    genre: opts.genre ?? '',
    moods: opts.moods,
    film_id: opts.filmId,
  });
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: opts.day ?? '2026-09-02',
    programme,
    evenement,
    lieu: lieu(opts.commune ?? 'Toulouse'),
  };
}

function profile(partial: Partial<TasteProfile>): TasteProfile {
  return { ...emptyProfile(), ...partial };
}

function state(partial?: Partial<AccountTasteState>): AccountTasteState {
  return { signalsRecent: [], profile: emptyProfile(), ...partial };
}

const NOW = new Date('2026-09-01T12:00:00+02:00');

const TRIO = [
  item({ key: 'cine-a', cat: 'cinema', filmId: 'F1', moods: 'rigolo' }),
  item({ key: 'th-a', cat: 'theatre', moods: 'rigolo', genre: 'humour_standup' }),
  item({ key: 'co-a', cat: 'musique', moods: 'festif', genre: 'electro_techno' }),
];

describe('phrase rules', () => {
  it('parses intimiste and envie de danser', () => {
    assert.deepEqual(parsePhraseRules('un truc intimiste').moods, ['intimiste']);
    assert.deepEqual(parsePhraseRules('envie de danser').moods, ['dansant']);
    assert.equal(isTasteMood('intimiste'), true);
    assert.equal(isTasteMood('dansant'), true);
  });

  it('keeps sortie as a catalog slug, not a goût', () => {
    assert.ok(parsePhraseRules('entre potes').moods.includes('sortie'));
    assert.equal(isTasteMood('sortie'), false);
    assert.equal(TASTE_MOODS.length, 16);
  });
});

describe('recommendForProfile — guest never empty, deterministic', () => {
  it('fills 1+1+1 for an empty profile and never returns []', () => {
    const out = recommendForProfile(TRIO, emptyTasteState(), 3, { now: NOW });
    assert.equal(out.length, 3);
    assert.deepEqual(out.map((s) => slotFormOfItem(s.item)), SLOT_ORDER);
    for (const row of out) {
      assert.notEqual(row.reason?.source, 'profile');
    }
  });

  it('same pool + same now → same 3 keys (guest and signed-in)', () => {
    const guestA = recommendForProfile(TRIO, emptyTasteState(), 3, { now: NOW }).map(
      (s) => s.item.key,
    );
    const guestB = recommendForProfile(TRIO, emptyTasteState(), 3, { now: NOW }).map(
      (s) => s.item.key,
    );
    assert.deepEqual(guestA, guestB);

    const st = state({
      profile: profile({ moods: { intimiste: { weight: 3, pct: 100 } } }),
    });
    const pool = [
      item({ key: 'cine-i', cat: 'cinema', filmId: 'F2', moods: 'intimiste' }),
      item({ key: 'th-i', cat: 'theatre', moods: 'intimiste' }),
      item({ key: 'co-i', cat: 'musique', moods: 'intimiste' }),
    ];
    const a = recommendForProfile(pool, st, 3, { now: NOW }).map((s) => s.item.key);
    const b = recommendForProfile(pool, st, 3, { now: NOW }).map((s) => s.item.key);
    assert.deepEqual(a, b);
  });

  it('one-shot living beats a 40-séance film (rarity 1/freq, not séance popularity)', () => {
    const cineMany = Array.from({ length: 8 }, (_, i) =>
      item({
        key: `cine-${i}`,
        cat: 'cinema',
        filmId: 'F40',
        day: '2026-09-02',
        heure: `1${i}:00`,
      }),
    );
    const pool = [
      ...cineMany,
      item({ key: 'th-one', cat: 'theatre', eventId: 'E-ONE', moods: 'sombre' }),
      item({ key: 'co-one', cat: 'musique', eventId: 'E-CO' }),
    ];
    const out = recommendForProfile(pool, emptyTasteState(), 3, { now: NOW });
    const cine = out.find((s) => slotFormOfItem(s.item) === 'cine');
    assert.ok(cine);
    assert.equal(workIdOf(cine!.item), 'f:F40');
    const theatre = out.find((s) => slotFormOfItem(s.item) === 'theatre');
    assert.equal(theatre?.item.key, 'th-one');
  });

  it('cine cold start = nouveauté × densified séance count (clones collapse)', () => {
    const clones = Array.from({ length: 5 }, (_, i) =>
      item({
        key: `clone-${i}`,
        cat: 'cinema',
        filmId: 'F-CLONE',
        day: '2026-09-02',
        heure: '20:00',
      }),
    );
    const twoSeances = [
      item({
        key: 'few-a',
        cat: 'cinema',
        filmId: 'F-FEW',
        day: '2026-09-02',
        heure: '18:00',
      }),
      item({
        key: 'few-b',
        cat: 'cinema',
        filmId: 'F-FEW',
        day: '2026-09-02',
        heure: '21:00',
      }),
    ];
    const untitled = [
      item({
        key: 'title-a',
        cat: 'cinema',
        titre: 'Sans Id',
        day: '2026-09-02',
        heure: '17:00',
      }),
      item({
        key: 'title-b',
        cat: 'cinema',
        titre: 'Sans Id',
        day: '2026-09-02',
        heure: '19:30',
      }),
    ];
    const counts = densifiedCineSeanceCounts([
      ...clones,
      ...twoSeances,
      ...untitled,
    ]);
    assert.equal(counts.get('f:F-CLONE'), 1);
    assert.equal(counts.get('f:F-FEW'), 2);
    assert.equal(counts.get('t:sans id'), 2);

    const pool = [
      ...clones,
      ...twoSeances,
      item({ key: 'th-x', cat: 'theatre', eventId: 'E-TH' }),
      item({ key: 'co-x', cat: 'musique', eventId: 'E-CO2' }),
    ];
    const out = recommendForProfile(pool, emptyTasteState(), 3, { now: NOW });
    const cine = out.find((s) => slotFormOfItem(s.item) === 'cine');
    assert.equal(workIdOf(cine!.item), 'f:F-FEW');
    assert.equal(cine?.reason?.source, 'popularite');
  });

  it('cine cold start: nouveauté multiplies densified séance count', () => {
    const nouveauTwo = [
      item({
        key: 'new-a',
        cat: 'cinema',
        filmId: 'F-NEW',
        day: '2026-09-02',
        heure: '18:00',
      }),
      item({
        key: 'new-b',
        cat: 'cinema',
        filmId: 'F-NEW',
        day: '2026-09-02',
        heure: '22:00',
      }),
    ];
    const oldThree = ['16:00', '19:00', '23:00'].map((heure, i) =>
      item({
        key: `old-${i}`,
        cat: 'cinema',
        filmId: 'F-OLD',
        day: '2026-09-02',
        heure,
      }),
    );
    const pool = [
      ...nouveauTwo,
      ...oldThree,
      item({ key: 'th-y', cat: 'theatre', eventId: 'E-THY' }),
      item({ key: 'co-y', cat: 'musique', eventId: 'E-COY' }),
    ];
    const out = recommendForProfile(pool, emptyTasteState(), 3, {
      now: NOW,
      nouveauFilmIds: new Set(['F-NEW']),
    });
    const cine = out.find((s) => slotFormOfItem(s.item) === 'cine');
    assert.equal(workIdOf(cine!.item), 'f:F-NEW');
    assert.equal(cine?.reason?.source, 'nouveaute');
  });

  it('empty slot if 0 overlap for a signed-in profile (no stretched angoissant)', () => {
    const st = state({
      profile: profile({
        moods: { angoissant: { weight: 5, pct: 100 } },
      }),
    });
    const pool = [
      item({ key: 'cine-ang', cat: 'cinema', filmId: 'FA', moods: 'angoissant' }),
      item({ key: 'th-fun', cat: 'theatre', moods: 'rigolo' }),
      item({ key: 'co-fun', cat: 'musique', moods: 'festif' }),
    ];
    const out = recommendForProfile(pool, st, 3, { now: NOW });
    assert.ok(out.some((s) => slotFormOfItem(s.item) === 'cine'));
    assert.equal(
      out.find((s) => slotFormOfItem(s.item) === 'theatre'),
      undefined,
    );
  });

  it('does not score sortie', () => {
    const st = state({
      profile: profile({ moods: { sortie: { weight: 9, pct: 100 } } }),
    });
    const out = recommendForProfile(
      [
        item({ key: 'cine-s', cat: 'cinema', filmId: 'FS', moods: 'sortie' }),
        item({ key: 'th-s', cat: 'theatre', moods: 'sortie' }),
        item({ key: 'co-s', cat: 'musique', moods: 'sortie' }),
      ],
      st,
      3,
      { now: NOW },
    );
    assert.equal(out.length, 3);
    for (const row of out) {
      assert.notEqual(row.reason?.source, 'profile');
    }
  });
});

describe('recommendSlice', () => {
  it('dedups top 3 and caps genre at 2, keeps 1 untagged', () => {
    const top3 = TRIO;
    const extra = [
      ...TRIO,
      item({ key: 'j1', cat: 'musique', eventId: 'J1', genre: 'jazz_blues', moods: 'festif' }),
      item({ key: 'j2', cat: 'musique', eventId: 'J2', genre: 'jazz_blues', moods: 'festif' }),
      item({ key: 'j3', cat: 'musique', eventId: 'J3', genre: 'jazz_blues', moods: 'festif' }),
      item({ key: 'r1', cat: 'musique', eventId: 'R1', genre: 'rock_metal_punk', moods: 'intense' }),
      item({ key: 'u1', cat: 'theatre', eventId: 'U1', genre: 'theatre_contemporain' }),
    ];
    const slice = recommendSlice(extra, emptyTasteState(), top3, 6, { now: NOW });
    const ids = new Set(slice.map((s) => itemIdentity(s.item)));
    for (const t of top3) assert.equal(ids.has(itemIdentity(t)), false);
    const jazz = slice.filter(
      (s) => s.item.kind === 'programme' && s.item.programme.genre === 'jazz_blues',
    );
    assert.ok(jazz.length <= 2);
    assert.ok(slice.some((s) => itemIsUntagged(s.item)));
    for (const row of slice) assert.notEqual(row.reason?.source, 'profile');
  });
});

describe('pickAussiCeSoir', () => {
  it('excludes the open item, keeps living, prefers max |Δheure| not adjacent', () => {
    const open = item({
      key: 'film',
      cat: 'cinema',
      filmId: 'F9',
      day: '2026-09-01',
      heure: '20:00',
    });
    const adjacent = item({
      key: 'near',
      cat: 'theatre',
      eventId: 'E-NEAR',
      day: '2026-09-01',
      heure: '20:15',
    });
    const far = item({
      key: 'far',
      cat: 'theatre',
      eventId: 'E-FAR',
      day: '2026-09-01',
      heure: '23:00',
    });
    const cine = item({
      key: 'other-cine',
      cat: 'cinema',
      filmId: 'F8',
      day: '2026-09-01',
      heure: '21:00',
    });
    const picked = pickAussiCeSoir([adjacent, far, cine, open], open, 2);
    assert.ok(picked.every((p) => p.key !== open.key));
    assert.ok(picked.every((p) => p.evenement?.categorie !== 'cinema'));
    assert.equal(picked[0]?.key, 'far');
  });
});

describe('search → existing session profile', () => {
  it('writes parsed tags and does not weight sortie', () => {
    const s = makeSignal({ kind: 'search', query: 'un truc intimiste au theatre' });
    assert.ok(s.moods.includes('intimiste'));
    assert.equal(s.categorie, 'theatre_danse');
    const p = emptyProfile();
    applySignalToProfile(p, makeSignal({ kind: 'search', query: 'entre potes' }));
    assert.equal(p.moods.sortie, undefined);
    assert.ok(SIGNAL_WEIGHTS.reserve > SIGNAL_WEIGHTS.open_card);
  });
});

describe('top 3 adaptive layout', () => {
  it('omits empty slots and does not invent cards to fill 3', () => {
    const two = visibleTop3Items([
      item({ key: 'co-only', cat: 'musique', moods: 'festif' }),
      item({ key: 'th-only', cat: 'theatre', moods: 'tendre' }),
    ]);
    assert.equal(two.length, 2);
    assert.deepEqual(
      two.map((row) => slotFormOfItem(row)),
      ['concert', 'theatre'],
    );

    const one = visibleTop3Items([
      item({ key: 'cine-only', cat: 'cinema', filmId: 'F9', moods: 'rigolo' }),
    ]);
    assert.equal(one.length, 1);
    assert.equal(slotFormOfItem(one[0]!), 'cine');

    const none = visibleTop3Items([
      item({ key: 'expo', cat: 'exposition', moods: 'contemplatif' }),
    ]);
    assert.equal(none.length, 0);
  });

  it('guest reco omits a missing form instead of padding', () => {
    const out = recommendForProfile(
      [item({ key: 'co-only', cat: 'musique', moods: 'festif' })],
      emptyTasteState(),
      3,
      { now: NOW },
    );
    assert.equal(out.length, 1);
    assert.equal(slotFormOfItem(out[0]!.item), 'concert');
  });

  it('hides the section at 0 cards and relayouts 1 / 2 / 3', () => {
    assert.equal(shouldShowTop3Section({ ready: true, wiped: false, cardCount: 0 }), false);
    assert.equal(shouldShowTop3Section({ ready: true, wiped: false, cardCount: 1 }), true);
    assert.equal(shouldShowTop3Section({ ready: false, wiped: false, cardCount: 0 }), true);
    assert.equal(shouldShowTop3Section({ ready: false, wiped: true, cardCount: 0 }), false);
    assert.ok(!top3GridClass(1).includes('grid-cols-2'));
    assert.ok(!top3GridClass(1).includes('lg:grid-cols-3'));
    assert.ok(top3GridClass(2).includes('sm:grid-cols-2'));
    assert.ok(!top3GridClass(2).includes('lg:grid-cols-3'));
    assert.ok(top3GridClass(3).includes('lg:grid-cols-3'));
  });

  it('H2 says Ton top N du moment for 1 / 2 / 3 cards', () => {
    assert.equal(top3Heading(1), 'Ton top 1 du moment');
    assert.equal(top3Heading(2), 'Ton top 2 du moment');
    assert.equal(top3Heading(3), 'Ton top 3 du moment');
    assert.equal(top3Heading(0), 'Ton top 3 du moment');
  });
});

describe('displayReasonForItem — reco why-line only', () => {
  const opts = {
    guest: false,
    tasteState: state({
      profile: profile({ moods: { tendre: { weight: 4, pct: 100 } } }),
    }),
    scope: 'tous' as const,
    commune: 'Toulouse',
  };

  it('uses grammatical French for locked mood overlap', () => {
    const row = item({ key: 'th-t', cat: 'theatre', moods: 'tendre' });
    assert.equal(displayReasonForItem(row, opts), 'parce que tu aimes le tendre');
  });

  it('agrees feminine ambiance (festif → festive)', () => {
    const row = item({ key: 'co-f', cat: 'musique', moods: 'festif' });
    assert.equal(
      displayReasonForItem(row, {
        ...opts,
        tasteState: state({
          profile: profile({ moods: { festif: { weight: 3, pct: 100 } } }),
        }),
      }),
      'parce que tu aimes l’ambiance festive',
    );
  });

  it('maps dansant to envie de danser', () => {
    const row = item({ key: 'co-d', cat: 'musique', moods: 'dansant' });
    assert.equal(
      displayReasonForItem(row, {
        ...opts,
        tasteState: state({
          profile: profile({ moods: { dansant: { weight: 3, pct: 100 } } }),
        }),
      }),
      'parce que tu as envie de danser',
    );
  });

  it('hides malformed mood tiré and does not invent tendre', () => {
    const row = item({ key: 'bad', cat: 'theatre', moods: 'tiré' });
    assert.equal(displayReasonForItem(row, opts), null);
    assert.equal(recoWhyForMood('tiré'), null);
    assert.equal(recoWhyForMood('tire'), null);
  });

  it('does not dump a genre as parce que tu as aimé', () => {
    const row = item({
      key: 'jazz',
      cat: 'musique',
      genre: 'jazz_blues',
      moods: '',
    });
    assert.equal(
      displayReasonForItem(row, {
        ...opts,
        tasteState: state({
          profile: profile({
            genres: { jazz_blues: { weight: 5, pct: 100 } },
          }),
        }),
      }),
      null,
    );
  });

  it('does not fall back to an unmatched profile mood', () => {
    const row = item({ key: 'sombre-show', cat: 'theatre', moods: 'sombre' });
    assert.equal(displayReasonForItem(row, opts), null);
  });

  it('guest never says parce que tu aimes', () => {
    const row = item({ key: 'g', cat: 'theatre', moods: 'tendre' });
    const line = displayReasonForItem(row, {
      ...opts,
      guest: true,
      tasteState: null,
      scope: 'soir',
    });
    assert.equal(line, 'Ce soir à Toulouse');
  });

  it('covers all 16 moods in French, never a raw slug after ambiance', () => {
    const rawAfterAmbiance =
      /ambiance\s+(festif|angoissant|contemplatif|epique|poetique|leger|tiré|tendre|rigolo)\b/;
    const english = /\b(because|like|mood|you)\b/i;
    const rawSlugs =
      /\b(epique|poetique|leger|festif|dansant|contemplatif|angoissant)\b/;
    for (const mood of TASTE_MOODS) {
      const line = recoWhyForMood(mood);
      assert.ok(line, mood);
      assert.ok(!rawAfterAmbiance.test(line!), mood);
      assert.ok(!english.test(line!), mood);
      assert.ok(!rawSlugs.test(line!), mood);
      assert.ok(line!.startsWith('parce que tu '), mood);
    }
    assert.equal(TASTE_MOODS.length, 16);
  });
});

describe('login merge — empty guest must not wipe JWT', () => {
  const sixteen = Object.fromEntries(
    TASTE_MOODS.map((m, i) => [m, { weight: i + 1, pct: 0 }]),
  );

  it('skips empty guest and chip_cat-only', () => {
    assert.equal(guestHasMergeableTastes([], emptyProfile()), false);
    assert.equal(
      guestHasMergeableTastes(
        [makeSignal({ kind: 'chip_cat', chip: 'cinema', categorie: 'cinema' })],
        emptyProfile(),
      ),
      false,
    );
    assert.equal(
      guestHasMergeableTastes([], {
        ...emptyProfile(),
        cats: { cinema: { weight: 3, pct: 100 } },
        moods: { sortie: { weight: 2, pct: 100 } },
      }),
      false,
    );
    assert.equal(
      guestHasMergeableTastes(
        [makeSignal({ kind: 'chip_genre', genres: ['jazz'], moods: [] })],
        emptyProfile(),
      ),
      true,
    );
  });

  it('does not merge empty guest over a 16-mood JWT', () => {
    const jwt = state({
      profile: profile({ moods: sixteen }),
    });
    const emptyStored = state();
    const out = resolveLoginMerge({
      stored: emptyStored,
      jwt,
      guestSignals: [
        makeSignal({ kind: 'chip_cat', chip: 'cinema', categorie: 'cinema' }),
      ],
      guestProfile: emptyProfile(),
    });
    assert.equal(out.wroteGuest, false);
    assert.equal(Object.keys(out.state.profile.cats).length, 0);
    assert.equal(out.state.profile.moods.sortie, undefined);
    for (const mood of TASTE_MOODS) {
      assert.ok((out.state.profile.moods[mood]?.weight ?? 0) > 0, mood);
    }
    assert.equal(
      Object.keys(out.state.profile.moods).filter(
        (k) => (out.state.profile.moods[k]?.weight ?? 0) > 0,
      ).length,
      16,
    );
  });

  it('zv ignores cats — cinema-only is not « has tastes »', () => {
    const cinemaOnly = state({
      profile: profile({
        cats: { cinema: { weight: 9, pct: 100 } },
      }),
    });
    assert.equal(hasScorableState(cinemaOnly), false);
    assert.equal(
      hasScorableState(
        state({
          profile: profile({
            cats: { cinema: { weight: 9, pct: 100 } },
            genres: { cinema: { weight: 4, pct: 100 } },
            moods: { sortie: { weight: 2, pct: 100 } },
          }),
        }),
      ),
      false,
    );
    assert.equal(
      hasScorableState(
        state({
          profile: profile({ moods: { tendre: { weight: 2, pct: 100 } } }),
        }),
      ),
      true,
    );
  });

  it('cinema chip_cat never writes cats or moods', () => {
    const p = emptyProfile();
    applySignalToProfile(
      p,
      makeSignal({
        kind: 'chip_cat',
        chip: 'cinema',
        categorie: 'cinema',
        genres: ['cinema'],
      }),
    );
    assert.deepEqual(p.cats, {});
    assert.deepEqual(p.moods, {});
    assert.deepEqual(p.genres, {});
  });

  it('sanitize drops cats and sortie', () => {
    const clean = sanitizeTasteProfile({
      ...emptyProfile(),
      cats: { cinema: { weight: 4, pct: 100 } },
      moods: {
        tendre: { weight: 2, pct: 50 },
        sortie: { weight: 2, pct: 50 },
      },
      genres: { cinema: { weight: 1, pct: 100 } },
    });
    assert.deepEqual(clean.cats, {});
    assert.equal(clean.moods.sortie, undefined);
    assert.equal(clean.genres.cinema, undefined);
    assert.ok((clean.moods.tendre?.weight ?? 0) > 0);
  });
});

describe('Mes goûts chips — 0 cats, 0 sortie, 16 moods only', () => {
  it('hides cats and sortie; keeps biblio moods', () => {
    const chips = profileChips(
      {
        ...emptyProfile(),
        cats: { cinema: { weight: 9, pct: 100 } },
        moods: {
          tendre: { weight: 3, pct: 50 },
          sortie: { weight: 3, pct: 50 },
          rigolo: { weight: 1, pct: 16 },
        },
        genres: { cinema: { weight: 2, pct: 100 } },
      },
      64,
    );
    assert.equal(chips.some((c) => c.bucket === 'cats'), false);
    assert.equal(
      chips.some((c) => c.key === 'sortie' || /ciné|théâtre|festival/i.test(c.label)),
      false,
    );
    assert.ok(chips.some((c) => c.key === 'tendre'));
    assert.ok(chips.every((c) => c.bucket !== 'moods' || isTasteMood(c.key)));
  });

  it('lists all 16 locked moods when weight>0; empty only if truly 0', () => {
    const sixteen = Object.fromEntries(
      TASTE_MOODS.map((m, i) => [m, { weight: i + 1, pct: 0 }]),
    );
    const chips = profileChips({ ...emptyProfile(), moods: sixteen }, 64);
    assert.equal(chips.filter((c) => c.bucket === 'moods').length, 16);
    assert.ok(chips.every((c) => isTasteMood(c.key) && c.weight > 0));

    const jwtShow = resolveSheetProfile({
      sessionStatus: 'authenticated',
      accountProfile: { ...emptyProfile(), moods: sixteen },
      guestProfile: emptyProfile(),
    });
    assert.equal(jwtShow.pending, false);
    assert.equal(profileChips(jwtShow.profile, 64).length, 16);

    const loadingNoCache = resolveSheetProfile({
      sessionStatus: 'loading',
      accountProfile: null,
      guestProfile: emptyProfile(),
    });
    assert.equal(loadingNoCache.pending, true);

    const loadingCache = resolveSheetProfile({
      sessionStatus: 'loading',
      accountProfile: null,
      guestProfile: emptyProfile(),
      cachedAccount: { ...emptyProfile(), moods: sixteen },
    });
    assert.equal(loadingCache.pending, false);
    assert.equal(profileChips(loadingCache.profile, 64).length, 16);

    const trulyEmpty = resolveSheetProfile({
      sessionStatus: 'authenticated',
      accountProfile: emptyProfile(),
      guestProfile: emptyProfile(),
    });
    assert.equal(trulyEmpty.pending, false);
    assert.equal(profileChips(trulyEmpty.profile, 64).length, 0);
  });
});
