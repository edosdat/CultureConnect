import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePhraseRules,
  isTasteMood,
  recoWhyForMood,
  RECO_WHY_FR,
  TASTE_MOODS,
} from './phraseTags';
import { displayReasonForItem } from './displayHome';
import { pickAussiCeSoir } from './nouveautesCine';
import {
  recommendForProfile,
  recommendSlice,
  recoWhyCopy,
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
  makeSignal,
  SIGNAL_WEIGHTS,
} from './signals';
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
      assert.notEqual(row.reason?.mood, 'sortie');
      assert.equal(recoWhyCopy(row.reason), null);
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
    assert.equal(
      displayReasonForItem(row, opts),
      'parce que tu aimes le tendre',
    );
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
    assert.ok(line && !/parce que tu aimes/i.test(line));
  });

  it('covers all 16 moods in French, never a raw slug after ambiance', () => {
    const rawAfterAmbiance = /ambiance\s+(festif|angoissant|contemplatif|epique|poetique|leger|tiré|tendre|rigolo)\b/;
    const english = /\b(because|like|mood|you)\b/i;
    const rawSlugs = /\b(epique|poetique|leger|festif|dansant|contemplatif|angoissant)\b/;
    const mapKeys = Object.keys(RECO_WHY_FR);
    assert.deepEqual(mapKeys.slice().sort(), TASTE_MOODS.slice().sort());
    assert.equal(mapKeys.length, 16);
    assert.equal('sortie' in RECO_WHY_FR, false);
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

  it('shows no why-line for sortie or an unmapped slug', () => {
    assert.equal(recoWhyForMood('sortie'), null);
    assert.equal(recoWhyForMood('Sortie'), null);
    assert.equal(recoWhyCopy({ source: 'profile', mood: 'sortie' }), null);
    assert.equal(recoWhyCopy({ source: 'profile', mood: 'tiré' }), null);
    assert.equal(recoWhyCopy({ source: 'popularite', mood: 'tendre' }), null);
    const row = item({ key: 'so', cat: 'theatre', moods: 'sortie' });
    assert.equal(
      displayReasonForItem(row, {
        ...opts,
        tasteState: state({
          profile: profile({ moods: { sortie: { weight: 9, pct: 100 } } }),
        }),
      }),
      null,
    );
  });
});
