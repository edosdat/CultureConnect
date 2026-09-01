import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agendaListCacheKeyParts,
  buildAgendaParams,
  listFetchShouldSkipBoot,
} from './agendaParams';
import { filterSeancesForActiveFilters } from './displayFilter';
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

function item(opts: { key: string; cat: string; day: string }): DayItem {
  const evenement = ev({
    event_id: opts.key,
    categorie: opts.cat,
    titre: opts.key,
    date_debut: opts.day,
    date_fin: opts.day,
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
    }),
    evenement,
    lieu: lieu(),
  };
}

describe('listFetchShouldSkipBoot', () => {
  it('skips the boot tous snapshot only', () => {
    assert.equal(listFetchShouldSkipBoot(true, 'tous', null), true);
    assert.equal(listFetchShouldSkipBoot(false, 'tous', null), false);
  });

  it('never skips a selected calendar day', () => {
    assert.equal(listFetchShouldSkipBoot(true, 'date', '2026-09-19'), false);
    assert.equal(listFetchShouldSkipBoot(false, 'date', '2026-09-19'), false);
  });
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
});
