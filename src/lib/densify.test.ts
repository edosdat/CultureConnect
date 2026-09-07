import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cinemaStemsCompatible,
  cinemaTitleStem,
  densify,
  densifyGroupKey,
  densifiedCardCount,
  firstScrollUniqueShare,
} from './densify';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

function lieu(id = 'L1', commune = 'Toulouse'): Lieu {
  return {
    lieu_id: id,
    nom: `Salle ${id}`,
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
    date_debut: '2026-09-07',
    date_fin: '2026-09-07',
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
    date: '2026-09-07',
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
  title: string;
  cat: string;
  day?: string;
  heure?: string;
  filmId?: string;
  eventId?: string;
  lieuId?: string;
  form?: string;
}): DayItem {
  const day = opts.day ?? '2026-09-07';
  const heure = opts.heure ?? '20:00';
  const eventId = opts.eventId ?? opts.key;
  const lieuId = opts.lieuId ?? 'L1';
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: day,
    programme: prog({
      programme_id: opts.key,
      event_id: eventId,
      nom_item: opts.title,
      date: day,
      heure_debut: heure,
      lieu_id: lieuId,
      film_id: opts.filmId,
      form: opts.form,
    }),
    evenement: ev({
      event_id: eventId,
      categorie: opts.cat,
      titre: opts.title,
      date_debut: day,
      date_fin: day,
      heure_debut: heure,
      lieu_id: lieuId,
      form: opts.form,
    }),
    lieu: lieu(lieuId),
  };
}

describe('densify visible-card identity', () => {
  it('collapses six salles of the same film_id onto one card (soonest séance)', () => {
    const seances = [1, 2, 3, 4, 5, 6].map((n) =>
      item({
        key: `p-gaulle-${n}`,
        title: 'La Bataille de Gaulle',
        cat: 'cinema',
        filmId: 'F0020',
        eventId: `ETMP_L${n}_294280`,
        lieuId: `L${n}`,
        heure: n === 1 ? '10:30' : `${10 + n}:00`,
      }),
    );
    const rows = densify(seances);
    assert.equal(rows.length, 1);
    assert.equal(
      densifyGroupKey(seances[0]!),
      `film:w:${cinemaTitleStem('La Bataille de Gaulle')}`,
    );
    assert.equal(rows[0]!.seances.length, 6);
    assert.equal(rows[0]!.salleCount, 6);
    assert.equal(rows[0]!.item.key, 'p-gaulle-1');
    assert.equal(rows[0]!.earliestHeure, '10:30');
  });

  it('keeps distinct official film_ids as separate cards', () => {
    const rows = densify([
      item({
        key: 'p1',
        title: "La Bataille de Gaulle - partie 1 : L'Âge de Fer",
        cat: 'cinema',
        filmId: 'F0020',
      }),
      item({
        key: 'p2',
        title: 'La Bataille de Gaulle - Partie 2 : J’écris ton nom',
        cat: 'cinema',
        filmId: 'F0015',
      }),
    ]);
    assert.equal(rows.length, 2);
  });

  it('groups cinema without film_id by title, not per-salle event_id', () => {
    const seances = [1, 2, 3, 4, 5, 6].map((n) =>
      item({
        key: `p-clone-${n}`,
        title: 'La Bataille de Gaulle',
        cat: 'cinema',
        eventId: `ETMP_L${n}_clone`,
        lieuId: `L${n}`,
        form: 'cine',
      }),
    );
    const rows = densify(seances);
    assert.equal(rows.length, 1);
    assert.equal(
      densifyGroupKey(seances[0]!),
      `film:w:${cinemaTitleStem('La Bataille de Gaulle')}`,
    );
    assert.equal(rows[0]!.seances.length, 6);
    assert.equal(rows[0]!.isFilmGroup, true);
  });

  it('merges catalogue clones of the same film (extra film_ids / truncated titles)', () => {
    const clones = [
      item({
        key: 'p-f15',
        title: 'La Bataille de Gaulle - Partie 2 : J’écris ton nom',
        cat: 'cinema',
        filmId: 'F0015',
        lieuId: 'L137',
      }),
      item({
        key: 'p-f34',
        title: 'La bataille de Gaulle – J’écris ton nom',
        cat: 'cinema',
        filmId: 'F0034',
        lieuId: 'L126',
      }),
      item({
        key: 'p-f44',
        title: 'La bataille de Gaulle – J...',
        cat: 'cinema',
        filmId: 'F0044',
        lieuId: 'L143',
      }),
      item({
        key: 'p-f20',
        title: "La Bataille de Gaulle - partie 1 : L'Âge de Fer",
        cat: 'cinema',
        filmId: 'F0020',
        lieuId: 'L138',
      }),
      item({
        key: 'p-f37',
        title: 'La bataille de Gaulle – L’âge de fer',
        cat: 'cinema',
        filmId: 'F0037',
        lieuId: 'L125',
      }),
      item({
        key: 'p-f46',
        title: 'La bataille de Gaulle – L...',
        cat: 'cinema',
        filmId: 'F0046',
        lieuId: 'L144',
      }),
    ];
    const rows = densify(clones);
    assert.equal(rows.length, 2);
    assert.equal(
      rows.reduce((n, row) => n + row.seances.length, 0),
      6,
    );
    assert.ok(
      cinemaStemsCompatible(
        cinemaTitleStem('La Bataille de Gaulle - Partie 2 : J’écris ton nom'),
        cinemaTitleStem('La bataille de Gaulle – J...'),
      ),
    );
    assert.equal(
      cinemaStemsCompatible(
        cinemaTitleStem('La Bataille de Gaulle - Partie 2 : J’écris ton nom'),
        cinemaTitleStem("La Bataille de Gaulle - partie 1 : L'Âge de Fer"),
      ),
      false,
    );
  });

  it('collapses En live / living-arts créneaux onto one event_id card', () => {
    const days = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'];
    const seances = days.flatMap((day, i) =>
      ['09:30', '10:20', '11:10'].map((heure, j) =>
        item({
          key: `p-bulle-${i}-${j}`,
          title: 'La Bulle',
          cat: 'theatre',
          eventId: 'E351',
          day,
          heure,
          form: 'theatre',
        }),
      ),
    );
    const rows = densify(seances);
    assert.equal(rows.length, 1);
    assert.equal(densifyGroupKey(seances[0]!), 't:la bulle');
    assert.equal(rows[0]!.seances.length, 12);
    assert.equal(rows[0]!.item.dayIso, '2026-08-31');
    assert.equal(rows[0]!.item.programme.heure_debut, '09:30');
  });

  it('collapses weekly En live clones that mint a new event_id each night', () => {
    const rows = densify(
      [87, 94, 99, 101, 105, 106, 108].map((n, i) =>
        item({
          key: `flash-${n}`,
          title: 'La Flashback by Jean-Heude',
          cat: 'concert',
          eventId: `BAR0${n}`,
          day: `2026-09-0${1 + (i % 7)}`,
          form: 'concert',
        }),
      ),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.seances.length, 7);
  });

  it('keeps two living-arts works with different titles apart', () => {
    const rows = densify([
      item({
        key: 'a',
        title: 'Jam jazz manouche',
        cat: 'concert',
        eventId: 'E1',
        form: 'concert',
      }),
      item({
        key: 'b',
        title: 'Jam Horra',
        cat: 'concert',
        eventId: 'E2',
        form: 'concert',
      }),
    ]);
    assert.equal(rows.length, 2);
  });

  it('raises first-scroll unique share vs raw séance rows', () => {
    const raw: DayItem[] = [];
    for (let n = 0; n < 6; n++) {
      raw.push(
        item({
          key: `g-${n}`,
          title: 'La Bataille de Gaulle',
          cat: 'cinema',
          filmId: 'F0020',
          eventId: `E-g-${n}`,
          lieuId: `LG${n}`,
        }),
      );
    }
    for (let n = 0; n < 4; n++) {
      raw.push(
        item({
          key: `b-${n}`,
          title: 'La Bulle',
          cat: 'theatre',
          eventId: 'E351',
          day: `2026-09-0${1 + n}`,
        }),
      );
    }
    const { rawShare, denseShare } = firstScrollUniqueShare(raw, 10);
    assert.ok(rawShare < 0.5, `raw share should be inflated, got ${rawShare}`);
    assert.equal(denseShare, 1);
    assert.equal(densifiedCardCount(raw), 2);
  });
});
