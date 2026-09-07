import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterSeancesForActiveFilters } from './displayFilter';
import { itemMatchesCommune } from './commune';
import {
  cineRows,
  fillEmptyCineFromPool,
  findDayItemByKey,
  enfantsRows,
  expoRows,
  homeSectionsVisible,
  musiqueRows,
  resolveHomeCardOpen,
  resolveSearchSubmit,
  SEARCH_EXAMPLES,
  searchExampleIsVivant,
  searchExamplesVisible,
  shouldInvalidateProfileRecoCache,
  theatreRows,
  visibleTop3Items,
} from './displayHome';
import { isTasteMood } from './phraseTags';
import { TASTE_MOOD_LABELS_FR } from './pourToi';
import { slotFormOfItem } from './reco';
import {
  homePackOfItem,
  isCinemaDayItem,
  isEnfantsDayItem,
  isExpoDayItem,
  isMusiqueDayItem,
  isTheatreDayItem,
} from './nouveautesCine';
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
    description_courte: 'Pitch court',
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
  filmId?: string;
  eventId?: string;
  title?: string;
  genre?: string;
  form?: string;
}): DayItem {
  const eventId = opts.eventId ?? opts.key;
  const title = opts.title ?? opts.key;
  const evenement = ev({
    event_id: eventId,
    categorie: opts.cat,
    titre: title,
    genre: opts.genre ?? '',
    form: opts.form,
    date_debut: opts.day ?? '2026-09-02',
    date_fin: opts.day ?? '2026-09-02',
  });
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: opts.day ?? '2026-09-02',
    programme: prog({
      programme_id: `p-${opts.key}`,
      event_id: eventId,
      nom_item: title,
      date: opts.day ?? '2026-09-02',
      genre: opts.genre ?? '',
      form: opts.form,
      film_id: opts.filmId,
    }),
    evenement,
    lieu: lieu(),
  };
}

describe('homeSectionsVisible', () => {
  it('no chip → all five packs', () => {
    assert.deepEqual(homeSectionsVisible([]), {
      cine: true,
      theatre: true,
      musique: true,
      enfants: true,
      expo: true,
    });
  });

  it('Cinéma only hides theatre, musique, enfants and expos', () => {
    assert.deepEqual(homeSectionsVisible(['cinema']), {
      cine: true,
      theatre: false,
      musique: false,
      enfants: false,
      expo: false,
    });
  });

  it('Musique only hides cine, theatre, enfants and expos', () => {
    assert.deepEqual(homeSectionsVisible(['musique']), {
      cine: false,
      theatre: false,
      musique: true,
      enfants: false,
      expo: false,
    });
  });

  it('Théâtre only hides cine, musique, enfants and expos', () => {
    assert.deepEqual(homeSectionsVisible(['theatre_danse']), {
      cine: false,
      theatre: true,
      musique: false,
      enfants: false,
      expo: false,
    });
  });

  it('Cinéma + Musique keeps those two', () => {
    assert.deepEqual(homeSectionsVisible(['cinema', 'musique']), {
      cine: true,
      theatre: false,
      musique: true,
      enfants: false,
      expo: false,
    });
  });

  it('extra chips do not hide the five packs', () => {
    assert.deepEqual(homeSectionsVisible(['festival']), {
      cine: true,
      theatre: true,
      musique: true,
      enfants: true,
      expo: true,
    });
    assert.deepEqual(homeSectionsVisible(['expo_patrimoine', 'enfants_famille']), {
      cine: true,
      theatre: true,
      musique: true,
      enfants: true,
      expo: true,
    });
  });
});

describe('home pack classifiers', () => {
  it('keeps films in cine only', () => {
    const film = item({ key: 'f1', cat: 'cinema', filmId: 'F1' });
    assert.equal(isCinemaDayItem(film), true);
    assert.equal(isTheatreDayItem(film), false);
    assert.equal(isMusiqueDayItem(film), false);
    assert.equal(homePackOfItem(film), 'cine');
  });

  it('maps theatre / danse / spectacle, not concerts', () => {
    const piece = item({ key: 'th1', cat: 'theatre' });
    const danse = item({ key: 'd1', cat: 'danse' });
    const concert = item({ key: 'c1', cat: 'concert' });
    assert.equal(isTheatreDayItem(piece), true);
    assert.equal(isTheatreDayItem(danse), true);
    assert.equal(isTheatreDayItem(concert), false);
    assert.equal(isMusiqueDayItem(concert), true);
    assert.equal(homePackOfItem(piece), 'theatre');
    assert.equal(homePackOfItem(concert), 'musique');
  });

  it('maps bars / fest music to musique, fest theatre to theatre', () => {
    const bar = item({ key: 'g1', cat: 'guinguette' });
    const festMusic = item({
      key: 'fm1',
      cat: 'festival',
      genre: 'rock_metal_punk',
    });
    const festTheatre = item({
      key: 'ft1',
      cat: 'festival',
      genre: 'theatre_contemporain',
    });
    assert.equal(isMusiqueDayItem(bar), true);
    assert.equal(isMusiqueDayItem(festMusic), true);
    assert.equal(isTheatreDayItem(festTheatre), true);
    assert.equal(isTheatreDayItem(festMusic), false);
    assert.equal(isMusiqueDayItem(festTheatre), false);
  });

  it('maps expo / enfants to their own packs, not theatre or musique', () => {
    const expo = item({ key: 'e1', cat: 'exposition' });
    const expoVisit = item({ key: 'ev1', cat: 'expo_visite' });
    const expoPat = item({ key: 'ep1', cat: 'expo_patrimoine' });
    const kids = item({ key: 'k1', cat: 'enfants_famille' });
    const atelier = item({ key: 'a1', cat: 'atelier' });
    assert.equal(homePackOfItem(expo), 'expo');
    assert.equal(homePackOfItem(expoVisit), 'expo');
    assert.equal(homePackOfItem(expoPat), 'expo');
    assert.equal(homePackOfItem(kids), 'enfants');
    assert.equal(homePackOfItem(atelier), 'enfants');
    assert.equal(isExpoDayItem(expo), true);
    assert.equal(isExpoDayItem(expoVisit), true);
    assert.equal(isEnfantsDayItem(kids), true);
    assert.equal(isEnfantsDayItem(atelier), true);
    assert.equal(isTheatreDayItem(expo), false);
    assert.equal(isMusiqueDayItem(expo), false);
    assert.equal(isTheatreDayItem(kids), false);
    assert.equal(isMusiqueDayItem(kids), false);
  });
});

describe('pack rows + date filter', () => {
  const emptyTop3 = new Set<string>();
  const mix: DayItem[] = [
    item({ key: 'cine-2', cat: 'cinema', day: '2026-09-02', filmId: 'F2' }),
    item({ key: 'th-2', cat: 'theatre', day: '2026-09-02' }),
    item({ key: 'mu-2', cat: 'concert', day: '2026-09-02' }),
    item({ key: 'enf-2', cat: 'enfants_famille', day: '2026-09-02' }),
    item({ key: 'ex-2', cat: 'exposition', day: '2026-09-02' }),
    item({ key: 'cine-5', cat: 'cinema', day: '2026-09-05', filmId: 'F5' }),
    item({ key: 'th-5', cat: 'theatre', day: '2026-09-05' }),
    item({ key: 'mu-5', cat: 'concert', day: '2026-09-05' }),
    item({ key: 'enf-5', cat: 'enfants_famille', day: '2026-09-05' }),
    item({ key: 'ex-5', cat: 'exposition', day: '2026-09-05' }),
  ];

  it('splits catalogue into three packs without collapsing living arts', () => {
    const cine = cineRows(mix, emptyTop3).map((r) => r.item.key);
    const theatre = theatreRows(mix, emptyTop3).map((r) => r.item.key);
    const musique = musiqueRows(mix, emptyTop3).map((r) => r.item.key);
    const enfants = enfantsRows(mix, emptyTop3).map((r) => r.item.key);
    const expos = expoRows(mix, emptyTop3).map((r) => r.item.key);
    assert.ok(cine.includes('cine-2') && cine.includes('cine-5'));
    assert.ok(theatre.includes('th-2') && theatre.includes('th-5'));
    assert.ok(musique.includes('mu-2') && musique.includes('mu-5'));
    assert.ok(enfants.includes('enf-2') && enfants.includes('enf-5'));
    assert.ok(expos.includes('ex-2') && expos.includes('ex-5'));
    assert.equal(cine.some((k) => k.startsWith('th-') || k.startsWith('mu-')), false);
    assert.equal(theatre.some((k) => k.startsWith('cine-') || k.startsWith('mu-')), false);
    assert.equal(musique.some((k) => k.startsWith('cine-') || k.startsWith('th-')), false);
    assert.equal(enfants.some((k) => k.startsWith('cine-') || k.startsWith('mu-')), false);
    assert.equal(expos.some((k) => k.startsWith('cine-') || k.startsWith('th-')), false);
  });

  it('visibleTop3 keeps a film_id row as cine even without cinema categorie', () => {
    const film = item({
      key: 'fid',
      cat: 'autre',
      filmId: 'F-KEEP',
    });
    const top = visibleTop3Items([
      film,
      item({ key: 'th', cat: 'theatre' }),
      item({ key: 'co', cat: 'concert' }),
    ]);
    assert.equal(top.length, 3);
    assert.ok(top.some((row) => slotFormOfItem(row) === 'cine'));
  });

  it('tous reco does not re-apply day/soir window', () => {
    const cine = item({
      key: 'cine-far',
      cat: 'cinema',
      day: '2026-12-01',
      filmId: 'F-FAR',
    });
    const kept = filterSeancesForActiveFilters(
      [
        cine,
        item({ key: 'th-2', cat: 'theatre', day: '2026-09-02' }),
      ],
      {
        startIso: '2026-09-01',
        endIso: '2026-09-08',
        soir: true,
        commune: 'Toulouse',
        skipDateWindow: true,
      },
    );
    assert.ok(kept.some((row) => row.key === 'cine-far'));
  });

  it('keeps a film_id when lieu.commune is missing; filters when lieu has a commune', () => {
    const noCommune = {
      ...item({ key: 'fid-nc', cat: 'cinema', filmId: 'F-NC' }),
      lieu: { ...lieu(), commune: '' },
    };
    const noLieu = { ...item({ key: 'fid-nl', cat: 'cinema', filmId: 'F-NL' }), lieu: null };
    const labege = {
      ...item({ key: 'fid-lb', cat: 'cinema', filmId: 'F-LB' }),
      lieu: lieu('Labège'),
    };
    const toulouse = item({ key: 'fid-tl', cat: 'cinema', filmId: 'F-TL' });
    assert.equal(itemMatchesCommune(noCommune, 'Toulouse'), true);
    assert.equal(itemMatchesCommune(noLieu, 'Toulouse'), true);
    assert.equal(itemMatchesCommune(labege, 'Toulouse'), false);
    assert.equal(itemMatchesCommune(toulouse, 'Toulouse'), true);
    const livingNoCommune = {
      ...item({ key: 'th-nc', cat: 'theatre' }),
      lieu: { ...lieu(), commune: '' },
    };
    assert.equal(itemMatchesCommune(livingNoCommune, 'Toulouse'), false);
  });

  it('fillEmptyCineFromPool takes a film from the carousel pool', () => {
    const reco = [
      item({ key: 'th-2', cat: 'theatre', day: '2026-09-02' }),
      item({ key: 'mu-2', cat: 'concert', day: '2026-09-02' }),
    ];
    const pool = [
      item({ key: 'cine-5', cat: 'cinema', day: '2026-09-05', filmId: 'F5' }),
    ];
    const filled = fillEmptyCineFromPool(reco, pool);
    const top = visibleTop3Items(filled);
    assert.equal(top.length, 3);
    assert.ok(top.some((row) => slotFormOfItem(row) === 'cine'));
  });

  it('invalidates profileReco cache that lacks 3 buckets while carousel has cine', () => {
    const cached = [
      item({ key: 'th-2', cat: 'theatre' }),
      item({ key: 'mu-2', cat: 'concert' }),
    ];
    assert.equal(shouldInvalidateProfileRecoCache(cached, 4), true);
    assert.equal(shouldInvalidateProfileRecoCache(cached, 0), false);
    const full = [
      item({ key: 'cine-2', cat: 'cinema', filmId: 'F2' }),
      item({ key: 'th-2', cat: 'theatre' }),
      item({ key: 'mu-2', cat: 'concert' }),
    ];
    assert.equal(shouldInvalidateProfileRecoCache(full, 4), false);
  });

  it('cine pack shows one card per film work; live pack one card per title', () => {
    const clones: DayItem[] = [
      item({
        key: 'cine-a',
        cat: 'cinema',
        day: '2026-09-02',
        filmId: 'F-GAULLE',
        title: 'La Bataille de Gaulle',
      }),
      item({
        key: 'cine-b',
        cat: 'cinema',
        day: '2026-09-02',
        filmId: 'F-GAULLE',
        title: 'La Bataille de Gaulle',
        eventId: 'E-other-salle',
      }),
      item({
        key: 'bulle-1',
        cat: 'theatre',
        day: '2026-09-02',
        eventId: 'E351',
        title: 'La Bulle',
      }),
      item({
        key: 'bulle-2',
        cat: 'theatre',
        day: '2026-09-03',
        eventId: 'E351',
        title: 'La Bulle',
      }),
    ];
    const cine = cineRows(clones, emptyTop3);
    const theatre = theatreRows(clones, emptyTop3);
    assert.equal(cine.length, 1);
    assert.equal(cine[0]!.seances.length, 2);
    assert.equal(theatre.length, 1);
    assert.equal(theatre[0]!.seances.length, 2);
  });

  it('DATE window filters séances inside each pack', () => {
    const onDay = filterSeancesForActiveFilters(mix, {
      startIso: '2026-09-05',
      endIso: '2026-09-05',
      commune: 'Toulouse',
    });
    assert.deepEqual(
      cineRows(onDay, emptyTop3).map((r) => r.item.key),
      ['cine-5'],
    );
    assert.deepEqual(
      theatreRows(onDay, emptyTop3).map((r) => r.item.key),
      ['th-5'],
    );
    assert.deepEqual(
      musiqueRows(onDay, emptyTop3).map((r) => r.item.key),
      ['mu-5'],
    );
    assert.deepEqual(
      enfantsRows(onDay, emptyTop3).map((r) => r.item.key),
      ['enf-5'],
    );
    assert.deepEqual(
      expoRows(onDay, emptyTop3).map((r) => r.item.key),
      ['ex-5'],
    );
  });
});

describe('top 3 click opens fiche outside QUOI grid', () => {
  const theatre = item({ key: 'p:P1847', cat: 'theatre' });
  const concert = item({ key: 'p:P99', cat: 'concert' });
  const cine = item({ key: 'p:P12', cat: 'cinema', filmId: 'F12' });
  const cinemaGrid = [cine];
  const top3 = [cine, theatre, concert];

  it('finds a theatre in Top 3 even when the filtered cinema list lacks it', () => {
    assert.equal(findDayItemByKey(theatre.key, cinemaGrid), null);
    assert.equal(findDayItemByKey(theatre.key, cinemaGrid, top3), theatre);
    assert.equal(homeSectionsVisible(['cinema']).theatre, false);
  });

  it('Top 3 click always opens the fiche, including theatre / concert', () => {
    assert.deepEqual(resolveHomeCardOpen(theatre.key, theatre, 'top3'), {
      mode: 'fiche',
      key: theatre.key,
    });
    assert.deepEqual(resolveHomeCardOpen(concert.key, concert, 'top3'), {
      mode: 'fiche',
      key: concert.key,
    });
    assert.deepEqual(resolveHomeCardOpen(cine.key, cine, 'top3'), {
      mode: 'fiche',
      key: cine.key,
    });
  });

  it('grid pack cards still focus their strip', () => {
    assert.deepEqual(resolveHomeCardOpen(theatre.key, theatre, 'grid'), {
      mode: 'pack',
      pack: 'theatre',
      key: theatre.key,
    });
    assert.deepEqual(resolveHomeCardOpen(cine.key, cine, 'grid'), {
      mode: 'pack',
      pack: 'cine',
      key: cine.key,
    });
    const kids = item({ key: 'p:K1', cat: 'enfants_famille' });
    const expo = item({ key: 'p:X1', cat: 'exposition' });
    assert.deepEqual(resolveHomeCardOpen(kids.key, kids, 'grid'), {
      mode: 'pack',
      pack: 'enfants',
      key: kids.key,
    });
    assert.deepEqual(resolveHomeCardOpen(expo.key, expo, 'grid'), {
      mode: 'pack',
      pack: 'expo',
      key: expo.key,
    });
  });
});

describe('search example chips', () => {
  const NOW = new Date('2026-09-01T14:00:00+02:00');

  it('locks the three French labels', () => {
    assert.deepEqual(
      SEARCH_EXAMPLES.map((e) => e.label),
      [
        'un truc intimiste ce WE',
        'envie de rire',
        'concert près du centre',
      ],
    );
  });

  it('maps intimiste WE to Ce WE + vivant QUOI + locked Intimiste', () => {
    const intent = resolveSearchSubmit('un truc intimiste ce WE', NOW);
    assert.equal(intent.parsed.scope, 'weekend');
    assert.deepEqual(intent.parsed.categories, ['theatre_danse', 'musique']);
    assert.deepEqual(intent.phraseTags?.moods, ['intimiste']);
    assert.equal(intent.titleQuery, '');
    assert.equal(TASTE_MOOD_LABELS_FR.intimiste, 'Intimiste');
    assert.equal(homeSectionsVisible(intent.parsed.categories).cine, false);
  });

  it('maps envie de rire to locked Ambiances Rire / rigolo', () => {
    const intent = resolveSearchSubmit('envie de rire', NOW);
    assert.deepEqual(intent.phraseTags?.moods, ['rigolo']);
    assert.equal(intent.parsed.scope, null);
    assert.equal(intent.titleQuery, '');
    assert.equal(TASTE_MOOD_LABELS_FR.rigolo, 'Rire');
    assert.equal(isTasteMood('rigolo'), true);
  });

  it('maps concert près du centre to Musique + Toulouse, no GPS field', () => {
    const intent = resolveSearchSubmit('concert près du centre', NOW);
    assert.deepEqual(intent.parsed.categories, ['musique']);
    assert.equal(intent.commune, 'Toulouse');
    assert.equal(intent.phraseTags?.form, 'concert');
    assert.equal(intent.titleQuery, '');
    assert.equal('lat' in intent, false);
    assert.equal('lng' in intent, false);
  });

  it('at least two examples land on vivant, never a 17th mood', () => {
    const vivantCount = SEARCH_EXAMPLES.filter((e) =>
      searchExampleIsVivant(e.query, NOW),
    ).length;
    assert.ok(vivantCount >= 2);
    for (const ex of SEARCH_EXAMPLES) {
      const moods = resolveSearchSubmit(ex.query, NOW).phraseTags?.moods ?? [];
      for (const m of moods) assert.equal(isTasteMood(m), true);
    }
  });

  it('shows examples on boot / clear-all / date-only, hides on QUOI or query', () => {
    const empty = {
      selectedCategories: [] as string[],
      query: '',
      committedTitle: '',
    };
    assert.equal(searchExamplesVisible(empty), true);
    assert.equal(
      searchExamplesVisible({ ...empty, query: '   ' }),
      true,
    );
    for (const scope of [
      'tous',
      'aujourdhui',
      'soir',
      'weekend',
      'semaine',
      'date',
    ] as const) {
      assert.equal(
        searchExamplesVisible({ ...empty, timeScope: scope }),
        true,
        `QUAND ${scope} must not hide examples`,
      );
    }
    assert.equal(
      searchExamplesVisible({ ...empty, selectedCategories: ['cinema'] }),
      false,
    );
    assert.equal(
      searchExamplesVisible({ ...empty, selectedCategories: ['musique'] }),
      false,
    );
    assert.equal(
      searchExamplesVisible({
        selectedCategories: ['cinema'],
        query: '',
        timeScope: 'weekend',
      }),
      false,
    );
    assert.equal(
      searchExamplesVisible({ ...empty, query: 'envie de rire' }),
      false,
    );
    assert.equal(
      searchExamplesVisible({ ...empty, committedTitle: 'concert' }),
      false,
    );
  });
});
