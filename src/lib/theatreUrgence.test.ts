import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';
import {
  calendarDaysBetween,
  isTheatreUrgenceEligible,
  lastDateForDayItem,
  lastDateOfSeries,
  parseCalendarIso,
  theatreUrgenceForItem,
  theatreUrgenceLabel,
} from './theatreUrgence';

function lieu(): Lieu {
  return {
    lieu_id: 'L040',
    nom: 'Théâtre du Capitole',
    type: 'opera_theatre',
    adresse: '',
    commune: 'Toulouse',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
  };
}

function ev(
  p: Partial<Evenement> & Pick<Evenement, 'event_id' | 'categorie' | 'titre'>,
): Evenement {
  return {
    lieu_id: 'L040',
    date_debut: '2026-09-22',
    date_fin: '2026-10-04',
    heure_debut: '19:30',
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
    lieu_id: 'L040',
    type_item: 'spectacle',
    date: '2026-09-22',
    heure_debut: '19:30',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: 'classique_lyrique',
    artiste_id: '',
    ...p,
  };
}

function item(opts: {
  key: string;
  cat: string;
  day?: string;
  filmId?: string;
  last?: string;
  dateFin?: string;
  genre?: string;
  form?: string;
  kind?: 'programme' | 'fallback';
}): DayItem {
  const evenement = ev({
    event_id: opts.key,
    categorie: opts.cat,
    titre: opts.key,
    genre: opts.genre ?? '',
    form: opts.form,
    date_debut: opts.day ?? '2026-09-22',
    date_fin: opts.dateFin ?? opts.last ?? opts.day ?? '2026-10-04',
    last_seance_date: opts.last,
  });
  if (opts.kind === 'fallback') {
    return {
      kind: 'fallback',
      key: opts.key,
      dayIso: opts.day ?? '2026-09-22',
      evenement,
      lieu: lieu(),
    };
  }
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: opts.day ?? '2026-09-22',
    programme: prog({
      programme_id: `p-${opts.key}`,
      event_id: opts.key,
      nom_item: opts.key,
      date: opts.day ?? '2026-09-22',
      genre: opts.genre ?? '',
      form: opts.form,
      film_id: opts.filmId,
    }),
    evenement,
    lieu: lieu(),
  };
}

describe('parseCalendarIso', () => {
  it('accepts strict YYYY-MM-DD calendar days', () => {
    assert.equal(parseCalendarIso('2026-09-07'), '2026-09-07');
    assert.equal(parseCalendarIso(' 2026-02-28 '), '2026-02-28');
  });

  it('rejects missing, padded-wrong, or impossible dates', () => {
    assert.equal(parseCalendarIso(''), null);
    assert.equal(parseCalendarIso(undefined), null);
    assert.equal(parseCalendarIso('2026-9-7'), null);
    assert.equal(parseCalendarIso('07/09/2026'), null);
    assert.equal(parseCalendarIso('2026-09-07T20:00'), null);
    assert.equal(parseCalendarIso('2026-09-31'), null);
    assert.equal(parseCalendarIso('2026-02-29'), null);
    assert.equal(parseCalendarIso('septembre 2026'), null);
  });
});

describe('lastDateOfSeries', () => {
  it('prefers max programme séance date over date_fin', () => {
    assert.equal(
      lastDateOfSeries({
        programmeDates: ['2026-09-22', '2026-09-25', '2026-10-04'],
        dateFin: '2026-09-30',
      }),
      '2026-10-04',
    );
  });

  it('falls back to date_fin when no programme dates', () => {
    assert.equal(
      lastDateOfSeries({ programmeDates: [], dateFin: '2026-10-04' }),
      '2026-10-04',
    );
  });

  it('skips invalid programme dates and hides when nothing valid remains', () => {
    assert.equal(
      lastDateOfSeries({
        programmeDates: ['bientôt', '2026-09-31', ''],
        dateFin: '',
      }),
      null,
    );
    assert.equal(
      lastDateOfSeries({
        programmeDates: ['bientôt'],
        dateFin: '2026-10-04',
      }),
      '2026-10-04',
    );
  });
});

describe('theatreUrgenceLabel', () => {
  const today = '2026-09-07';

  it('j0 / j1 → Dernière', () => {
    assert.equal(theatreUrgenceLabel('2026-09-07', today), 'Dernière');
    assert.equal(theatreUrgenceLabel('2026-09-08', today), 'Dernière');
  });

  it('2–7 calendar days → Plus que X jours', () => {
    assert.equal(theatreUrgenceLabel('2026-09-09', today), 'Plus que 2 jours');
    assert.equal(theatreUrgenceLabel('2026-09-10', today), 'Plus que 3 jours');
    assert.equal(theatreUrgenceLabel('2026-09-14', today), 'Plus que 7 jours');
  });

  it('>7 days, past, or missing → hide', () => {
    assert.equal(theatreUrgenceLabel('2026-09-15', today), null);
    assert.equal(theatreUrgenceLabel('2026-10-04', today), null);
    assert.equal(theatreUrgenceLabel('2026-09-06', today), null);
    assert.equal(theatreUrgenceLabel(null, today), null);
    assert.equal(theatreUrgenceLabel('', today), null);
  });

  it('compares calendar days, not hours', () => {
    assert.equal(calendarDaysBetween('2026-09-07', '2026-09-07'), 0);
    assert.equal(theatreUrgenceLabel('2026-09-07', today), 'Dernière');
  });
});

describe('theatreUrgenceForItem', () => {
  const today = '2026-09-07';

  it('theatre_danse j0/j1 / 2–7 / hide', () => {
    const j0 = item({
      key: 'th0',
      cat: 'theatre_danse',
      last: '2026-09-07',
    });
    const j3 = item({
      key: 'th3',
      cat: 'theatre',
      last: '2026-09-10',
    });
    const later = item({
      key: 'thL',
      cat: 'theatre_danse',
      last: '2026-10-04',
    });
    assert.equal(theatreUrgenceForItem(j0, today), 'Dernière');
    assert.equal(theatreUrgenceForItem(j3, today), 'Plus que 3 jours');
    assert.equal(theatreUrgenceForItem(later, today), null);
  });

  it('covers Capitole / opéra via theatre_danse (not cine opera films)', () => {
    const rusalka = item({
      key: 'E300',
      cat: 'theatre_danse',
      genre: 'classique_lyrique',
      form: 'theatre',
      last: '2026-09-10',
    });
    const cineOpera = item({
      key: 'F0137',
      cat: 'cinema',
      filmId: 'F0137',
      last: '2026-09-10',
    });
    assert.equal(isTheatreUrgenceEligible(rusalka), true);
    assert.equal(theatreUrgenceForItem(rusalka, today), 'Plus que 3 jours');
    assert.equal(isTheatreUrgenceEligible(cineOpera), false);
    assert.equal(theatreUrgenceForItem(cineOpera, today), null);
  });

  it('never leaks onto ciné / musique / festival / expo / enfants', () => {
    const cats = [
      'cinema',
      'concert',
      'musique',
      'festival',
      'exposition',
      'enfants_famille',
    ] as const;
    for (const cat of cats) {
      const row = item({
        key: cat,
        cat,
        last: '2026-09-08',
        filmId: cat === 'cinema' ? 'F1' : undefined,
      });
      assert.equal(isTheatreUrgenceEligible(row), false, cat);
      assert.equal(theatreUrgenceForItem(row, today), null, cat);
    }
  });

  it('hides when last date is missing or last_seance_date / date_fin are invalid', () => {
    const noDates = item({
      key: 'nodate',
      cat: 'theatre_danse',
      dateFin: '',
    });
    noDates.evenement.last_seance_date = '';
    noDates.evenement.date_fin = '';
    const bad = item({
      key: 'bad',
      cat: 'theatre_danse',
      dateFin: 'fin septembre',
    });
    bad.evenement.last_seance_date = 'bientôt';
    assert.equal(lastDateForDayItem(noDates), null);
    assert.equal(theatreUrgenceForItem(noDates, today), null);
    assert.equal(theatreUrgenceForItem(bad, today), null);
  });

  it('uses last_seance_date (full series) not the visible séance day', () => {
    const row = item({
      key: 'series',
      cat: 'theatre_danse',
      day: '2026-09-07',
      last: '2026-10-04',
      dateFin: '2026-10-04',
    });
    assert.equal(lastDateForDayItem(row), '2026-10-04');
    assert.equal(theatreUrgenceForItem(row, today), null);
  });

  it('falls back to date_fin when last_seance_date is absent', () => {
    const row = item({
      key: 'fin',
      cat: 'theatre_danse',
      dateFin: '2026-09-09',
    });
    row.evenement.last_seance_date = '';
    assert.equal(lastDateForDayItem(row), '2026-09-09');
    assert.equal(theatreUrgenceForItem(row, today), 'Plus que 2 jours');
  });
});
