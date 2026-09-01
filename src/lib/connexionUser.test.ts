import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhraseRules, isTasteMood, TASTE_MOODS } from './phraseTags';
import { pickAussiCeSoir } from './nouveautesCine';
import {
  recommendForProfile,
  recommendSlice,
  slotFormOfItem,
  SLOT_ORDER,
  itemIdentity,
  itemIsUntagged,
  workIdOf,
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
