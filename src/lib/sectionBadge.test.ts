import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { densify } from './densify';
import {
  countSectionSlots,
  formatLeJourMois,
  formatSectionBadge,
  sectionBadgeSuffix,
  sectionSlotQueryKey,
  sectionSlotTotals,
} from './sectionBadge';
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
  sceneSalle?: string;
  langue?: string;
  commune?: string;
}): DayItem {
  const day = opts.day ?? '2026-09-28';
  const heure = opts.heure ?? '20:00';
  const eventId = opts.eventId ?? opts.key;
  const lieuId = opts.lieuId ?? 'L1';
  const programme: ProgrammeItem = {
    programme_id: opts.key,
    event_id: eventId,
    lieu_id: lieuId,
    nom_item: opts.title,
    type_item: '',
    date: day,
    heure_debut: heure,
    heure_fin: '',
    scene_salle: opts.sceneSalle ?? '',
    prix_item: '',
    url: '',
    notes: '',
    genre: '',
    artiste_id: '',
    film_id: opts.filmId,
    langue: opts.langue,
    form: opts.form,
  };
  const evenement: Evenement = {
    event_id: eventId,
    lieu_id: lieuId,
    titre: opts.title,
    categorie: opts.cat,
    date_debut: day,
    date_fin: day,
    heure_debut: heure,
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    form: opts.form,
    langue: opts.langue,
  };
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: day,
    programme,
    evenement,
    lieu: lieu(lieuId, opts.commune),
  };
}

describe('section slot count', () => {
  it('counts cine créneaux, not unique films', () => {
    const slots = [1, 2, 3, 4, 5, 6].map((n) =>
      item({
        key: `p-${n}`,
        title: 'La Bataille',
        cat: 'cinema',
        filmId: 'F0001',
        lieuId: `L${n}`,
        heure: `${10 + n}:00`,
        form: 'cine',
      }),
    );
    assert.equal(densify(slots).length, 1);
    assert.equal(countSectionSlots(slots), 6);
  });

  it('keeps two films at the same lieu and clock as two séances', () => {
    const slots = [
      item({
        key: 'a',
        title: 'Fjord',
        cat: 'cinema',
        filmId: 'F1',
        lieuId: 'L125',
        heure: '21:00',
        form: 'cine',
      }),
      item({
        key: 'b',
        title: 'Condor',
        cat: 'cinema',
        filmId: 'F2',
        lieuId: 'L125',
        heure: '21:00',
        form: 'cine',
      }),
    ];
    assert.equal(countSectionSlots(slots), 2);
  });

  it('collapses CSV clones of the same cine créneau', () => {
    const slots = [
      item({
        key: 'a',
        title: 'Fjord',
        cat: 'cinema',
        filmId: 'F1',
        lieuId: 'L125',
        heure: '21:00',
        day: '2026-09-28',
        form: 'cine',
      }),
      item({
        key: 'b',
        title: 'Fjord',
        cat: 'cinema',
        filmId: 'F1',
        lieuId: 'L125',
        heure: '21:00',
        day: '2026-09-28',
        form: 'cine',
      }),
    ];
    assert.equal(countSectionSlots(slots), 1);
  });

  it('counts a play on three dates as three sorties, not one card', () => {
    const slots = ['2026-09-23', '2026-09-27', '2026-09-30'].map((day, i) =>
      item({
        key: `t-${i}`,
        title: 'Tentative d’épuisement',
        cat: 'theatre',
        eventId: 'E395',
        lieuId: 'L042',
        day,
        heure: '21:00',
        form: 'theatre',
      }),
    );
    assert.equal(densify(slots).length, 1);
    assert.equal(countSectionSlots(slots), 3);
    const totals = sectionSlotTotals(slots);
    assert.equal(totals.theatreSlotTotal, 3);
    assert.equal(totals.cineSlotTotal, 0);
  });

  it('does not drop a créneau that would sit in Top 3 — the pool is counted whole', () => {
    const pool = [
      item({
        key: 'top',
        title: 'Fjord',
        cat: 'cinema',
        filmId: 'F1',
        heure: '18:00',
        form: 'cine',
      }),
      item({
        key: 'other',
        title: 'Fjord',
        cat: 'cinema',
        filmId: 'F1',
        heure: '21:00',
        form: 'cine',
      }),
    ];
    assert.equal(countSectionSlots(pool), 2);
    assert.equal(sectionSlotTotals(pool).cineSlotTotal, 2);
  });
});

describe('section badge wording', () => {
  it('hides the badge at zero', () => {
    assert.equal(
      formatSectionBadge({ count: 0, unit: 'seance', scope: 'tous' }),
      null,
    );
    assert.equal(
      formatSectionBadge({ count: -3, unit: 'sortie', scope: 'soir' }),
      null,
    );
  });

  it('uses séance(s) for cinéma and sortie(s) for other cats', () => {
    assert.equal(
      formatSectionBadge({ count: 12, unit: 'seance', scope: 'soir' }),
      '12 séances ce soir',
    );
    assert.equal(
      formatSectionBadge({ count: 1, unit: 'seance', scope: 'soir' }),
      '1 séance ce soir',
    );
    assert.equal(
      formatSectionBadge({ count: 8, unit: 'sortie', scope: 'soir' }),
      '8 sorties ce soir',
    );
    assert.equal(
      formatSectionBadge({ count: 1, unit: 'sortie', scope: 'tous' }),
      '1 sortie à venir',
    );
  });

  it('maps each date chip to the locked suffix', () => {
    assert.equal(sectionBadgeSuffix('tous'), 'à venir');
    assert.equal(sectionBadgeSuffix('aujourdhui'), 'aujourd\u2019hui');
    assert.equal(sectionBadgeSuffix('soir'), 'ce soir');
    assert.equal(sectionBadgeSuffix('weekend'), 'ce week-end');
    assert.equal(sectionBadgeSuffix('semaine'), 'cette semaine');
    assert.equal(sectionBadgeSuffix('date', '2026-09-28'), 'le 28 septembre');
    assert.equal(sectionBadgeSuffix('date', '2026-09-01'), 'le 1 septembre');
    assert.equal(formatLeJourMois('2026-09-08'), 'le 8 septembre');
    assert.equal(sectionBadgeSuffix('date', null, '2026-09-01'), 'en septembre');
  });

  it('changes the slot key when the date chip changes', () => {
    const boot = sectionSlotQueryKey({
      scope: 'tous',
      commune: 'Toulouse',
    });
    const soir = sectionSlotQueryKey({
      scope: 'soir',
      day: '2026-09-28',
      commune: 'Toulouse',
    });
    assert.notEqual(boot, soir);
    assert.equal(
      boot,
      sectionSlotQueryKey({ scope: 'tous', commune: 'Toulouse' }),
    );
  });

  it('does not repeat the city or the category', () => {
    const line = formatSectionBadge({
      count: 4,
      unit: 'seance',
      scope: 'weekend',
    });
    assert.equal(line, '4 séances ce week-end');
    assert.ok(line);
    assert.equal(/toulouse|cin[eé]|musique|th[eé]âtre/i.test(line), false);
    assert.equal(line.includes('sorties'), false);
  });

  it('wires every public section, with séance only on Ciné', () => {
    const app = fs.readFileSync(
      path.join(process.cwd(), 'src/components/CultureConnectApp.tsx'),
      'utf8',
    );
    const section = fs.readFileSync(
      path.join(process.cwd(), 'src/components/HomeSection.tsx'),
      'utf8',
    );
    const sections = [
      ['cine', 'seance', 'cineSlotTotal'],
      ['theatre', 'sortie', 'theatreSlotTotal'],
      ['musique', 'sortie', 'musiqueSlotTotal'],
      ['enfants', 'sortie', 'enfantsSlotTotal'],
      ['expo', 'sortie', 'expoSlotTotal'],
      ['autres', 'sortie', 'autresSlotTotal'],
    ] as const;
    for (const [name, unit, total] of sections) {
      assert.match(app, new RegExp(`const ${name}Badge = formatSectionBadge\\(`));
      assert.match(app, new RegExp(`count: visibleSlotCount\\(${total}\\)`));
      assert.match(app, new RegExp(`unit: '${unit}'`));
      assert.match(app, new RegExp(`badge=\\{${name}Badge\\}`));
    }
    assert.equal(app.match(/unit: 'seance'/g)?.length, 1);
    assert.equal(app.match(/unit: 'sortie'/g)?.length, 5);
    assert.equal(app.includes('hideCount'), false);
    assert.match(section, /data-section-badge/);
    assert.equal(section.includes('sorties'), false);
    assert.equal(section.includes('sortie'), false);
  });
});
