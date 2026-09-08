import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import {
  isLivingArtsRelatedSeance,
  programmeDisplayTitleNorm,
} from './densify';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

function lieu(): Lieu {
  return {
    lieu_id: 'L150',
    nom: 'Le Kiwi',
    type: '',
    adresse: '',
    commune: 'Ramonville',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
  };
}

function ev(
  p: Partial<Evenement> & Pick<Evenement, 'event_id' | 'categorie' | 'titre'>,
): Evenement {
  return {
    lieu_id: 'L150',
    date_debut: '2026-09-11',
    date_fin: '2026-09-13',
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
    lieu_id: 'L150',
    type_item: '',
    date: '2026-09-11',
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
  eventId?: string;
  day?: string;
  heure?: string;
  form?: string;
  eventTitre?: string;
}): DayItem {
  const day = opts.day ?? '2026-09-11';
  const heure = opts.heure ?? '20:00';
  const eventId = opts.eventId ?? opts.key;
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
      form: opts.form,
    }),
    evenement: ev({
      event_id: eventId,
      categorie: opts.cat,
      titre: opts.eventTitre ?? opts.title,
      date_debut: day,
      date_fin: day,
      heure_debut: heure,
      form: opts.form,
    }),
    lieu: lieu(),
  };
}

function relatedOf(
  open: DayItem,
  rows: { nom_item: string; event_id?: string; titre?: string }[],
) {
  return rows.filter((row) =>
    isLivingArtsRelatedSeance(open, row.nom_item, row.titre),
  );
}

describe('living-arts related seances (title, not event_id)', () => {
  it('keeps only one title when a festival shares one event_id', () => {
    const festivalTitre = 'Festival de rue de Ramonville 2026';
    const open = item({
      key: 'FEP0029',
      title: "Fleur de peau - L'An 01",
      cat: 'theatre',
      eventId: 'EHG007',
      form: 'theatre',
      eventTitre: festivalTitre,
    });
    const rows = [
      { nom_item: "Fleur de peau - L'An 01", event_id: 'EHG007', titre: festivalTitre },
      { nom_item: "Fleur de peau - L'An 01", event_id: 'EHG007', titre: festivalTitre },
      { nom_item: 'Fièvre - .Bart', event_id: 'EHG007', titre: festivalTitre },
      { nom_item: 'KOSTANA', event_id: 'EHG007', titre: festivalTitre },
      { nom_item: 'Hobobo - Patrick de Valette', event_id: 'EHG007', titre: festivalTitre },
    ];
    const related = relatedOf(open, rows);
    assert.equal(related.length, 2);
    assert.ok(
      related.every((r) => r.nom_item === "Fleur de peau - L'An 01"),
    );
    assert.equal(
      programmeDisplayTitleNorm(open.programme.nom_item, open.evenement?.titre),
      "fleur de peau - l'an 01",
    );
  });

  it('lists every créneau of a mono-title work under one event_id', () => {
    const open = item({
      key: 'p-bulle-0',
      title: 'La Bulle',
      cat: 'theatre',
      eventId: 'E351',
      form: 'theatre',
    });
    const rows = ['09:30', '10:20', '11:10'].flatMap((heure, i) =>
      ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'].map((day, j) => ({
        nom_item: 'La Bulle',
        event_id: 'E351',
        titre: 'La Bulle',
        day,
        heure,
        id: `${i}-${j}`,
      })),
    );
    assert.equal(relatedOf(open, rows).length, 12);
  });

  it('still joins weekly BAR* clones that mint a new event_id each night', () => {
    const open = item({
      key: 'flash-87',
      title: 'La Flashback by Jean-Heude',
      cat: 'concert',
      eventId: 'BAR087',
      form: 'concert',
    });
    const rows = [87, 94, 99, 101].map((n) => ({
      nom_item: 'La Flashback by Jean-Heude',
      event_id: `BAR0${n}`,
      titre: 'La Flashback by Jean-Heude',
    }));
    assert.equal(relatedOf(open, rows).length, 4);
  });
});

describe('programme.csv Fleur de peau (EHG007)', () => {
  it('detail title match returns only that show’s créneaux', () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), 'data', 'programme.csv'),
      'utf-8',
    );
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const festival = parsed.data.filter(
      (row) => (row.event_id || '').trim() === 'EHG007',
    );
    assert.ok(
      festival.length > 20,
      `expected multi-show festival under EHG007, got ${festival.length}`,
    );
    const fleur = festival.filter((row) =>
      (row.nom_item || '').includes('Fleur de peau'),
    );
    assert.ok(
      fleur.length >= 1,
      'expected Fleur de peau rows under EHG007',
    );
    const open = item({
      key: fleur[0]!.programme_id,
      title: fleur[0]!.nom_item,
      cat: 'theatre',
      eventId: 'EHG007',
      form: 'theatre',
      eventTitre: 'Festival de rue de Ramonville 2026 (39e édition)',
    });
    const related = relatedOf(
      open,
      festival.map((row) => ({
        nom_item: row.nom_item,
        event_id: row.event_id,
        titre: 'Festival de rue de Ramonville 2026 (39e édition)',
      })),
    );
    assert.equal(related.length, fleur.length);
    assert.ok(
      related.every((row) => (row.nom_item || '').includes('Fleur de peau')),
    );
    assert.ok(
      related.length < festival.length,
      'must not pull the whole festival onto one fiche',
    );
  });
});
