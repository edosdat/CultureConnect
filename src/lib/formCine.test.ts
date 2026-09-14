import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { fillEmptyCineForm, hasOfficialFilmId } from './formCine';
import { resolvedFormOfItem, slotFormOfItem } from './reco';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

function lieu(): Lieu {
  return {
    lieu_id: 'L1',
    nom: 'Salle',
    type: '',
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
    lieu_id: 'L1',
    date_debut: '2026-09-14',
    date_fin: '2026-09-14',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    publication: 'agenda',
    ...p,
  };
}

function item(opts: {
  key: string;
  cat: string;
  filmId?: string;
  form?: string;
}): DayItem {
  const evenement = ev({
    event_id: opts.key,
    categorie: opts.cat,
    titre: opts.key,
    form: opts.form,
  });
  const programme: ProgrammeItem = {
    programme_id: `p-${opts.key}`,
    event_id: opts.key,
    lieu_id: 'L1',
    nom_item: opts.key,
    type_item: 'film',
    date: '2026-09-14',
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: '',
    artiste_id: '',
    film_id: opts.filmId,
    form: opts.form,
  };
  return {
    kind: 'programme',
    key: opts.key,
    dayIso: '2026-09-14',
    programme,
    evenement,
    lieu: lieu(),
  };
}

describe('fillEmptyCineForm', () => {
  it('sets cine when film_id is present and form is empty', () => {
    assert.equal(fillEmptyCineForm('', 'F0013'), 'cine');
    assert.equal(fillEmptyCineForm('   ', 'F0013'), 'cine');
    assert.equal(fillEmptyCineForm(undefined, 'F0013'), 'cine');
  });

  it('never overwrites a form that is already set', () => {
    assert.equal(fillEmptyCineForm('festival', 'F0013'), 'festival');
    assert.equal(fillEmptyCineForm('theatre', 'F0013'), 'theatre');
    assert.equal(fillEmptyCineForm('cine', 'F0013'), 'cine');
  });

  it('leaves form empty when there is no film_id', () => {
    assert.equal(fillEmptyCineForm('', ''), '');
    assert.equal(fillEmptyCineForm('', undefined), '');
    assert.equal(hasOfficialFilmId(''), false);
    assert.equal(hasOfficialFilmId('F1'), true);
  });
});

describe('resolvedFormOfItem / slotFormOfItem', () => {
  it('treats film_id + empty form as cine even without cinema categorie', () => {
    const row = item({ key: 'fid-empty', cat: 'autre', filmId: 'F-ORPHAN' });
    assert.equal((row.programme.form || '').trim(), '');
    assert.equal(slotFormOfItem(row), 'cine');
    assert.equal(resolvedFormOfItem(row), 'cine');
  });

  it('does not let stored festival form hide a film_id from cine matching', () => {
    const row = item({
      key: 'fid-fest',
      cat: 'festival',
      filmId: 'F-FEST',
      form: 'festival',
    });
    assert.equal(slotFormOfItem(row), 'cine');
    assert.equal(resolvedFormOfItem(row), 'cine');
  });
});

describe('CSV fill-empty cine (film_id + empty form)', () => {
  it('programme.csv has 0 film_id rows with empty form', () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), 'data', 'programme.csv'),
      'utf-8',
    );
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const empty = parsed.data.filter(
      (r) => (r.film_id || '').trim() && !(r.form || '').trim(),
    );
    assert.equal(empty.length, 0);
  });

  it('evenements.csv has 0 empty-form events linked to a film_id programme', () => {
    const progText = fs.readFileSync(
      path.join(process.cwd(), 'data', 'programme.csv'),
      'utf-8',
    );
    const evText = fs.readFileSync(
      path.join(process.cwd(), 'data', 'evenements.csv'),
      'utf-8',
    );
    const prog = Papa.parse<Record<string, string>>(progText, {
      header: true,
      skipEmptyLines: true,
    }).data;
    const evs = Papa.parse<Record<string, string>>(evText, {
      header: true,
      skipEmptyLines: true,
    }).data;
    const filmEvents = new Set(
      prog
        .filter((r) => (r.film_id || '').trim())
        .map((r) => r.event_id),
    );
    const empty = evs.filter(
      (e) => filmEvents.has(e.event_id) && !(e.form || '').trim(),
    );
    assert.equal(empty.length, 0);
  });
});
