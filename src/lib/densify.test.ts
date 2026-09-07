import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
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
    assert.equal(densifyGroupKey(seances[0]!), 'film:F0020');
    assert.equal(rows[0]!.seances.length, 6);
    assert.equal(rows[0]!.salleCount, 6);
    assert.equal(rows[0]!.item.key, 'p-gaulle-1');
    assert.equal(rows[0]!.earliestHeure, '10:30');
  });

  it('keeps distinct official film_ids as separate cards', () => {
    const rows = densify([
      item({
        key: 'p1',
        title: 'La Bataille de Gaulle - partie 1',
        cat: 'cinema',
        filmId: 'F0020',
      }),
      item({
        key: 'p2',
        title: 'La Bataille de Gaulle - Partie 2',
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
    assert.equal(densifyGroupKey(seances[0]!), 'film:t:la bataille de gaulle');
    assert.equal(rows[0]!.seances.length, 6);
    assert.equal(rows[0]!.isFilmGroup, true);
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
    assert.equal(densifyGroupKey(seances[0]!), 'ev:E351');
    assert.equal(rows[0]!.seances.length, 12);
    assert.equal(rows[0]!.item.dayIso, '2026-08-31');
    assert.equal(rows[0]!.item.programme.heure_debut, '09:30');
  });

  it('does not merge two living-arts events that share a title', () => {
    const rows = densify([
      item({
        key: 'a',
        title: 'Jam',
        cat: 'concert',
        eventId: 'E1',
        form: 'concert',
      }),
      item({
        key: 'b',
        title: 'Jam',
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
