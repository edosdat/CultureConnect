import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  CAT_CSS_VAR,
  CAT_HEX,
  CAT_WASH_PCT,
  MAIN_CAT_CSS_VAR,
  PACK_CAT_CSS_VAR,
  catCssVar,
  catCssVarOfItem,
  catKeyFromInput,
  catKeyOfItem,
  catLabelOfItem,
  catWashBackground,
} from './categoryColor';
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
  genre?: string;
}): DayItem {
  const evenement = ev({
    event_id: opts.key,
    categorie: opts.cat,
    titre: opts.key,
    form: opts.form,
    genre: opts.genre,
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
    genre: opts.genre || '',
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

describe('S8.1 palette LOCK', () => {
  it('locks Cinéma terracotta and the six-cat table', () => {
    assert.equal(CAT_HEX.cine, '#E85D3B');
    assert.equal(CAT_HEX.musique, '#6B3FA0');
    assert.equal(CAT_HEX.theatre, '#0D7377');
    assert.equal(CAT_HEX.festival, '#BE185D');
    assert.equal(CAT_HEX.expo, '#334155');
    assert.equal(CAT_HEX.enfants, '#CA8A04');
    assert.equal(CAT_CSS_VAR.cine, '--cat-cine');
    assert.equal(CAT_CSS_VAR.enfants, '--cat-enfants');
    assert.equal(MAIN_CAT_CSS_VAR.cinema, '--cat-cine');
    assert.equal(MAIN_CAT_CSS_VAR.enfants_famille, '--cat-enfants');
    assert.equal(PACK_CAT_CSS_VAR.cine, '--cat-cine');
    assert.equal(PACK_CAT_CSS_VAR.theatre, '--cat-theatre');
  });

  it('declares LOCK hex on --cat-* in globals.css', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/app/globals.css'),
      'utf-8',
    );
    assert.match(css, /--cat-cine:\s*#e85d3b/i);
    assert.match(css, /--cat-musique:\s*#6b3fa0/i);
    assert.match(css, /--cat-theatre:\s*#0d7377/i);
    assert.match(css, /--cat-festival:\s*#be185d/i);
    assert.match(css, /--cat-expo:\s*#334155/i);
    assert.match(css, /--cat-enfants:\s*#ca8a04/i);
    assert.match(css, /--cc-cream:\s*#f7f0e8/i);
    assert.match(css, /--cc-surface:\s*#fffcf8/i);
    assert.match(css, /--cc-ink:\s*#1c1917/i);
    assert.equal(css.includes('#78716c'), false);
  });
});

describe('S8.3 resolved form (post-B4)', () => {
  it('paints film_id as cine even when raw form/categorie is festival', () => {
    const row = item({
      key: 'fid-fest',
      cat: 'festival',
      filmId: 'F-FEST',
      form: 'festival',
    });
    assert.equal(slotFormOfItem(row), 'cine');
    assert.equal(resolvedFormOfItem(row), 'cine');
    assert.equal(catKeyOfItem(row), 'cine');
    assert.equal(catLabelOfItem(row), 'Cinéma');
    assert.equal(catCssVarOfItem(row), '--cat-cine');
  });

  it('maps each resolved form to its token — never raw form alone', () => {
    assert.equal(catKeyOfItem(item({ key: 'm', cat: 'concert', form: 'concert' })), 'musique');
    assert.equal(catKeyOfItem(item({ key: 't', cat: 'theatre', form: 'theatre' })), 'theatre');
    assert.equal(catKeyOfItem(item({ key: 'f', cat: 'festival', form: 'festival' })), 'festival');
    assert.equal(catKeyOfItem(item({ key: 'e', cat: 'exposition', form: 'expo' })), 'expo');
    assert.equal(catKeyOfItem(item({ key: 'k', cat: 'atelier', form: 'enfants' })), 'enfants');
    assert.equal(catKeyFromInput('Cinéma'), 'cine');
    assert.equal(catKeyFromInput('Théâtre'), 'theatre');
    assert.equal(catKeyFromInput('--cc-cat-famille'), 'enfants');
    assert.equal(catCssVar('Cinéma'), '--cat-cine');
    assert.equal(catCssVar('Enfants / familles'), '--cat-enfants');
  });
});

describe('S8.5 VisualFallback wash', () => {
  it('keeps wash in the 8–12% band on cream', () => {
    assert.ok(CAT_WASH_PCT >= 8 && CAT_WASH_PCT <= 12);
    assert.equal(
      catWashBackground('--cat-cine'),
      'color-mix(in srgb, var(--cat-cine) 10%, var(--cc-cream))',
    );
  });

  it('never resolves unknown items to a gray token', () => {
    const row = item({ key: 'x', cat: 'autre' });
    assert.equal(catKeyOfItem(row), 'cine');
    assert.equal(catCssVarOfItem(row), '--cat-cine');
    assert.notEqual(catCssVarOfItem(row), '--cc-cat-autre');
  });
});
