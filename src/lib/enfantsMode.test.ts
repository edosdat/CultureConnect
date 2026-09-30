import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesMainCategories } from './categories';
import { loadCultureData } from './data';
import {
  agendaListCacheKeyParts,
  buildAgendaParams,
  listFetchShouldSkipBootGps,
  parseAvecEnfantsFlag,
} from './agendaParams';
import { queryAgenda, type AgendaQueryInput } from './agendaQuery';
import { itemsForDateRange } from './events';
import {
  applyAvecEnfantsMode,
  avecEnfantsCreneau,
  isFamilyToutPublicSlot,
  seanceMatchesAvecEnfantsMode,
  seancePublicCible,
} from './enfantsMode';
import { isAgeRestrictedSeance } from './categories';
import type { DayItem, Evenement, ProgrammeItem } from './types';
import { hideSeancesBeforeToday, parisParts, upcomingRange } from './timeScope';

/** Mercredi 30/09/2026 10:00 Paris. */
const NOW = new Date('2026-09-30T08:00:00.000Z');

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

function intersectsCats(item: DayItem, cats: string[]): boolean {
  if (!seanceMatchesAvecEnfantsMode(item)) return false;
  if (item.kind !== 'programme') return false;
  return matchesMainCategories(
    item.evenement?.categorie ?? '',
    item.programme.genre || item.evenement?.genre || '',
    cats,
    {
      tags: item.evenement?.tags || '',
      publicCible: seancePublicCible(item),
    },
  );
}

describe('seanceMatchesAvecEnfantsMode', () => {
  it('keeps a jeune_public screening and drops the same work at night', () => {
    const family = seance({
      id: 'sun-11',
      day: '2026-10-04',
      heure: '11:00',
      publicCible: 'jeune_public',
      parentPublicCible: 'tout_public',
    });
    const night = seance({
      id: 'sat-22',
      day: '2026-10-03',
      heure: '22:00',
      publicCible: 'tout_public',
      parentPublicCible: 'jeune_public',
    });
    assert.equal(seanceMatchesAvecEnfantsMode(family), true);
    assert.equal(seancePublicCible(family), 'jeune_public');
    assert.equal(seanceMatchesAvecEnfantsMode(night), false);
    assert.equal(seancePublicCible(night), 'tout_public');
  });

  it('keeps a form=enfants œuvre at any hour', () => {
    const late = seance({
      id: 'kids-22',
      day: '2026-10-02',
      heure: '22:15',
      cat: 'enfants_famille',
      genre: 'atelier_mediation',
      form: 'enfants',
      publicCible: 'tout_public',
    });
    assert.equal(seanceMatchesAvecEnfantsMode(late), true);
    assert.equal(avecEnfantsCreneau(late), 'soir');
  });

  it('never keeps an age-restricted séance, whatever the chips would say', () => {
    const interdit = seance({
      id: 'ban',
      day: '2026-10-04',
      heure: '11:00',
      cat: 'enfants_famille',
      genre: 'animation_jeune_public',
      form: 'enfants',
      tags: 'famille',
      publicCible: 'Interdit - 12 ans avec avertissement',
      parentPublicCible: 'jeune_public',
    });
    const seize = seance({
      id: 'ban-16',
      day: '2026-10-04',
      heure: '15:00',
      publicCible: 'Interdit - 16 ans',
    });
    assert.equal(seanceMatchesAvecEnfantsMode(interdit), false);
    assert.equal(seanceMatchesAvecEnfantsMode(seize), false);
    assert.equal(intersectsCats(interdit, ['enfants_famille']), false);
    assert.equal(intersectsCats(interdit, ['cinema', 'enfants_famille']), false);
    assert.equal(intersectsCats(seize, []), false);
  });

  it('surfaces tout_public before 18:00 on mercredi, samedi and dimanche only', () => {
    const sunday = seance({
      id: 'sun-tp',
      day: '2026-10-04',
      heure: '17:30',
      publicCible: 'tout_public',
    });
    const wednesday = seance({
      id: 'wed-tp',
      day: '2026-09-30',
      heure: '14:00',
      publicCible: 'tout_public',
    });
    const saturdayNight = seance({
      id: 'sat-tp',
      day: '2026-10-03',
      heure: '18:00',
      publicCible: 'tout_public',
    });
    const friday = seance({
      id: 'fri-tp',
      day: '2026-10-02',
      heure: '11:00',
      publicCible: 'tout_public',
    });
    const noClock = seance({
      id: 'sun-noclock',
      day: '2026-10-04',
      heure: '',
      publicCible: 'tout_public',
    });
    assert.equal(isFamilyToutPublicSlot(sunday), true);
    assert.equal(seanceMatchesAvecEnfantsMode(sunday), true);
    assert.equal(seanceMatchesAvecEnfantsMode(wednesday), true);
    assert.equal(seanceMatchesAvecEnfantsMode(saturdayNight), false);
    assert.equal(seanceMatchesAvecEnfantsMode(friday), false);
    assert.equal(seanceMatchesAvecEnfantsMode(noClock), false);
  });

  it('includes jeune_public even when the œuvre is not classified enfants', () => {
    const adultFilm = seance({
      id: 'jp-adult',
      day: '2026-10-02',
      heure: '21:00',
      cat: 'cinema',
      genre: 'fiction',
      publicCible: 'jeune_public',
    });
    assert.equal(seanceMatchesAvecEnfantsMode(adultFilm), true);
  });

  it('intersects with category chips instead of unioning them', () => {
    const cine = seance({
      id: 'cine-sun',
      day: '2026-10-04',
      heure: '11:00',
      cat: 'cinema',
      genre: 'fiction',
      publicCible: 'tout_public',
    });
    const music = seance({
      id: 'music-sun',
      day: '2026-10-04',
      heure: '16:00',
      cat: 'musique',
      genre: 'jazz_blues',
      publicCible: 'tout_public',
    });
    assert.equal(intersectsCats(cine, []), true);
    assert.equal(intersectsCats(music, []), true);
    assert.equal(intersectsCats(cine, ['musique']), false);
    assert.equal(intersectsCats(music, ['musique']), true);
    assert.equal(intersectsCats(cine, ['cinema']), true);
    assert.equal(intersectsCats(music, ['cinema']), false);
  });
});

describe('applyAvecEnfantsMode sort', () => {
  it('orders by date proximity, then matin / après-midi before soir', () => {
    const items = [
      seance({
        id: 'sun-soir',
        day: '2026-10-04',
        heure: '20:00',
        cat: 'enfants_famille',
        genre: 'atelier_mediation',
        form: 'enfants',
      }),
      seance({
        id: 'sun-matin',
        day: '2026-10-04',
        heure: '11:00',
        publicCible: 'jeune_public',
      }),
      seance({
        id: 'sat-aprem',
        day: '2026-10-03',
        heure: '16:00',
        publicCible: 'tout_public',
      }),
      seance({
        id: 'wed-soir',
        day: '2026-10-07',
        heure: '21:00',
        cat: 'enfants_famille',
        genre: 'atelier_mediation',
        form: 'enfants',
      }),
      seance({
        id: 'sun-aprem',
        day: '2026-10-04',
        heure: '15:10',
        publicCible: 'jeune_public',
      }),
    ];
    const once = applyAvecEnfantsMode(items).map((item) => item.key);
    const twice = applyAvecEnfantsMode([...items].reverse()).map((item) => item.key);
    assert.deepEqual(once, [
      'p:sat-aprem',
      'p:sun-matin',
      'p:sun-aprem',
      'p:sun-soir',
      'p:wed-soir',
    ]);
    assert.deepEqual(twice, once);
  });
});

describe('enfants query flag', () => {
  it('is a dedicated flag, not a cat value', () => {
    const params = buildAgendaParams({
      scope: 'tous',
      commune: 'Toulouse',
      q: '',
      cats: ['musique'],
      genres: [],
      lieuId: null,
      selectedDate: null,
      year: 2026,
      month: 9,
      avecEnfants: true,
    });
    assert.equal(params.get('enfants'), '1');
    assert.equal(params.get('avec_enfants'), null);
    assert.equal(params.get('cat'), 'musique');
    assert.equal(params.get('cat')?.includes('enfants'), false);
    assert.equal(parseAvecEnfantsFlag('1'), true);
    assert.equal(parseAvecEnfantsFlag('avec_enfants'), false);
    assert.equal(parseAvecEnfantsFlag(null), false);
  });

  it('changes the list cache key and is not swallowed by the boot GPS skip', () => {
    const base = {
      scope: 'tous',
      selectedDate: null,
      year: 2026,
      month: 9,
      cats: [] as string[],
      commune: 'Toulouse',
      lieuId: null,
      genres: [] as string[],
      parisDay: '2026-09-30',
    };
    const off = agendaListCacheKeyParts(base).join('|');
    const on = agendaListCacheKeyParts({ ...base, avecEnfants: true }).join('|');
    assert.notEqual(off, on);
    assert.ok(on.endsWith('enfants'));
    assert.equal(listFetchShouldSkipBootGps(true, 'tous', 0, '', true), false);
    assert.equal(listFetchShouldSkipBootGps(true, 'tous', 0), true);
  });
});

function windowInput(extra: Partial<AgendaQueryInput>): AgendaQueryInput {
  return {
    scope: 'tous',
    commune: null,
    q: '',
    cats: [],
    genres: [],
    lieuId: null,
    selectedDate: null,
    year: 2026,
    month: 9,
    ...extra,
  };
}

describe('Avec les enfants on the current window', () => {
  it('returns at least 137 séances and zero age-restricted rows', () => {
    const paris = parisParts(NOW);
    assert.equal(paris.iso, '2026-09-30');
    const data = loadCultureData();
    const range = upcomingRange(paris.iso, data.maxIso);
    const raw = hideSeancesBeforeToday(
      itemsForDateRange(
        data.programmeWithContext,
        data.events,
        range.startIso,
        range.endIso,
        [],
        [],
        [],
        true,
      ),
      paris.iso,
    );
    const filtered = applyAvecEnfantsMode(raw);
    const leaked = filtered.filter((item) =>
      isAgeRestrictedSeance(seancePublicCible(item)),
    );
    const rawInterdits = raw.filter((item) =>
      isAgeRestrictedSeance(seancePublicCible(item)),
    );
    assert.ok(
      rawInterdits.length >= 400,
      `expected ~410 interdits in the window, got ${rawInterdits.length}`,
    );
    assert.equal(leaked.length, 0);
    assert.ok(
      filtered.length >= 137,
      `expected ≥137 séances, got ${filtered.length}`,
    );

    const listed = queryAgenda(windowInput({ avecEnfants: true }), NOW);
    assert.equal(listed.total, filtered.length);

    const musicRaw = applyAvecEnfantsMode(
      hideSeancesBeforeToday(
        itemsForDateRange(
          data.programmeWithContext,
          data.events,
          range.startIso,
          range.endIso,
          ['musique'],
          [],
          [],
          true,
        ),
        paris.iso,
      ),
    );
    const music = queryAgenda(
      windowInput({ avecEnfants: true, cats: ['musique'] }),
      NOW,
    );
    assert.equal(music.total, musicRaw.length);
    assert.ok(music.total < listed.total);

    const cine = queryAgenda(
      windowInput({ avecEnfants: true, cats: ['cinema'] }),
      NOW,
    );
    assert.ok(cine.total > 0);
    assert.ok(cine.total < listed.total);
    assert.ok(cine.total + music.total <= listed.total);
  });
});
