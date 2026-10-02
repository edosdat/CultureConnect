import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesEnfantsChipContent, matchesMainCategories } from './categories';
import {
  buildAgendaParams,
  listFetchShouldSkipBootGps,
} from './agendaParams';
import { densify, densifiedCardCount } from './densify';
import {
  applyAvecEnfantsMode,
  avecEnfantsCreneau,
  isFamilyToutPublicSlot,
  seanceMatchesAvecEnfantsMode,
  seancePublicCible,
} from './enfantsMode';
import { isAgeRestrictedSeance } from './categories';
import type { DayItem, Evenement, ProgrammeItem } from './types';
import { enfantsRows } from './displayHome';

function ev(partial: Partial<Evenement> & Pick<Evenement, 'event_id' | 'categorie' | 'titre'>): Evenement {
  return {
    lieu_id: 'L1',
    date_debut: '2026-10-04',
    date_fin: '2026-10-04',
    heure_debut: '11:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    publication: 'agenda',
    ...partial,
  };
}

function seance(opts: {
  id: string;
  day: string;
  heure: string;
  cat?: string;
  genre?: string;
  tags?: string;
  form?: string;
  publicCible?: string;
  parentPublicCible?: string;
  title?: string;
  filmId?: string;
}): DayItem {
  const evenement = ev({
    event_id: `e-${opts.id}`,
    categorie: opts.cat ?? 'cinema',
    titre: opts.title ?? opts.id,
    genre: opts.genre ?? 'fiction',
    tags: opts.tags,
    form: opts.form,
    public_cible: opts.parentPublicCible,
    heure_debut: opts.heure,
    date_debut: opts.day,
    date_fin: opts.day,
  });
  const programme: ProgrammeItem = {
    programme_id: opts.id,
    event_id: evenement.event_id,
    lieu_id: 'L1',
    nom_item: opts.title ?? opts.id,
    type_item: '',
    date: opts.day,
    heure_debut: opts.heure,
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: opts.genre ?? 'fiction',
    artiste_id: '',
    form: opts.form,
    public_cible: opts.publicCible,
    film_id: opts.filmId,
  };
  return {
    kind: 'programme',
    key: `p:${opts.id}`,
    dayIso: opts.day,
    programme,
    evenement,
    lieu: null,
  };
}

describe('Enfants chip stays unitary; mode « Avec les enfants » is a flag', () => {
  const app = readFileSync(
    new URL('../components/CultureConnectApp.tsx', import.meta.url),
    'utf8',
  );
  const route = readFileSync(
    new URL('../app/api/agenda/route.ts', import.meta.url),
    'utf8',
  );
  const paramsSrc = readFileSync(
    new URL('./agendaParams.ts', import.meta.url),
    'utf8',
  );
  const querySrc = readFileSync(
    new URL('./agendaQuery.ts', import.meta.url),
    'utf8',
  );

  it('wires « Avec les enfants » as ?enfants=1, not as the QUOI chip', () => {
    assert.match(app, /Avec les enfants/);
    assert.match(app, /data-enfants-mode/);
    assert.match(app, /oneCardPerSeance/);
    assert.match(route, /avecEnfants/);
    assert.match(paramsSrc, /parseAvecEnfantsFlag/);
    assert.match(querySrc, /applyAvecEnfantsMode/);
    const relance = route.slice(
      route.indexOf("digestMode === 'relance'"),
      route.indexOf('const scopeRaw'),
    );
    assert.equal(relance.includes('avecEnfants'), false);
  });

  it('does not send enfants=1 as a mode flag', () => {
    const params = buildAgendaParams({
      scope: 'tous',
      commune: 'Toulouse',
      q: '',
      cats: ['enfants_famille'],
      genres: [],
      lieuId: null,
      selectedDate: null,
      year: 2026,
      month: 10,
    });
    assert.equal(params.get('enfants'), null);
    assert.equal(params.get('avec_enfants'), null);
    assert.equal(params.get('cat'), 'enfants_famille');
    const mode = buildAgendaParams({
      scope: 'tous',
      commune: 'Toulouse',
      q: '',
      cats: ['cinema'],
      genres: [],
      lieuId: null,
      selectedDate: null,
      year: 2026,
      month: 10,
      avecEnfants: true,
    });
    assert.equal(mode.get('enfants'), '1');
    assert.equal(mode.get('cat'), 'cinema');
  });

  it('boot GPS skip still paints « tous », and does not swallow the kids mode', () => {
    assert.equal(listFetchShouldSkipBootGps(true, 'tous', 0), true);
    assert.equal(listFetchShouldSkipBootGps(true, 'tous', 1), false);
    assert.equal(listFetchShouldSkipBootGps(true, 'tous', 0, '', true), false);
  });

  it('Enfants chip densifies same film_id → unitary card (no Cars×5)', () => {
    const cars = [
      seance({
        id: 'c1',
        day: '2026-10-04',
        heure: '10:00',
        genre: 'animation_jeune_public',
        title: 'Cars',
        filmId: 'F-CARS',
        publicCible: 'jeune_public',
      }),
      seance({
        id: 'c2',
        day: '2026-10-04',
        heure: '14:00',
        genre: 'animation_jeune_public',
        title: 'Cars',
        filmId: 'F-CARS',
        publicCible: 'jeune_public',
      }),
      seance({
        id: 'c3',
        day: '2026-10-05',
        heure: '11:00',
        genre: 'animation_jeune_public',
        title: 'Cars',
        filmId: 'F-CARS',
        publicCible: 'jeune_public',
      }),
      seance({
        id: 'c4',
        day: '2026-10-05',
        heure: '16:00',
        genre: 'animation_jeune_public',
        title: 'Cars',
        filmId: 'F-CARS',
        publicCible: 'jeune_public',
      }),
      seance({
        id: 'c5',
        day: '2026-10-06',
        heure: '10:30',
        genre: 'animation_jeune_public',
        title: 'Cars',
        filmId: 'F-CARS',
        publicCible: 'jeune_public',
      }),
    ];
    assert.equal(cars.length, 5);
    assert.equal(densifiedCardCount(cars), 1);
    assert.equal(densify(cars).length, 1);
    const rows = enfantsRows(cars, new Set(), { includeCrossCatKids: true });
    assert.equal(rows.length, 1);
  });

  it('chip keeps E1 age-restrict exclusion', () => {
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'enfants_famille',
        publicCible: 'Interdit - 16 ans',
      }),
      false,
    );
    assert.equal(
      matchesMainCategories('cinema', 'animation_jeune_public', ['enfants_famille'], {
        publicCible: 'Interdit - 12 ans',
      }),
      false,
    );
  });

  it('chip is transversal on musique / expo audience tags', () => {
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'musique',
        genre: 'chanson',
        tags: 'enfants',
        publicCible: 'jeune_public',
      }),
      true,
    );
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'exposition',
        genre: 'expo_art',
        publicCible: 'famille',
      }),
      true,
    );
    assert.equal(
      matchesEnfantsChipContent({
        categorie: 'musique',
        genre: 'metal',
        publicCible: 'tout_public',
      }),
      false,
    );
  });
});

describe('family-slot helpers (future option under Enfants chip)', () => {
  it('reads séance public_cible before the parent event', () => {
    const item = seance({
      id: 'pc',
      day: '2026-10-04',
      heure: '11:00',
      publicCible: 'jeune_public',
      parentPublicCible: 'Interdit - 16 ans',
    });
    assert.equal(seancePublicCible(item), 'jeune_public');
    assert.equal(isAgeRestrictedSeance(seancePublicCible(item)), false);
  });

  it('classifies créneaux and family tout_public slots', () => {
    const matin = seance({ id: 'm', day: '2026-10-04', heure: '11:00', publicCible: 'tout_public' });
    const soir = seance({ id: 's', day: '2026-10-04', heure: '20:00', publicCible: 'tout_public' });
    assert.equal(avecEnfantsCreneau(matin), 'matin');
    assert.equal(avecEnfantsCreneau(soir), 'soir');
    assert.equal(isFamilyToutPublicSlot(matin), true);
    assert.equal(isFamilyToutPublicSlot(soir), false);
  });

  it('keeps applyAvecEnfantsMode as a pure helper (not a product rail)', () => {
    const kids = seance({
      id: 'k',
      day: '2026-10-04',
      heure: '11:00',
      genre: 'animation_jeune_public',
      publicCible: 'jeune_public',
    });
    const banned = seance({
      id: 'b',
      day: '2026-10-04',
      heure: '11:00',
      publicCible: 'Interdit - 12 ans',
    });
    assert.equal(seanceMatchesAvecEnfantsMode(kids), true);
    assert.equal(seanceMatchesAvecEnfantsMode(banned), false);
    assert.deepEqual(
      applyAvecEnfantsMode([banned, kids]).map((i) => i.key),
      ['p:k'],
    );
  });
});
