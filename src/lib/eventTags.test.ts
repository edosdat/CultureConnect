/**
 * Tags v2 storage: join on event_id, séance inheritance, budget, jauge.
 * Reco scoring must ignore tags_v2 (that lands in a later PR).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { loadCultureData, loadEvenements, loadEventTagsById } from './data';
import {
  EVENT_TAGS_V2_COLUMNS,
  attachEventTags,
  axesTagsOf,
  budgetBandOfEuros,
  budgetOf,
  eventTagsOf,
  indexEventTags,
  jaugeOf,
  jaugeOfLieu,
  parsePriceEuros,
} from './eventTags';
import { recommendForProfile } from './reco';
import { emptyProfile, emptyTasteState } from './signals';
import type {
  DayItem,
  Evenement,
  EventTagsV2,
  Lieu,
  ProgrammeItem,
} from './types';

function lieu(partial: Partial<Lieu> = {}): Lieu {
  return {
    lieu_id: 'L1',
    nom: 'Salle',
    type: 'theatre',
    adresse: '',
    commune: 'Toulouse',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
    ...partial,
  };
}

function evenement(partial: Partial<Evenement> = {}): Evenement {
  return {
    event_id: 'E1',
    lieu_id: 'L1',
    titre: 'Titre',
    categorie: 'theatre',
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

function programme(partial: Partial<ProgrammeItem> = {}): ProgrammeItem {
  return {
    programme_id: 'P1',
    event_id: partial.event_id ?? 'E1',
    lieu_id: 'L1',
    nom_item: 'Titre',
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

function seance(opts: {
  evenement?: Evenement | null;
  programme?: Partial<ProgrammeItem>;
  lieu?: Lieu | null;
} = {}): Extract<DayItem, { kind: 'programme' }> {
  const ev = opts.evenement === undefined ? evenement() : opts.evenement;
  return {
    kind: 'programme',
    key: 'p',
    dayIso: '2026-09-02',
    programme: programme({
      event_id: ev?.event_id ?? 'E1',
      ...opts.programme,
    }),
    evenement: ev,
    lieu: opts.lieu === undefined ? lieu() : opts.lieu,
  };
}

function fallback(opts: {
  evenement?: Partial<Evenement>;
  lieu?: Lieu | null;
} = {}): Extract<DayItem, { kind: 'fallback' }> {
  const ev = evenement(opts.evenement);
  return {
    kind: 'fallback',
    key: `e:${ev.event_id}`,
    dayIso: '2026-09-02',
    evenement: ev,
    lieu: opts.lieu === undefined ? lieu({ lieu_id: ev.lieu_id }) : opts.lieu,
  };
}

const TOM_TAGS: EventTagsV2 = {
  moods: ['intense', 'tendre'],
  sortie: ['interessante'],
  energie: '2',
  exigence: '2',
  format_scene: ['troupe'],
  ideal_pour: ['couple', 'solo'],
  notoriete: 'confirme',
  tag_confiance: 'haute',
  tag_preuve: 'épidémie',
  tag_version: 'v2',
  tagged_by: 'manuel',
};

describe('tags_evenements.csv', () => {
  it('is headers only, in the v2 column order', () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), 'data', 'tags_evenements.csv'),
      'utf8',
    );
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    assert.deepEqual(lines, [EVENT_TAGS_V2_COLUMNS.join(',')]);
  });

  it('does not add v2 columns to evenements.csv or programme.csv', () => {
    for (const name of ['evenements.csv', 'programme.csv'] as const) {
      const first = fs
        .readFileSync(path.join(process.cwd(), 'data', name), 'utf8')
        .split(/\r?\n/, 1)[0];
      assert.equal(first.includes('tag_version'), false, name);
      assert.equal(first.includes('format_scene'), false, name);
      assert.equal(first.includes('ideal_pour'), false, name);
    }
  });
});

describe('indexEventTags / attachEventTags', () => {
  it('missing file and headers-only are an empty index', () => {
    assert.equal(indexEventTags(null).size, 0);
    assert.equal(indexEventTags(undefined).size, 0);
    assert.equal(indexEventTags([]).size, 0);
    assert.equal(loadEventTagsById('tags_evenements_missing.csv').size, 0);
    assert.equal(loadEventTagsById().size, 0);
  });

  it('joins on event_id only and leaves v1 moods in place', () => {
    const events = [
      evenement({
        event_id: 'E-TOM',
        titre: 'TOM',
        lieu_id: 'L040',
        date_debut: '2026-10-01',
        moods: 'rigolo',
      }),
      evenement({
        event_id: 'E-OTHER',
        titre: 'TOM',
        lieu_id: 'L040',
        date_debut: '2026-10-01',
        moods: 'festif',
      }),
    ];
    const tags = indexEventTags([
      {
        event_id: '',
        titre: 'TOM',
        lieu_id: 'L040',
        date_debut: '2026-10-01',
        moods: 'sombre|intense',
      },
      {
        event_id: 'E-TOM',
        moods: 'intense|tendre',
        sortie: 'interessante',
        energie: '2',
        exigence: '2',
        format_scene: 'troupe',
        ideal_pour: 'couple|solo',
        notoriete: 'confirme',
        tag_confiance: 'haute',
        tag_preuve: 'épidémie',
        tag_version: 'v2',
        tagged_by: 'manuel',
      },
    ]);
    attachEventTags(events, tags);
    assert.deepEqual(events[0].tags_v2, TOM_TAGS);
    assert.equal(events[0].moods, 'rigolo');
    assert.equal(events[1].tags_v2, undefined);
    assert.equal(events[1].moods, 'festif');
  });

  it('keeps the first row when event_id repeats', () => {
    const tags = indexEventTags([
      { event_id: 'E1', energie: '2' },
      { event_id: 'E1', energie: '5' },
    ]);
    assert.equal(tags.get('E1')?.energie, '2');
  });

  it('attaches an empty object when the row has only an event_id', () => {
    const events = [evenement({ event_id: 'E-EMPTY', moods: 'rigolo' })];
    attachEventTags(events, indexEventTags([{ event_id: 'E-EMPTY' }]));
    assert.deepEqual(events[0].tags_v2, {});
    assert.equal(events[0].moods, 'rigolo');
  });

  it('does nothing when the index is empty', () => {
    const events = [evenement({ moods: 'festif' })];
    attachEventTags(events, indexEventTags(null));
    assert.equal(events[0].tags_v2, undefined);
    assert.equal(events[0].moods, 'festif');
  });
});

describe('eventTagsOf', () => {
  it('programme séances inherit the parent event tags, not their own v1 moods', () => {
    const parent = evenement({
      event_id: 'E-TOM',
      moods: 'rigolo',
      tags_v2: TOM_TAGS,
    });
    const first = seance({
      evenement: parent,
      programme: { programme_id: 'P1', moods: 'festif', event_id: 'E-TOM' },
    });
    const second = seance({
      evenement: parent,
      programme: { programme_id: 'P2', moods: '', event_id: 'E-TOM' },
    });
    assert.deepEqual(eventTagsOf(first), TOM_TAGS);
    assert.deepEqual(eventTagsOf(second).moods, ['intense', 'tendre']);
    assert.equal(first.programme.moods, 'festif');
    assert.equal(
      (first.programme as ProgrammeItem & { tags_v2?: EventTagsV2 }).tags_v2,
      undefined,
    );
  });

  it('a fallback card reads its own event row', () => {
    const item = fallback({
      evenement: { event_id: 'E-TOM', tags_v2: TOM_TAGS, moods: 'rigolo' },
    });
    assert.deepEqual(eventTagsOf(item).sortie, ['interessante']);
    assert.equal(item.evenement.moods, 'rigolo');
  });

  it('no parent and no row yield an empty object', () => {
    assert.deepEqual(eventTagsOf(seance({ evenement: null })), {});
    assert.deepEqual(eventTagsOf(fallback()), {});
  });

  it('returns a copy so callers cannot mutate the joined row', () => {
    const parent = evenement({ tags_v2: { moods: ['intense', 'tendre'] } });
    const item = seance({ evenement: parent });
    const tags = eventTagsOf(item);
    tags.moods?.push('festif');
    assert.deepEqual(parent.tags_v2?.moods, ['intense', 'tendre']);
  });
});

describe('budget', () => {
  it('parses the brief price strings', () => {
    assert.equal(parsePriceEuros('Tarif unique : 28€'), 28);
    assert.equal(parsePriceEuros('25,80 € Prévente'), 25.8);
    assert.equal(parsePriceEuros('entrée libre 5 euros conseillés'), 0);
    assert.equal(parsePriceEuros('Entrée libre'), 0);
    assert.equal(parsePriceEuros('GRATUIT'), 0);
    assert.equal(parsePriceEuros(''), null);
    assert.equal(parsePriceEuros('participation libre'), null);
    assert.equal(parsePriceEuros('Tarif C'), null);
    assert.equal(parsePriceEuros('21 € / 14 €'), 21);

    assert.equal(budgetOf(fallback({ evenement: { prix: 'Tarif unique : 28€', gratuit: 'non' } })), '15_35');
    assert.equal(budgetOf(fallback({ evenement: { prix: '25,80 € Prévente', gratuit: 'non' } })), '15_35');
    assert.equal(
      budgetOf(fallback({
        evenement: { prix: 'entrée libre 5 euros conseillés', gratuit: 'non' },
      })),
      'gratuit',
    );
    assert.equal(budgetOf(fallback({ evenement: { prix: '', gratuit: '' } })), 'nc');
    assert.equal(budgetOf(fallback({ evenement: { prix: '', gratuit: 'non' } })), 'nc');
  });

  it('bands 0, under 15, 15 through 35, and above 35', () => {
    assert.equal(budgetBandOfEuros(null), 'nc');
    assert.equal(budgetBandOfEuros(0), 'gratuit');
    assert.equal(budgetBandOfEuros(14.99), 'lt15');
    assert.equal(budgetBandOfEuros(15), '15_35');
    assert.equal(budgetBandOfEuros(35), '15_35');
    assert.equal(budgetBandOfEuros(35.01), 'gt35');
    assert.equal(budgetOf(fallback({ evenement: { prix: '7€', gratuit: 'non' } })), 'lt15');
    assert.equal(budgetOf(fallback({ evenement: { prix: '45€', gratuit: 'non' } })), 'gt35');
  });

  it('gratuit=oui wins on the event; a séance price wins over the parent', () => {
    assert.equal(
      budgetOf(fallback({ evenement: { prix: '28€', gratuit: 'oui' } })),
      'gratuit',
    );
    const parent = evenement({ prix: '45€', gratuit: 'oui' });
    assert.equal(
      budgetOf(seance({
        evenement: parent,
        programme: { prix_item: 'Tarif unique : 28€' },
      })),
      '15_35',
    );
    assert.equal(
      budgetOf(seance({
        evenement: parent,
        programme: { prix_item: '' },
      })),
      'gratuit',
    );
    assert.equal(
      budgetOf(seance({
        evenement: evenement({ prix: 'Tarif unique : 28€', gratuit: 'non' }),
        programme: { prix_item: '' },
      })),
      '15_35',
    );
  });
});

describe('jauge', () => {
  it('maps lieu type, then lieu_id overrides', () => {
    const cases: Array<[string, string | null]> = [
      ['bar_scene', 'petite'],
      ['bar', 'petite'],
      ['salle_asso', 'petite'],
      ['mjc', 'petite'],
      ['cave', 'petite'],
      ['theatre', 'moyenne'],
      ['centre_culturel', 'moyenne'],
      ['smac', 'moyenne'],
      ['salle', 'moyenne'],
      ['zenith', 'grande'],
      ['salle_concert', null],
      ['cinema', null],
      ['guinguette', null],
    ];
    for (const [type, expected] of cases) {
      assert.equal(
        jaugeOf(fallback({ lieu: lieu({ lieu_id: 'LX', type }) })),
        expected,
        type,
      );
    }
    assert.equal(jaugeOf(fallback({ lieu: null })), null);
    assert.equal(
      jaugeOfLieu({ lieu_id: 'L070', type: 'salle_concert' }),
      'grande',
    );
    assert.equal(jaugeOfLieu({ lieu_id: 'L079', type: 'zenith' }), 'grande');
    assert.equal(jaugeOfLieu({ lieu_id: 'L061', type: 'theatre' }), 'grande');
    assert.equal(
      jaugeOfLieu({ lieu_id: 'L075', type: 'salle_concert' }),
      null,
    );
  });

  it('named catalogue rooms keep the brief jauge', () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), 'data', 'lieux.csv'),
      'utf8',
    );
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const byId = new Map(parsed.data.map((row) => [row.lieu_id, row]));
    const expectRoom = (id: string, nom: string, type: string, jauge: string | null) => {
      const row = byId.get(id);
      assert.ok(row, id);
      assert.equal(row.nom, nom);
      assert.equal(row.type, type);
      assert.equal(jaugeOfLieu({ lieu_id: id, type: row.type }), jauge);
    };
    expectRoom('L070', 'Halle aux Grains', 'salle_concert', 'grande');
    expectRoom('L079', 'Zénith Toulouse Métropole', 'zenith', 'grande');
    expectRoom('L061', 'Casino Théâtre Barrière', 'theatre', 'grande');
    expectRoom('L075', 'Le Taquin', 'salle_concert', null);
  });
});

describe('axesTagsOf', () => {
  it('returns namespaced keys, without moods, plus calculated budget and jauge', () => {
    const item = seance({
      evenement: evenement({
        prix: '',
        gratuit: 'non',
        tags_v2: {
          moods: ['epique', 'intense', 'poetique'],
          sortie: ['evasion'],
          energie: '5',
          exigence: '2',
          format_scene: ['groupe'],
          ideal_pour: ['amis'],
          notoriete: 'emergent',
        },
      }),
      programme: { prix_item: '12€' },
      lieu: lieu({ lieu_id: 'L-BAR', type: 'bar_scene' }),
    });
    assert.deepEqual(axesTagsOf(item), [
      'sortie:evasion',
      'energie:5',
      'exigence:2',
      'format:groupe',
      'pour:amis',
      'noto:emergent',
      'budget:lt15',
      'jauge:petite',
    ]);
  });

  it('still emits budget and jauge when the work has no v2 row', () => {
    const item = fallback({
      evenement: { prix: 'Tarif unique : 28€', gratuit: 'non', moods: 'rigolo' },
      lieu: lieu({ type: 'smac' }),
    });
    assert.deepEqual(axesTagsOf(item), ['budget:15_35', 'jauge:moyenne']);
  });

  it('omits budget nc and an unknown jauge', () => {
    const item = fallback({
      evenement: { prix: '', gratuit: 'non' },
      lieu: lieu({ type: 'cinema' }),
    });
    assert.deepEqual(axesTagsOf(item), []);
  });
});

describe('load join on the real catalogue', () => {
  it('empty tags file attaches nothing and does not rewrite v1 moods', () => {
    const raw = loadEvenements();
    const data = loadCultureData();
    assert.ok(raw.length > 0);
    assert.equal(data.evenements.length, raw.length);
    for (let i = 0; i < raw.length; i++) {
      assert.equal(data.evenements[i].event_id, raw[i].event_id);
      assert.equal(data.evenements[i].moods ?? '', raw[i].moods ?? '');
      assert.equal(data.evenements[i].tags_v2, undefined);
    }
    const seanceRow = data.programmeWithContext.find((row) => row.evenement);
    assert.ok(seanceRow);
    assert.equal(seanceRow.evenement?.tags_v2, undefined);
    assert.deepEqual(
      eventTagsOf({
        kind: 'programme',
        key: seanceRow.programme.programme_id,
        dayIso: seanceRow.programme.date,
        programme: seanceRow.programme,
        evenement: seanceRow.evenement,
        lieu: seanceRow.lieu,
      }),
      {},
    );
  });
});

describe('reco scoring ignores tags_v2', () => {
  const NOW = new Date('2026-09-01T12:00:00+02:00');

  function card(opts: {
    key: string;
    cat: string;
    moods?: string;
    genre?: string;
    titre?: string;
    filmId?: string;
    tags?: EventTagsV2;
  }): DayItem {
    return {
      kind: 'programme',
      key: opts.key,
      dayIso: '2026-09-02',
      programme: programme({
        programme_id: `p-${opts.key}`,
        event_id: opts.key,
        nom_item: opts.titre ?? opts.key,
        genre: opts.genre ?? '',
        moods: opts.moods,
        film_id: opts.filmId,
      }),
      evenement: evenement({
        event_id: opts.key,
        categorie: opts.cat,
        titre: opts.titre ?? opts.key,
        genre: opts.genre ?? '',
        moods: opts.moods,
        tags_v2: opts.tags,
      }),
      lieu: lieu(),
    };
  }

  it('a v2 row does not change the score or the matched mood', () => {
    const fillers = [
      card({
        key: 'cine',
        cat: 'cinema',
        filmId: 'F-R',
        moods: 'leger',
        genre: 'comedie',
        titre: 'Film leger',
      }),
      card({
        key: 'concert',
        cat: 'musique',
        moods: 'festif',
        genre: 'electro',
        titre: 'Club',
      }),
    ];
    const plain = card({
      key: 'theatre',
      cat: 'theatre',
      moods: 'rigolo',
      genre: 'humour_standup',
      titre: 'Stand-up',
    });
    const tagged = card({
      key: 'theatre',
      cat: 'theatre',
      moods: 'rigolo',
      genre: 'humour_standup',
      titre: 'Stand-up',
      tags: {
        moods: ['sombre', 'intense'],
        sortie: ['evasion'],
        energie: '1',
        tag_confiance: 'basse',
      },
    });
    const state = emptyTasteState();
    state.profile = {
      ...emptyProfile(),
      moods: {
        rigolo: { weight: 10, pct: 20 },
        sombre: { weight: 40, pct: 80 },
      },
    };
    const score = (item: DayItem) => {
      const out = recommendForProfile([item, ...fillers], state, 3, { now: NOW });
      const row = out.find((scored) => scored.item.key === 'theatre');
      assert.ok(row);
      return row;
    };
    const a = score(plain);
    const b = score(tagged);
    assert.equal(a.reason?.source, 'profile');
    assert.equal(a.reason?.mood, 'rigolo');
    assert.equal(b.reason?.source, 'profile');
    assert.equal(b.reason?.mood, 'rigolo');
    assert.equal(a.score, b.score);
  });
});
