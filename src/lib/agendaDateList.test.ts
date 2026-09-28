import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AGENDA_HTTP_CACHE_CONTROL,
  agendaListCacheKeyParts,
  buildAgendaParams,
  dateChipListGate,
  listFetchShouldSkipBoot,
  listFetchShouldSkipBootGps,
} from './agendaParams';
import { homePackShellVisible } from './displayHome';
import type { TimeScopeId } from './timeScope';
import { nearMeFromBoot } from './nearMe';
import {
  filterSeancesForActiveFilters,
  listDisplayFilter,
  relatedSeancesFilter,
} from './displayFilter';
import { resolveScopeRange } from './timeScope';
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
    date_debut: '2026-09-01',
    date_fin: '2026-09-01',
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
  p: Partial<ProgrammeItem> &
    Pick<ProgrammeItem, 'programme_id' | 'event_id' | 'nom_item'>,
): ProgrammeItem {
  return {
    lieu_id: 'L1',
    type_item: '',
    date: '2026-09-01',
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

function item(opts: { key: string; cat: string; day: string; genre?: string }): DayItem {
  const evenement = ev({
    event_id: opts.key,
    categorie: opts.cat,
    titre: opts.key,
    date_debut: opts.day,
    date_fin: opts.day,
    genre: opts.genre ?? '',
  });
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: opts.day,
    programme: prog({
      programme_id: `p-${opts.key}`,
      event_id: opts.key,
      nom_item: opts.key,
      date: opts.day,
      genre: opts.genre ?? '',
    }),
    evenement,
    lieu: lieu(),
  };
}

describe('listFetchShouldSkipBoot', () => {
  it('skips the boot tous snapshot only', () => {
    assert.equal(listFetchShouldSkipBoot(true, 'tous', null), true);
    assert.equal(listFetchShouldSkipBoot(false, 'tous', null), false);
    assert.equal(listFetchShouldSkipBoot(true, 'tous', null, 'tous'), true);
  });

  it('never skips a selected calendar day', () => {
    assert.equal(listFetchShouldSkipBoot(true, 'date', '2026-09-19'), false);
    assert.equal(listFetchShouldSkipBoot(false, 'date', '2026-09-19'), false);
  });

  const dateChips = ['soir', 'aujourdhui', 'weekend', 'semaine'] as const;

  it('never skips a date chip when skip was armed for tous', () => {
    for (const scope of dateChips) {
      assert.equal(listFetchShouldSkipBoot(true, scope, null, 'tous'), false);
      assert.equal(
        listFetchShouldSkipBoot(true, scope, '2026-09-28', 'tous'),
        false,
      );
      assert.equal(listFetchShouldSkipBoot(true, scope, null, null), false);
      assert.equal(listFetchShouldSkipBoot(true, scope, null), false);
      assert.equal(listFetchShouldSkipBoot(true, scope, null, scope), true);
      assert.equal(listFetchShouldSkipBoot(false, scope, null, 'tous'), false);
    }
  });

  it('restore tous then Ce soir still requests soir', () => {
    let skip = true;
    let armed: TimeScopeId | null = 'tous';
    assert.equal(listFetchShouldSkipBoot(skip, 'tous', null, armed), true);
    skip = true;
    armed = 'tous';
    assert.equal(
      listFetchShouldSkipBoot(skip, 'soir', '2026-09-28', armed),
      false,
    );
  });

  it('denied geolocation keeps Toulouse and does not swallow the first Ce soir', () => {
    const denied = nearMeFromBoot({ ok: false, reason: 'denied' });
    assert.equal(denied.commune, 'Toulouse');
    assert.equal(denied.active, false);
    // Deny does not change commune, so the list effect does not re-run and
    // the one-shot stays armed until the next QUAND click.
    const armedAfterDeny = true;
    assert.equal(listFetchShouldSkipBootGps(armedAfterDeny, 'tous', 0), true);
    for (const scope of [...dateChips, 'date'] as const) {
      assert.equal(listFetchShouldSkipBootGps(armedAfterDeny, scope, 0), false);
    }
    assert.equal(listFetchShouldSkipBootGps(true, 'tous', 1), false);
    assert.equal(listFetchShouldSkipBootGps(false, 'tous', 0), false);
  });

  it('home wires armed skip, pending totals, and a failed GET', async () => {
    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    assert.match(app, /skipListFetchScope/);
    assert.match(app, /listFetchShouldSkipBootGps/);
    assert.match(app, /beginDateChipFetch\(scope\)/);
    assert.match(
      app,
      /function beginDateChipFetch\(scope: TimeScopeId\) \{\n\s+releaseBootListSkip\(\);\n\s+skipListFetchBootGps\.current = false;/,
    );
    assert.match(app, /markDateChipListPending\(timeScope\)/);
    assert.match(app, /packTotal: dateChipPending \? 0 : cineTotal/);
    assert.equal(app.includes('keep previous window'), false);
  });
});

describe('dateChipListGate', () => {
  it('Ce soir without a snapshot stays pending and drops the stale cine total', () => {
    const gate = dateChipListGate({
      scope: 'soir',
      hasSnapshot: false,
      listSettled: false,
    });
    assert.deepEqual(gate, {
      cataloguePending: true,
      clearStalePackTotals: true,
    });
    const packTotal = gate.clearStalePackTotals ? 0 : 48;
    assert.equal(
      homePackShellVisible({
        sectionAllowed: true,
        rowCount: 0,
        packTotal,
        cataloguePending: gate.cataloguePending,
      }),
      true,
    );
    assert.equal(
      homePackShellVisible({
        sectionAllowed: true,
        rowCount: 0,
        packTotal: 48,
        cataloguePending: false,
      }),
      true,
    );
  });

  it('applyList empty soir closes the cine shell', () => {
    const gate = dateChipListGate({
      scope: 'soir',
      hasSnapshot: false,
      listSettled: true,
    });
    assert.equal(gate.cataloguePending, false);
    assert.equal(gate.clearStalePackTotals, false);
    assert.equal(
      homePackShellVisible({
        sectionAllowed: true,
        rowCount: 0,
        packTotal: 0,
        cataloguePending: false,
      }),
      false,
    );
  });

  it('failed GET stays pending instead of keeping the daytime total', () => {
    const gate = dateChipListGate({
      scope: 'soir',
      hasSnapshot: false,
      listSettled: false,
    });
    assert.equal(gate.cataloguePending, true);
    assert.equal(gate.clearStalePackTotals, true);
  });

  it('a same-chip snapshot does not clear totals', () => {
    assert.deepEqual(
      dateChipListGate({
        scope: 'soir',
        hasSnapshot: true,
        listSettled: false,
      }),
      { cataloguePending: false, clearStalePackTotals: false },
    );
  });

  it('tous restore is not a date-chip pending gate', () => {
    assert.deepEqual(
      dateChipListGate({
        scope: 'tous',
        hasSnapshot: false,
        listSettled: false,
      }),
      { cataloguePending: false, clearStalePackTotals: false },
    );
  });

  for (const scope of ['aujourdhui', 'weekend', 'semaine', 'date'] as const) {
    it(`${scope} without a snapshot clears stale pack totals`, () => {
      assert.deepEqual(
        dateChipListGate({ scope, hasSnapshot: false, listSettled: false }),
        { cataloguePending: true, clearStalePackTotals: true },
      );
    });
  }
});

describe('buildAgendaParams date chip', () => {
  it('sends date when Date… has a selected day', () => {
    const p = buildAgendaParams({
      scope: 'date',
      commune: 'Toulouse',
      q: '',
      cats: [],
      genres: [],
      lieuId: null,
      selectedDate: '2026-09-19',
      year: 2026,
      month: 9,
    });
    assert.equal(p.get('scope'), 'date');
    assert.equal(p.get('date'), '2026-09-19');
    assert.equal(p.get('commune'), 'Toulouse');
    assert.equal(p.get('counts'), null);
  });

  it('does not send date for tous', () => {
    const p = buildAgendaParams({
      scope: 'tous',
      commune: 'Toulouse',
      q: '',
      cats: [],
      genres: [],
      lieuId: null,
      selectedDate: '2026-09-19',
      year: 2026,
      month: 9,
    });
    assert.equal(p.get('date'), null);
  });
});

describe('agendaListCacheKeyParts', () => {
  const base = {
    scope: 'date' as const,
    year: 2026,
    month: 9,
    cats: [] as string[],
    commune: 'Toulouse',
    lieuId: null as string | null,
    genres: [] as string[],
    parisDay: '2026-09-01',
  };

  it('distinguishes two calendar days', () => {
    const a = agendaListCacheKeyParts({
      ...base,
      selectedDate: '2026-09-01',
    }).join('|');
    const b = agendaListCacheKeyParts({
      ...base,
      selectedDate: '2026-09-19',
    }).join('|');
    assert.notEqual(a, b);
    assert.ok(b.includes('2026-09-19'));
  });

  it('distinguishes date day from unfiltered upcoming', () => {
    const tous = agendaListCacheKeyParts({
      ...base,
      scope: 'tous',
      selectedDate: null,
    }).join('|');
    const day = agendaListCacheKeyParts({
      ...base,
      selectedDate: '2026-09-19',
    }).join('|');
    assert.notEqual(tous, day);
  });

  it('uses the slim list cache generation', () => {
    const key = agendaListCacheKeyParts({
      ...base,
      selectedDate: '2026-09-01',
    }).join('|');
    assert.ok(key.includes('date-scope-slim-v2'));
  });

  it('HTTP agenda is no-store (Paris-day server cache only)', () => {
    assert.ok(AGENDA_HTTP_CACHE_CONTROL.includes('no-store'));
    assert.ok(AGENDA_HTTP_CACHE_CONTROL.includes('private'));
    assert.ok(AGENDA_HTTP_CACHE_CONTROL.includes('max-age=0'));
  });
});

describe('calendar day vs upcoming first page', () => {
  it('scope=date + selected day is that day only', () => {
    const range = resolveScopeRange(
      'date',
      '2026-09-19',
      new Date('2026-09-01T12:00:00+02:00'),
      { year: 2026, month: 9 },
    );
    assert.equal(range.startIso, '2026-09-19');
    assert.equal(range.endIso, '2026-09-19');
    assert.deepEqual(range.days, ['2026-09-19']);
  });

  it('client date filter empties an upcoming first page that starts 1 Sept', () => {
    const upcomingPage = Array.from({ length: 29 }, (_, i) =>
      item({
        key: `early-${i}`,
        cat: i % 2 === 0 ? 'cinema' : 'theatre',
        day: `2026-09-0${(i % 8) + 1}`,
      }),
    );
    const onDay = filterSeancesForActiveFilters(upcomingPage, {
      startIso: '2026-09-19',
      endIso: '2026-09-19',
      commune: 'Toulouse',
    });
    assert.equal(onDay.length, 0);

    const dayPage = [
      item({ key: 'cine-19', cat: 'cinema', day: '2026-09-19' }),
      item({ key: 'live-19', cat: 'theatre', day: '2026-09-19' }),
      item({ key: 'concert-19', cat: 'musique', day: '2026-09-19' }),
    ];
    const kept = filterSeancesForActiveFilters(dayPage, {
      startIso: '2026-09-19',
      endIso: '2026-09-19',
      commune: 'Toulouse',
    });
    assert.equal(kept.length, 3);
    assert.ok(kept.every((row) => row.dayIso === '2026-09-19'));
  });

  it('Jazz genre chip filters with aujourd’hui date window', () => {
    const kept = filterSeancesForActiveFilters(
      [
        item({
          key: 'jazz-1',
          cat: 'musique',
          day: '2026-09-09',
          genre: 'jazz_blues',
        }),
        item({
          key: 'kara',
          cat: 'musique',
          day: '2026-09-09',
          genre: 'karaoke',
        }),
        item({
          key: 'jam-balkan',
          cat: 'musique',
          day: '2026-09-09',
          genre: 'jam',
        }),
        item({
          key: 'jazz-raw',
          cat: 'musique',
          day: '2026-09-09',
          genre: 'jazz',
        }),
      ],
      {
        startIso: '2026-09-09',
        endIso: '2026-09-09',
        commune: 'Toulouse',
        genres: ['jazz'],
      },
    );
    assert.deepEqual(
      kept.map((row) => row.key).sort(),
      ['jazz-1', 'jazz-raw'].sort(),
    );
  });

  it('Toulouse chip stays exact commune', () => {
    const mix: DayItem[] = [
      {
        ...item({ key: 'tls', cat: 'theatre', day: '2026-09-19' }),
        lieu: lieu('Toulouse'),
      },
      {
        ...item({ key: 'blg', cat: 'theatre', day: '2026-09-19' }),
        lieu: lieu('Blagnac'),
      },
    ];
    const kept = filterSeancesForActiveFilters(mix, {
      startIso: '2026-09-19',
      endIso: '2026-09-19',
      commune: 'Toulouse',
    });
    assert.deepEqual(
      kept.map((row) => row.key),
      ['tls'],
    );
  });

  it('title search keeps Ramonville rows despite a Toulouse chip', () => {
    const fleur: DayItem = {
      ...item({ key: 'p:FEP0029', cat: 'festival', day: '2026-09-11' }),
      lieu: lieu('Ramonville-Saint-Agne'),
    };
    const toulouseFilter = {
      startIso: '2026-09-08',
      endIso: '2026-11-08',
      commune: 'Toulouse',
    };
    assert.equal(
      filterSeancesForActiveFilters([fleur], toulouseFilter).length,
      0,
    );
    assert.equal(
      filterSeancesForActiveFilters(
        [fleur],
        listDisplayFilter(toulouseFilter, { searching: true }),
      ).length,
      1,
    );
  });

  it('living-arts related seances ignore commune; cinema keeps it', () => {
    const fleur: DayItem = {
      ...item({ key: 'p:FEP0029', cat: 'festival', day: '2026-09-11' }),
      lieu: lieu('Ramonville-Saint-Agne'),
    };
    const cine: DayItem = {
      ...item({ key: 'p:C1', cat: 'cinema', day: '2026-09-11' }),
      lieu: lieu('Ramonville-Saint-Agne'),
    };
    const toulouseFilter = {
      startIso: '2026-09-08',
      endIso: '2026-11-08',
      commune: 'Toulouse',
    };
    assert.equal(
      filterSeancesForActiveFilters(
        [fleur],
        relatedSeancesFilter(toulouseFilter, fleur),
      ).length,
      1,
    );
    assert.equal(
      filterSeancesForActiveFilters(
        [cine],
        relatedSeancesFilter(toulouseFilter, cine),
      ).length,
      0,
    );
  });
});
