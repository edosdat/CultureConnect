/**
 * Blocking assertions for Matching A (`recommendForProfile`).
 * Brief §5 — started here so a later cosine / CINE_VIVANT_NEIGHBORS refactor
 * has a red→green hook. Not a substitute for `npm run bench`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendForProfile,
  recommendSlice,
  slotFormOfItem,
} from './reco';
import { emptyProfile, emptyTasteState, type AccountTasteState, type TasteProfile } from './signals';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

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
    lieu: lieu(),
  };
}

function profile(partial: Partial<TasteProfile>): TasteProfile {
  return { ...emptyProfile(), ...partial };
}

function state(partial?: Partial<AccountTasteState>): AccountTasteState {
  return { signalsRecent: [], profile: emptyProfile(), ...partial };
}

const NOW = new Date('2026-09-01T12:00:00+02:00');

const STOCK = [
  item({ key: 'cine-rigolo', cat: 'cinema', filmId: 'F-R', moods: 'rigolo', genre: 'comedie' }),
  item({
    key: 'th-rigolo',
    cat: 'theatre',
    moods: 'rigolo',
    genre: 'humour_standup',
    titre: 'Stand-up rigolo',
  }),
  item({
    key: 'co-festif',
    cat: 'musique',
    moods: 'festif',
    genre: 'electro_techno',
    titre: 'Club festif',
  }),
  item({
    key: 'th-intimiste',
    cat: 'theatre',
    moods: 'intimiste',
    genre: 'theatre_contemporain',
    eventId: 'E-INT',
  }),
  item({
    key: 'co-dansant',
    cat: 'musique',
    moods: 'dansant',
    genre: 'electro',
    eventId: 'E-DAN',
  }),
];

describe('recoEngine — empty profile never empty', () => {
  it('returns a non-empty list when the pool has slotted items', () => {
    const out = recommendForProfile(STOCK, emptyTasteState(), 3, { now: NOW });
    assert.ok(out.length > 0, 'fallback must fill at least one slot');
    assert.ok(out.length <= 3);
  });
});

describe('recoEngine — rigolo 100 hits vivant rigolo', () => {
  it('recommends at least one living-arts item tagged rigolo', () => {
    const st = state({
      profile: profile({ moods: { rigolo: { weight: 10, pct: 100 } } }),
    });
    const out = recommendForProfile(STOCK, st, 3, { now: NOW });
    const hit = out.find((row) => {
      const slot = slotFormOfItem(row.item);
      if (slot !== 'theatre' && slot !== 'concert') return false;
      const moods = `${row.item.kind === 'programme' ? row.item.programme.moods : row.item.evenement.moods}`;
      return moods.split(/[|,]/).map((s) => s.trim()).includes('rigolo');
    });
    assert.ok(hit, 'rigolo 100 must surface a vivant item bearing rigolo');
  });
});

describe('recoEngine — no-stock vivant moods stay off living slots', () => {
  it('does not stretch cerveau / angoissant / brutal onto untagged vivant', () => {
    const st = state({
      profile: profile({
        moods: { cerveau: { weight: 5, pct: 100 } },
      }),
    });
    const pool = [
      item({ key: 'cine-cer', cat: 'cinema', filmId: 'FC', moods: 'cerveau' }),
      item({ key: 'th-fun', cat: 'theatre', moods: 'rigolo' }),
      item({ key: 'co-fun', cat: 'musique', moods: 'festif' }),
    ];
    const out = recommendForProfile(pool, st, 3, { now: NOW });
    for (const row of out) {
      const slot = slotFormOfItem(row.item);
      if (slot === 'theatre' || slot === 'concert') {
        assert.notEqual(row.reason?.source, 'profile');
        assert.notEqual(row.reason?.mood, 'cerveau');
      }
    }
  });
});

describe('recoEngine — slice diversity cap', () => {
  it('does not keep a third item of the same primary genre', () => {
    const pool = [
      item({ key: 'a', cat: 'theatre', moods: 'rigolo', genre: 'humour_standup', eventId: 'E1' }),
      item({ key: 'b', cat: 'theatre', moods: 'rigolo', genre: 'humour_standup', eventId: 'E2' }),
      item({ key: 'c', cat: 'theatre', moods: 'rigolo', genre: 'humour_standup', eventId: 'E3' }),
      item({ key: 'd', cat: 'musique', moods: 'festif', genre: 'electro', eventId: 'E4' }),
      item({ key: 'e', cat: 'musique', moods: 'dansant', genre: 'jazz', eventId: 'E5' }),
      item({ key: 'f', cat: 'cinema', filmId: 'F1', moods: 'rigolo', genre: 'comedie' }),
    ];
    const out = recommendSlice(pool, emptyTasteState(), [], 6, { now: NOW });
    const standup = out.filter((row) =>
      (row.item.kind === 'programme' ? row.item.programme.genre : '').includes(
        'humour_standup',
      ),
    );
    assert.ok(standup.length <= 2, `genre cap is 2, got ${standup.length}`);
  });
});

describe('recoEngine — tag-count insensitivity (cosine follow-up)', () => {
  it.skip('two clones score within ±5 % despite extra parasite tags (needs cosine)', () => {
    // Parked until Matching C / cosine. Today a 12-tag item beats a 3-tag twin.
    const lean = item({
      key: 'lean',
      cat: 'theatre',
      moods: 'rigolo',
      genre: 'humour_standup',
      eventId: 'E-LEAN',
    });
    const heavy = item({
      key: 'heavy',
      cat: 'theatre',
      moods: 'rigolo|tendre|leger',
      genre: 'humour_standup',
      eventId: 'E-HEAVY',
    });
    const st = state({
      profile: profile({ moods: { rigolo: { weight: 10, pct: 100 } } }),
    });
    const a = recommendForProfile([lean, heavy], st, 3, { now: NOW });
    const leanScore = a.find((r) => r.item.key === 'lean')?.score ?? 0;
    const heavyScore = a.find((r) => r.item.key === 'heavy')?.score ?? 0;
    assert.ok(leanScore > 0 && heavyScore > 0);
    const ratio = heavyScore / leanScore;
    assert.ok(ratio >= 0.95 && ratio <= 1.05, `score ratio ${ratio}`);
  });
});

function cineSeanceSplitTags(opts: {
  key: string;
  filmId?: string;
  form?: string;
  progMoods?: string;
  evMoods?: string;
  evThemes?: string;
  titre?: string;
}): DayItem {
  const day = '2026-09-02';
  const eventId = `E-${opts.key}`;
  const evenement = ev({
    event_id: eventId,
    categorie: 'cinema',
    titre: 'Saison parent',
    moods: opts.evMoods,
    themes: opts.evThemes,
    form: 'cine',
    date_debut: day,
    date_fin: day,
  });
  const programme = prog({
    programme_id: `p-${opts.key}`,
    event_id: eventId,
    nom_item: opts.titre ?? opts.key,
    date: day,
    moods: opts.progMoods,
    film_id: opts.filmId,
    form: opts.form ?? 'cine',
  });
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: day,
    programme,
    evenement,
    lieu: lieu(),
  };
}

describe('recoEngine — P0 cine does not inherit parent season moods', () => {
  const vivantRigolo = item({
    key: 'th-own-rigolo',
    cat: 'theatre',
    moods: 'rigolo',
    genre: 'humour_standup',
    titre: 'Stand-up own',
  });
  const concertFestif = item({
    key: 'co-own-festif',
    cat: 'musique',
    moods: 'festif',
    genre: 'electro',
    titre: 'Club own',
  });

  it('does not score a film_id séance from empty prog.moods + parent mega-moods', () => {
    const cine = cineSeanceSplitTags({
      key: 'fleurs',
      filmId: 'F043',
      progMoods: '',
      evMoods: 'rigolo|cerveau|epique|tendre|festif|critique|leger|intense',
      evThemes: 'famille|histoire|guerre',
      titre: 'Des Fleurs pour Tokyo',
    });
    const st = state({
      profile: profile({
        moods: { rigolo: { weight: 10, pct: 100 } },
        themes: { famille: { weight: 10, pct: 100 } },
      }),
    });
    const out = recommendForProfile(
      [cine, vivantRigolo, concertFestif],
      st,
      3,
      { now: NOW },
    );
    const cineRow = out.find((row) => slotFormOfItem(row.item) === 'cine');
    assert.ok(cineRow, 'cine slot still fills');
    assert.notEqual(cineRow.reason?.source, 'profile');
    assert.notEqual(cineRow.reason?.mood, 'rigolo');
  });

  it('still scores a séance from its own programme moods, not parent extras', () => {
    const cine = cineSeanceSplitTags({
      key: 'chasse',
      filmId: 'F317',
      progMoods: 'intense|cerveau|brutal',
      evMoods: 'intense|leger|epique|rigolo|sombre|tendre|intimiste|cerveau|brutal|festif|dansant',
      titre: 'Chasse à l’homme',
    });
    const intimiste = state({
      profile: profile({ moods: { intimiste: { weight: 10, pct: 100 } } }),
    });
    const fromParent = recommendForProfile(
      [cine, vivantRigolo, concertFestif],
      intimiste,
      3,
      { now: NOW },
    );
    const parentCine = fromParent.find((row) => slotFormOfItem(row.item) === 'cine');
    assert.ok(parentCine);
    assert.notEqual(parentCine.reason?.mood, 'intimiste');
    assert.notEqual(parentCine.reason?.source, 'profile');

    const own = state({
      profile: profile({ moods: { intense: { weight: 10, pct: 100 } } }),
    });
    const fromOwn = recommendForProfile(
      [cine, vivantRigolo, concertFestif],
      own,
      3,
      { now: NOW },
    );
    const ownCine = fromOwn.find((row) => slotFormOfItem(row.item) === 'cine');
    assert.ok(ownCine);
    assert.equal(ownCine.reason?.source, 'profile');
    assert.equal(ownCine.reason?.mood, 'intense');
  });

  it('excludes parent moods when slotForm is cine even without film_id', () => {
    const cine = cineSeanceSplitTags({
      key: 'saison-card',
      form: 'cine',
      progMoods: '',
      evMoods: 'rigolo|tendre|festif|intense',
      titre: 'Rentrée saison',
    });
    const st = state({
      profile: profile({ moods: { rigolo: { weight: 10, pct: 100 } } }),
    });
    const out = recommendForProfile(
      [cine, vivantRigolo, concertFestif],
      st,
      3,
      { now: NOW },
    );
    const cineRow = out.find((row) => slotFormOfItem(row.item) === 'cine');
    assert.ok(cineRow);
    assert.notEqual(cineRow.reason?.source, 'profile');
  });

  it('keeps parent-event moods on theatre (vivant inheritance unchanged)', () => {
    const day = '2026-09-02';
    const evenement = ev({
      event_id: 'E-TH-PARENT',
      categorie: 'theatre',
      titre: 'Festival parent',
      moods: 'rigolo',
      date_debut: day,
      date_fin: day,
    });
    const programme = prog({
      programme_id: 'p-th-child',
      event_id: 'E-TH-PARENT',
      nom_item: 'Sketch enfant',
      date: day,
      moods: '',
    });
    const theatre: DayItem = {
      kind: 'programme',
      key: 'th-inherited',
      dayIso: day,
      programme,
      evenement,
      lieu: lieu(),
    };
    const cineOwn = item({
      key: 'cine-own',
      cat: 'cinema',
      filmId: 'FX',
      moods: 'intense',
    });
    const st = state({
      profile: profile({ moods: { rigolo: { weight: 10, pct: 100 } } }),
    });
    const out = recommendForProfile(
      [theatre, cineOwn, concertFestif],
      st,
      3,
      { now: NOW },
    );
    const thRow = out.find((row) => slotFormOfItem(row.item) === 'theatre');
    assert.ok(thRow);
    assert.equal(thRow.reason?.source, 'profile');
    assert.equal(thRow.reason?.mood, 'rigolo');
  });
});
