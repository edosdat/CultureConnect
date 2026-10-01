/**
 * Blocking assertions for Matching A (`recommendForProfile`).
 * Brief §5 — started here so a later cosine / CINE_VIVANT_NEIGHBORS refactor
 * has a red→green hook. Not a substitute for `npm run bench`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  itemBlockedByWorkKeys,
  itemInheritsParentClosedTags,
  itemInheritsParentMoods,
  notInterestedBlockKeys,
  recommendForProfile,
  recommendSlice,
  slotFormOfItem,
  workIdOf,
  type ScoredDayItem,
} from './reco';
import { reasonTasteSlugsForItem } from './displayHome';
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

describe('recoEngine — P2 temporal demote', () => {
  it('does not reuse a demoted #1 when an alternative exists in the same slot', () => {
    const first = item({
      key: 'cine-a',
      cat: 'cinema',
      filmId: 'FA',
      moods: 'rigolo',
      day: '2026-09-02',
    });
    const second = item({
      key: 'cine-b',
      cat: 'cinema',
      filmId: 'FB',
      moods: 'rigolo',
      day: '2026-09-05',
    });
    const st = state({
      profile: profile({ moods: { rigolo: { weight: 10, pct: 100 } } }),
    });
    const monday = recommendForProfile([first, second], st, 3, { now: NOW });
    const mondayCine = monday.find((r) => slotFormOfItem(r.item) === 'cine');
    assert.ok(mondayCine);
    const week = recommendForProfile([first, second], st, 3, {
      now: NOW,
      demoteWorkIds: new Set([workIdOf(mondayCine.item)]),
    });
    const weekCine = week.find((r) => slotFormOfItem(r.item) === 'cine');
    assert.ok(weekCine);
    assert.notEqual(workIdOf(weekCine.item), workIdOf(mondayCine.item));
  });

  it('still fills the slot when the only item is demoted', () => {
    const only = item({
      key: 'cine-only',
      cat: 'cinema',
      filmId: 'FO',
      moods: 'rigolo',
    });
    const st = state({
      profile: profile({ moods: { rigolo: { weight: 10, pct: 100 } } }),
    });
    const out = recommendForProfile([only], st, 3, {
      now: NOW,
      demoteWorkIds: new Set([workIdOf(only)]),
    });
    assert.equal(out.length, 1);
    assert.equal(slotFormOfItem(out[0]!.item), 'cine');
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

describe('recoEngine — P0/L2 cine does not inherit parent season moods', () => {
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
    assert.equal(itemInheritsParentMoods(cine), false);
    assert.equal(itemInheritsParentClosedTags(cine), false);
    const st = state({
      profile: profile({
        moods: { rigolo: { weight: 10, pct: 100 }, leger: { weight: 10, pct: 100 } },
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
    assert.notEqual(cineRow.reason?.mood, 'leger');
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

/**
 * L2 property: displayed why-mood ⊆ reasonTasteSlugsForItem (same source as scoring).
 * Fails if scoring reintroduces parent-only cinema moods without aligning why-lines.
 */
describe('recoEngine — L2 reason.mood ∈ reasonTasteSlugsForItem', () => {
  function assertReasonMoodsOnItem(rows: ScoredDayItem[]) {
    for (const row of rows) {
      const mood = row.reason?.mood;
      if (!mood) continue;
      const allowed = reasonTasteSlugsForItem(row.item);
      assert.ok(
        allowed.includes(mood),
        `reason.mood=${mood} not in reasonTasteSlugsForItem=[${allowed.join(',')}] ` +
          `for ${row.item.key} (source=${row.reason?.source})`,
      );
    }
  }

  const vivantRigolo = item({
    key: 'th-l2-rigolo',
    cat: 'theatre',
    moods: 'rigolo',
    genre: 'humour_standup',
    titre: 'Stand-up L2',
  });
  const concertFestif = item({
    key: 'co-l2-festif',
    cat: 'musique',
    moods: 'festif',
    genre: 'electro',
    titre: 'Club L2',
  });
  const cineOwn = cineSeanceSplitTags({
    key: 'cine-l2-own',
    filmId: 'F-L2-OWN',
    progMoods: 'leger|intense',
    evMoods: 'rigolo|tendre|festif|critique|epique|sombre|intimiste|dansant',
    titre: 'Film tagged itself',
  });
  const cineParentOnly = cineSeanceSplitTags({
    key: 'cine-l2-parent',
    filmId: 'F-L2-PARENT',
    progMoods: '',
    evMoods: 'rigolo|cerveau|epique|tendre|festif|critique|leger|intense',
    titre: 'Film parent mega only',
  });
  const theatreInherited = (() => {
    const day = '2026-09-02';
    const evenement = ev({
      event_id: 'E-TH-L2',
      categorie: 'theatre',
      titre: 'Festival L2 parent',
      moods: 'intimiste',
      date_debut: day,
      date_fin: day,
    });
    const programme = prog({
      programme_id: 'p-th-l2',
      event_id: 'E-TH-L2',
      nom_item: 'Sketch L2',
      date: day,
      moods: '',
    });
    return {
      kind: 'programme' as const,
      key: 'th-l2-inherited',
      dayIso: day,
      programme,
      evenement,
      lieu: lieu(),
    };
  })();

  const pool = [cineOwn, cineParentOnly, vivantRigolo, concertFestif, theatreInherited];

  it('holds on recommendForProfile for profiles that hit own / parent / fallback paths', () => {
    const profiles = [
      state({ profile: profile({ moods: { leger: { weight: 10, pct: 100 } } }) }),
      state({ profile: profile({ moods: { rigolo: { weight: 10, pct: 100 } } }) }),
      state({ profile: profile({ moods: { intimiste: { weight: 10, pct: 100 } } }) }),
      state({ profile: profile({ moods: { festif: { weight: 10, pct: 100 } } }) }),
      state({ profile: profile({ moods: { intense: { weight: 10, pct: 100 } } }) }),
      state({}),
    ];
    for (const st of profiles) {
      const out = recommendForProfile(pool, st, 3, { now: NOW });
      assertReasonMoodsOnItem(out);
    }
  });

  it('holds on recommendSlice (no false parent-only cinema mood)', () => {
    const st = state({
      profile: profile({
        moods: {
          leger: { weight: 10, pct: 100 },
          rigolo: { weight: 8, pct: 80 },
          festif: { weight: 6, pct: 60 },
        },
      }),
    });
    const top = recommendForProfile(pool, st, 3, { now: NOW });
    const slice = recommendSlice(pool, st, top.map((r) => r.item), 6, { now: NOW });
    assertReasonMoodsOnItem(top);
    assertReasonMoodsOnItem(slice);
  });

  it('cine parent-only mega moods never appear as reason.mood', () => {
    const st = state({
      profile: profile({ moods: { leger: { weight: 10, pct: 100 } } }),
    });
    const out = recommendForProfile(
      [cineParentOnly, vivantRigolo, concertFestif],
      st,
      3,
      { now: NOW },
    );
    assertReasonMoodsOnItem(out);
    const cineRow = out.find((row) => row.item.key === 'cine-l2-parent');
    assert.ok(cineRow);
    assert.notEqual(cineRow.reason?.mood, 'leger');
    assert.equal(reasonTasteSlugsForItem(cineParentOnly).includes('leger'), false);
  });
});

describe('P3 not_interested excludes the œuvre from proposals', () => {
  const theatre = item({
    key: 'th-keep',
    cat: 'theatre',
    eventId: 'E-KEEP',
    titre: 'Pièce à garder',
  });
  const concert = item({
    key: 'co-keep',
    cat: 'musique',
    eventId: 'E-MUS',
    titre: 'Concert à garder',
  });
  const dismissed = item({
    key: 'cine-no',
    cat: 'cinema',
    filmId: 'F-NO',
    eventId: 'E-NO',
    titre: 'Film à écarter',
    day: '2026-09-02',
  });
  const sameFilmLater = item({
    key: 'cine-no-late',
    cat: 'cinema',
    filmId: 'F-NO',
    eventId: 'E-NO',
    titre: 'Film à écarter',
    day: '2026-09-05',
    heure: '21:00',
  });
  const otherFilm = item({
    key: 'cine-yes',
    cat: 'cinema',
    filmId: 'F-YES',
    eventId: 'E-YES',
    titre: 'Autre film',
    day: '2026-09-04',
  });

  function blockedFilm() {
    return notInterestedBlockKeys([
      { kind: 'not_interested', film_id: 'F-NO', event_id: 'E-NO', programme_id: 'p-cine-no' },
    ]);
  }

  it('recommendForProfile drops every séance of the marked film and keeps another', () => {
    const pool = [dismissed, sameFilmLater, otherFilm, theatre, concert];
    const blocked = blockedFilm();
    assert.equal(itemBlockedByWorkKeys(dismissed, blocked), true);
    assert.equal(itemBlockedByWorkKeys(sameFilmLater, blocked), true);
    assert.equal(itemBlockedByWorkKeys(otherFilm, blocked), false);

    const out = recommendForProfile(pool, emptyTasteState(), 3, {
      now: NOW,
      excludeWorkIds: blocked,
    });
    const films = out
      .filter((row) => row.item.kind === 'programme')
      .map((row) =>
        row.item.kind === 'programme' ? row.item.programme.film_id : '',
      );
    assert.equal(films.includes('F-NO'), false);
    assert.ok(films.includes('F-YES'));
    assert.equal(out.some((row) => workIdOf(row.item) === 'f:F-NO'), false);
  });

  it('recommendSlice never returns the excluded œuvre', () => {
    const pool = [dismissed, sameFilmLater, otherFilm, theatre, concert];
    const slice = recommendSlice(pool, emptyTasteState(), [], 5, {
      now: NOW,
      excludeWorkIds: blockedFilm(),
    });
    assert.ok(slice.length > 0);
    assert.equal(
      slice.some((row) => workIdOf(row.item) === 'f:F-NO'),
      false,
    );
    assert.ok(slice.some((row) => workIdOf(row.item) === 'f:F-YES'));
  });

  it('an event id blocks the living work even without a film id', () => {
    const dropped = item({
      key: 'th-drop',
      cat: 'theatre',
      eventId: 'E-DROP',
      titre: 'Pièce écartée',
    });
    const kept = item({
      key: 'th-stay',
      cat: 'theatre',
      eventId: 'E-STAY',
      titre: 'Autre pièce',
    });
    const blocked = notInterestedBlockKeys([
      { kind: 'not_interested', event_id: 'E-DROP' },
    ]);
    const out = recommendForProfile(
      [dropped, kept, otherFilm, concert],
      emptyTasteState(),
      3,
      { now: NOW, excludeWorkIds: blocked },
    );
    assert.equal(out.some((row) => row.item.key === 'th-drop'), false);
    assert.ok(out.some((row) => row.item.key === 'th-stay'));
  });
});
