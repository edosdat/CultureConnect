import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterSeancesForActiveFilters } from './displayFilter';
import { itemMatchesCommune } from './commune';
import {
  cineRows,
  fillEmptyCineFromPool,
  homeSectionsVisible,
  musiqueRows,
  shouldInvalidateProfileRecoCache,
  theatreRows,
  visibleTop3Items,
} from './displayHome';
import { slotFormOfItem } from './reco';
import {
  homePackOfItem,
  isCinemaDayItem,
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
  genre?: string;
  form?: string;
}): DayItem {
  const evenement = ev({
    event_id: opts.key,
    categorie: opts.cat,
    titre: opts.key,
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
      event_id: opts.key,
      nom_item: opts.key,
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
  it('no chip → all three packs', () => {
    assert.deepEqual(homeSectionsVisible([]), {
      cine: true,
      theatre: true,
      musique: true,
    });
  });

  it('Cinéma only hides theatre and musique', () => {
    assert.deepEqual(homeSectionsVisible(['cinema']), {
      cine: true,
      theatre: false,
      musique: false,
    });
  });

  it('Cinéma + Musique keeps those two', () => {
    assert.deepEqual(homeSectionsVisible(['cinema', 'musique']), {
      cine: true,
      theatre: false,
      musique: true,
    });
  });

  it('extra chips do not hide the three packs', () => {
    assert.deepEqual(homeSectionsVisible(['festival']), {
      cine: true,
      theatre: true,
      musique: true,
    });
    assert.deepEqual(homeSectionsVisible(['expo_patrimoine', 'enfants_famille']), {
      cine: true,
      theatre: true,
      musique: true,
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

  it('does not invent a pack for expo', () => {
    const expo = item({ key: 'e1', cat: 'exposition' });
    assert.equal(homePackOfItem(expo), null);
    assert.equal(isTheatreDayItem(expo), false);
    assert.equal(isMusiqueDayItem(expo), false);
  });
});

describe('pack rows + date filter', () => {
  const emptyTop3 = new Set<string>();
  const mix: DayItem[] = [
    item({ key: 'cine-2', cat: 'cinema', day: '2026-09-02', filmId: 'F2' }),
    item({ key: 'th-2', cat: 'theatre', day: '2026-09-02' }),
    item({ key: 'mu-2', cat: 'concert', day: '2026-09-02' }),
    item({ key: 'cine-5', cat: 'cinema', day: '2026-09-05', filmId: 'F5' }),
    item({ key: 'th-5', cat: 'theatre', day: '2026-09-05' }),
    item({ key: 'mu-5', cat: 'concert', day: '2026-09-05' }),
  ];

  it('splits catalogue into three packs without collapsing living arts', () => {
    const cine = cineRows(mix, emptyTop3).map((r) => r.item.key);
    const theatre = theatreRows(mix, emptyTop3).map((r) => r.item.key);
    const musique = musiqueRows(mix, emptyTop3).map((r) => r.item.key);
    assert.ok(cine.includes('cine-2') && cine.includes('cine-5'));
    assert.ok(theatre.includes('th-2') && theatre.includes('th-5'));
    assert.ok(musique.includes('mu-2') && musique.includes('mu-5'));
    assert.equal(cine.some((k) => k.startsWith('th-') || k.startsWith('mu-')), false);
    assert.equal(theatre.some((k) => k.startsWith('cine-') || k.startsWith('mu-')), false);
    assert.equal(musique.some((k) => k.startsWith('cine-') || k.startsWith('th-')), false);
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
  });
});
