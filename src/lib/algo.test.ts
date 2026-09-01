import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhraseRules } from './phraseTags';
import { pickAussiCeSoir } from './nouveautesCine';
import {
  dailySalt,
  itemIdentity,
  itemIsUntagged,
  recommendForProfile,
  recommendSlice,
  SLOT_ORDER,
  slotFormOfItem,
} from './reco';
import {
  emptyProfile,
  emptyTasteState,
  makeSignal,
  SIGNAL_WEIGHTS,
  tagsFromSearchQuery,
} from './signals';
import { reasonCopy } from './pourToi';
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

function ev(partial: Partial<Evenement> & Pick<Evenement, 'event_id' | 'categorie' | 'titre'>): Evenement {
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
    ...partial,
  };
}

function prog(
  partial: Partial<ProgrammeItem> & Pick<ProgrammeItem, 'programme_id' | 'event_id' | 'nom_item'>,
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
    ...partial,
  };
}

function item(opts: {
  key: string;
  cat: string;
  day?: string;
  heure?: string;
  eventId?: string;
  programmeId?: string;
  filmId?: string;
  moods?: string;
  genre?: string;
  commune?: string;
  dateDebut?: string;
  dateFin?: string;
  titre?: string;
}): DayItem {
  const eventId = opts.eventId ?? opts.key;
  const evenement = ev({
    event_id: eventId,
    categorie: opts.cat,
    titre: opts.titre ?? opts.key,
    genre: opts.genre ?? '',
    moods: opts.moods,
    date_debut: opts.dateDebut ?? opts.day ?? '2026-09-02',
    date_fin: opts.dateFin ?? opts.day ?? '2026-09-02',
    heure_debut: opts.heure ?? '20:00',
  });
  const programme = prog({
    programme_id: opts.programmeId ?? `p-${opts.key}`,
    event_id: eventId,
    nom_item: opts.titre ?? opts.key,
    date: opts.day ?? '2026-09-02',
    heure_debut: opts.heure ?? '20:00',
    genre: opts.genre ?? '',
    moods: opts.moods,
    film_id: opts.filmId,
    form:
      opts.cat === 'cinema'
        ? 'cine'
        : opts.cat === 'theatre'
          ? 'theatre'
          : 'concert',
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
  return {
    signalsRecent: [],
    profile: emptyProfile(),
    ...partial,
  };
}

const NOW = new Date('2026-09-01T12:00:00+02:00');

const TRIO = [
  item({ key: 'cine-a', cat: 'cinema', filmId: 'F1', moods: 'rigolo', genre: 'fiction' }),
  item({ key: 'th-a', cat: 'theatre', moods: 'rigolo', genre: 'humour_standup' }),
  item({ key: 'co-a', cat: 'musique', moods: 'festif', genre: 'electro_techno' }),
];

describe('phrase rules — 17 catalog moods, no AI', () => {
  it('parses « un truc intimiste » → intimiste', () => {
    const tags = parsePhraseRules('un truc intimiste');
    assert.deepEqual(tags.moods, ['intimiste']);
    assert.equal(tags.source, 'rules');
  });

  it('parses « envie de danser » → dansant', () => {
    const tags = parsePhraseRules('envie de danser');
    assert.deepEqual(tags.moods, ['dansant']);
  });

  it('does not invent mood strings', () => {
    const tags = parsePhraseRules('un truc cosmique galactique');
    assert.deepEqual(tags.moods, []);
  });
});

describe('recommendForProfile — never empty 1+1+1', () => {
  it('returns cine + theatre + concert for an empty profile', () => {
    const out = recommendForProfile(TRIO, emptyTasteState(), 3, { now: NOW });
    assert.equal(out.length, 3);
    assert.deepEqual(
      out.map((s) => slotFormOfItem(s.item)),
      SLOT_ORDER,
    );
    for (const row of out) {
      assert.ok(row.reason, 'reason payload present');
      assert.ok(
        row.reason!.source === 'popularite' || row.reason!.source === 'nouveaute',
      );
    }
  });

  it('does not return [] for empty profile when the pool has all forms', () => {
    const out = recommendForProfile(TRIO, state(), 3, { now: NOW });
    assert.notEqual(out.length, 0);
  });

  it('is stable for the same Paris day (daily salt only)', () => {
    const a = recommendForProfile(TRIO, state(), 3, { now: NOW }).map(
      (s) => s.item.key,
    );
    const b = recommendForProfile(TRIO, state(), 3, { now: NOW }).map(
      (s) => s.item.key,
    );
    assert.deepEqual(a, b);
    const s1 = dailySalt(TRIO[0]!, '2026-09-01');
    const s2 = dailySalt(TRIO[0]!, '2026-09-01');
    assert.equal(s1, s2);
  });

  it('profile hit exposes mood/genre, not popularite', () => {
    const st = state({
      profile: profile({
        moods: { intimiste: { weight: 4, pct: 100 } },
      }),
    });
    const pool = [
      item({ key: 'cine-i', cat: 'cinema', filmId: 'F2', moods: 'intimiste' }),
      item({ key: 'th-i', cat: 'theatre', moods: 'intimiste' }),
      item({ key: 'co-i', cat: 'musique', moods: 'intimiste' }),
    ];
    const out = recommendForProfile(pool, st, 3, { now: NOW });
    assert.equal(out.length, 3);
    for (const row of out) {
      assert.equal(row.reason?.source, 'profile');
      assert.equal(row.reason?.mood, 'intimiste');
    }
  });

  it('down-weights the majority theatre mood (inverse frequency)', () => {
    const st = state({
      profile: profile({
        moods: {
          rigolo: { weight: 1, pct: 50 },
          sombre: { weight: 1, pct: 50 },
        },
      }),
    });
    const pool: DayItem[] = [
      item({ key: 'cine-x', cat: 'cinema', filmId: 'FX', moods: 'sombre' }),
      item({ key: 'co-x', cat: 'musique', moods: 'festif' }),
    ];
    for (let i = 0; i < 8; i++) {
      pool.push(
        item({
          key: `th-r${i}`,
          cat: 'theatre',
          eventId: `ER${i}`,
          moods: 'rigolo',
          genre: 'humour_standup',
        }),
      );
    }
    pool.push(
      item({
        key: 'th-sombre',
        cat: 'theatre',
        eventId: 'ES',
        moods: 'sombre',
        genre: 'theatre_contemporain',
      }),
    );
    const out = recommendForProfile(pool, st, 3, { now: NOW });
    const theatre = out.find((s) => slotFormOfItem(s.item) === 'theatre');
    assert.ok(theatre);
    assert.equal(theatre!.item.key, 'th-sombre');
  });

  it('skips cross-form mood when the target form has no stock', () => {
    const st = state({
      profile: profile({
        moods: { angoissant: { weight: 5, pct: 100 } },
      }),
    });
    const pool = [
      item({ key: 'cine-ang', cat: 'cinema', filmId: 'FA', moods: 'angoissant' }),
      item({ key: 'th-fun', cat: 'theatre', moods: 'rigolo', genre: 'humour_standup' }),
      item({ key: 'co-fun', cat: 'musique', moods: 'festif' }),
    ];
    const out = recommendForProfile(pool, st, 3, { now: NOW });
    const theatre = out.find((s) => slotFormOfItem(s.item) === 'theatre');
    assert.ok(theatre);
    assert.notEqual(theatre!.reason?.source, 'profile');
    assert.ok(
      theatre!.reason?.source === 'popularite' ||
        theatre!.reason?.source === 'nouveaute',
    );
  });
});

describe('recommendSlice — genre cap, untagged, dedup', () => {
  it('caps a genre at 2/6 and keeps 1 untagged', () => {
    const top3 = [
      item({ key: 'cine-top', cat: 'cinema', filmId: 'FT', moods: 'rigolo' }),
      item({ key: 'th-top', cat: 'theatre', moods: 'rigolo' }),
      item({ key: 'co-top', cat: 'musique', moods: 'festif' }),
    ];
    const extra: DayItem[] = [
      ...top3,
      item({
        key: 'j1',
        cat: 'musique',
        eventId: 'J1',
        moods: 'festif',
        genre: 'jazz_blues',
      }),
      item({
        key: 'j2',
        cat: 'musique',
        eventId: 'J2',
        moods: 'festif',
        genre: 'jazz_blues',
      }),
      item({
        key: 'j3',
        cat: 'musique',
        eventId: 'J3',
        moods: 'festif',
        genre: 'jazz_blues',
      }),
      item({
        key: 'r1',
        cat: 'musique',
        eventId: 'R1',
        moods: 'intense',
        genre: 'rock_metal_punk',
      }),
      item({
        key: 'r2',
        cat: 'musique',
        eventId: 'R2',
        moods: 'intense',
        genre: 'rock_metal_punk',
      }),
      item({
        key: 'u1',
        cat: 'theatre',
        eventId: 'U1',
        genre: 'theatre_contemporain',
      }),
    ];
    const slice = recommendSlice(extra, state(), top3, 6, { now: NOW });
    assert.ok(slice.length <= 6);
    const ids = new Set(slice.map((s) => itemIdentity(s.item)));
    for (const t of top3) {
      assert.equal(ids.has(itemIdentity(t)), false);
    }
    const jazz = slice.filter(
      (s) => (s.item.kind === 'programme' ? s.item.programme.genre : '') === 'jazz_blues',
    );
    assert.ok(jazz.length <= 2);
    assert.ok(slice.some((s) => itemIsUntagged(s.item)));
  });
});

describe('pickAussiCeSoir — not earliest hour', () => {
  it('prefers a unique later show over an earlier common one', () => {
    const open = item({
      key: 'film',
      cat: 'cinema',
      filmId: 'F9',
      day: '2026-09-01',
      heure: '20:00',
    });
    const earlyCommon = item({
      key: 'early',
      cat: 'theatre',
      eventId: 'E-EARLY',
      day: '2026-09-01',
      heure: '19:00',
      dateDebut: '2026-08-01',
      dateFin: '2026-09-30',
      commune: 'Toulouse',
    });
    const lateUnique = item({
      key: 'late',
      cat: 'theatre',
      eventId: 'E-LATE',
      day: '2026-09-01',
      heure: '21:00',
      dateDebut: '2026-09-01',
      dateFin: '2026-09-01',
      commune: 'Toulouse',
    });
    const picked = pickAussiCeSoir(
      [earlyCommon, lateUnique],
      open,
      1,
      NOW,
    );
    assert.equal(picked[0]?.key, 'late');
  });
});

describe('search tags → session taste path', () => {
  it('makeSignal(search) folds form/moods/themes/genres', () => {
    const s = makeSignal({
      kind: 'search',
      query: 'un truc intimiste au theatre',
    });
    assert.ok(s.moods.includes('intimiste'));
    assert.equal(s.categorie, 'theatre_danse');
  });

  it('reservation weight beats fiche open', () => {
    assert.ok(SIGNAL_WEIGHTS.reserve > SIGNAL_WEIGHTS.open_card);
    assert.ok(SIGNAL_WEIGHTS.agenda_add > SIGNAL_WEIGHTS.open_card);
  });

  it('tagsFromSearchQuery matches parsePhraseRules', () => {
    const a = tagsFromSearchQuery('envie de danser');
    assert.deepEqual(a.moods, ['dansant']);
  });
});

describe('reason copy — guest never tu as aimé', () => {
  it('guest profile hit still prints popularité, never tu as aimé', () => {
    const text = reasonCopy(
      { source: 'profile', mood: 'intimiste' },
      { guest: true },
    );
    assert.equal(text, 'Popularité');
    assert.equal(text.toLowerCase().includes('aimé'), false);
    assert.equal(text.toLowerCase().includes('aime'), false);
  });

  it('signed-in profile hit exposes the mood label', () => {
    assert.equal(
      reasonCopy({ source: 'profile', mood: 'dansant' }),
      'Dansant',
    );
  });
});
