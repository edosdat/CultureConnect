import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatKmLabel, haversineKm, parseLieuCoords } from './geo';
import {
  itemKmLabel,
  itemSortKm,
  minKmLabel,
  nearMeOnDenied,
  nearMeOnGranted,
  nearMeOnToggleOff,
  resolveNearMeResult,
  sortItemsNearestFirst,
  TOULOUSE_CHIP_DEFAULT,
  assertGpsNotPersisted,
} from './nearMe';
import { buildAgendaParams } from './agendaParams';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { filterSeancesForActiveFilters } from './displayFilter';
import { visibleTop3Items, visibleTop3Nearest } from './displayHome';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

function lieu(opts: {
  commune?: string;
  id?: string;
  lat?: string;
  lng?: string;
}): Lieu {
  return {
    lieu_id: opts.id ?? 'L1',
    nom: 'Salle',
    type: '',
    adresse: '',
    commune: opts.commune ?? 'Toulouse',
    dist_km_capitole: '2',
    site_web: '',
    notes: '',
    lat: opts.lat,
    lng: opts.lng,
  };
}

function item(opts: {
  key: string;
  cat: string;
  day: string;
  commune?: string;
  lieuId?: string;
  lat?: string;
  lng?: string;
}): DayItem {
  const evenement: Evenement = {
    event_id: opts.key,
    lieu_id: opts.lieuId ?? 'L1',
    titre: opts.key,
    categorie: opts.cat,
    date_debut: opts.day,
    date_fin: opts.day,
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
  };
  const programme: ProgrammeItem = {
    programme_id: `p-${opts.key}`,
    event_id: opts.key,
    lieu_id: opts.lieuId ?? 'L1',
    nom_item: opts.key,
    type_item: '',
    date: opts.day,
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: '',
    artiste_id: '',
  };
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: opts.day,
    programme,
    evenement,
    lieu: lieu({
      commune: opts.commune,
      id: opts.lieuId,
      lat: opts.lat,
      lng: opts.lng,
    }),
  };
}

const CAPITOLE: { lat: number; lng: number } = { lat: 43.6045, lng: 1.444 };

describe('geo crow-flies', () => {
  it('formats 2,3 km with a comma', () => {
    assert.equal(formatKmLabel(2.3), '2,3 km');
    assert.equal(formatKmLabel(10), '10 km');
    assert.equal(formatKmLabel(0.84), '0,8 km');
  });

  it('haversine Capitole → Pathé Labège is about 8 km', () => {
    const labege = { lat: 43.5486, lng: 1.5069 };
    const km = haversineKm(CAPITOLE, labege);
    assert.ok(km > 6 && km < 10, `got ${km}`);
  });

  it('skips km label when venue has no lat/lng', () => {
    const row = item({
      key: 'no-gps',
      cat: 'theatre',
      day: '2026-09-01',
      commune: 'Toulouse',
    });
    assert.equal(parseLieuCoords(row.lieu), null);
    assert.equal(itemKmLabel(row, CAPITOLE), null);
  });

  it('labels when venue coords exist', () => {
    const row = item({
      key: 'wilson',
      cat: 'cinema',
      day: '2026-09-01',
      lat: '43.6045',
      lng: '1.4472',
    });
    const label = itemKmLabel(row, CAPITOLE);
    assert.ok(label);
    assert.match(label!, /\d+(,\d)? km/);
  });
});

describe('près de moi sort', () => {
  it('sorts recos + catalogue nearest-first', () => {
    const far = item({
      key: 'labege',
      cat: 'cinema',
      day: '2026-09-01',
      commune: 'Labège',
      lat: '43.5486',
      lng: '1.5069',
    });
    const near = item({
      key: 'wilson',
      cat: 'cinema',
      day: '2026-09-01',
      commune: 'Toulouse',
      lat: '43.6045',
      lng: '1.4472',
    });
    const mid = item({
      key: 'blagnac',
      cat: 'theatre',
      day: '2026-09-01',
      commune: 'Blagnac',
      lat: '43.636',
      lng: '1.375',
    });
    const sorted = sortItemsNearestFirst([far, mid, near], CAPITOLE);
    assert.deepEqual(
      sorted.map((r) => r.key),
      ['wilson', 'blagnac', 'labege'],
    );
  });

  it('empty CSV lat/lng skips km label and sorts after located venues', () => {
    const empty = item({
      key: 'empty',
      cat: 'theatre',
      day: '2026-09-01',
      commune: 'Toulouse',
    });
    const wilson = item({
      key: 'wilson',
      cat: 'cinema',
      day: '2026-09-01',
      lat: '43.6045',
      lng: '1.4472',
    });
    assert.equal(itemKmLabel(empty, CAPITOLE), null);
    assert.equal(itemSortKm(empty, CAPITOLE), Number.POSITIVE_INFINITY);
    const sorted = sortItemsNearestFirst([empty, wilson], CAPITOLE);
    assert.deepEqual(
      sorted.map((r) => r.key),
      ['wilson', 'empty'],
    );
  });

  it('haversine uses lieux.csv lat/lng columns (OSM); 19 rows stay unlabeled', () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), 'data', 'lieux.csv'),
      'utf-8',
    );
    const rows = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    }).data;
    const withCoords = rows.filter(
      (r) => (r.lat || '').trim() && (r.lng || '').trim(),
    );
    const empty = rows.filter(
      (r) => !(r.lat || '').trim() || !(r.lng || '').trim(),
    );
    assert.ok(withCoords.length >= 127, `got ${withCoords.length} with coords`);
    assert.equal(empty.length, 19);
    const wilson = withCoords.find((r) => r.lieu_id === 'L137');
    assert.ok(wilson);
    const pos = parseLieuCoords(wilson);
    assert.ok(pos);
    const km = haversineKm(CAPITOLE, pos!);
    assert.ok(km >= 0 && km < 2, `Wilson should be near Capitole, got ${km}`);
    const reynerie = empty.find((r) => r.lieu_id === 'L011');
    assert.ok(reynerie);
    assert.equal(parseLieuCoords(reynerie), null);
    assert.equal(
      itemKmLabel({ lieu: { lat: reynerie!.lat, lng: reynerie!.lng } }, CAPITOLE),
      null,
    );
  });

  it('film group label uses the nearest salle with coords', () => {
    const near = item({
      key: 'f-near',
      cat: 'cinema',
      day: '2026-09-01',
      lat: '43.6045',
      lng: '1.4472',
    });
    const far = item({
      key: 'f-far',
      cat: 'cinema',
      day: '2026-09-01',
      lat: '43.5486',
      lng: '1.5069',
    });
    const label = minKmLabel([far, near], CAPITOLE);
    const nearLabel = itemKmLabel(near, CAPITOLE);
    assert.equal(label, nearLabel);
  });
});

describe('près de moi permission + persistence', () => {
  it('denied keeps Toulouse and drops pos — no error wall state', () => {
    const next = resolveNearMeResult(
      { ok: false, reason: 'denied' },
      TOULOUSE_CHIP_DEFAULT,
    );
    assert.deepEqual(next, nearMeOnDenied());
    assert.equal(next.commune, 'Toulouse');
    assert.equal(next.active, false);
    assert.equal(next.pos, null);
  });

  it('granted lifts commune filter and keeps pos in memory only', () => {
    const next = nearMeOnGranted(CAPITOLE);
    assert.equal(next.active, true);
    assert.equal(next.commune, null);
    assert.deepEqual(next.pos, CAPITOLE);
  });

  it('toggle off restores Toulouse and clears pos', () => {
    const next = nearMeOnToggleOff();
    assert.equal(next.commune, 'Toulouse');
    assert.equal(next.pos, null);
    assert.equal(next.active, false);
  });

  it('never puts lat/lng on agenda URL params', () => {
    const p = buildAgendaParams({
      scope: 'soir',
      commune: null,
      q: '',
      cats: [],
      genres: [],
      lieuId: null,
      selectedDate: '2026-09-01',
      year: 2026,
      month: 9,
    });
    assert.equal(p.get('lat'), null);
    assert.equal(p.get('lng'), null);
    assert.equal(p.get('commune'), null);
    assertGpsNotPersisted(Object.fromEntries(p.entries()));
  });
});

describe('DATE still filters top 3; QUOI does not', () => {
  const cine = item({
    key: 'cine-19',
    cat: 'cinema',
    day: '2026-09-19',
    lat: '43.6045',
    lng: '1.4472',
  });
  const th = item({
    key: 'th-19',
    cat: 'theatre',
    day: '2026-09-19',
    lat: '43.6008',
    lng: '1.4533',
  });
  const co = item({
    key: 'co-01',
    cat: 'musique',
    day: '2026-09-01',
    lat: '43.5944',
    lng: '1.3808',
  });

  it('date window still empties off-day recos when near-me is on', () => {
    const kept = filterSeancesForActiveFilters([cine, th, co], {
      startIso: '2026-09-19',
      endIso: '2026-09-19',
      commune: null,
    });
    assert.deepEqual(
      kept.map((r) => r.key),
      ['cine-19', 'th-19'],
    );
    const top = visibleTop3Nearest(kept, CAPITOLE);
    assert.ok(top.every((r) => r.dayIso === '2026-09-19'));
    assert.ok(!top.some((r) => r.key === 'co-01'));
  });

  it('QUOI / cat chips do not filter the top 3 slot picks', () => {
    const pool = [cine, th, co];
    const slots = visibleTop3Items(pool);
    assert.ok(slots.some((r) => r.key === 'cine-19'));
    assert.ok(slots.some((r) => r.key === 'th-19'));
    assert.ok(slots.some((r) => r.key === 'co-01'));
  });
});
