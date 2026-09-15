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
  workIdOf,
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
