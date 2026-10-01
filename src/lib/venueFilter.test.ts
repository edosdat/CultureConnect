import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { queryAgenda } from './agendaQuery';
import { normalizeCommune } from './commune';
import {
  SALLE_ALL_LABEL,
  SALLE_CHIP_LABEL,
  retainSelectedLieuId,
  venueChipShown,
  venueFilterVisible,
} from './venueFilter';

const here = dirname(fileURLToPath(import.meta.url));

describe('venueFilterVisible', () => {
  it('hides Salle when no QUOI category', () => {
    assert.equal(venueFilterVisible([]), false);
  });

  it('shows Salle when a category is on', () => {
    assert.equal(venueFilterVisible(['cinema']), true);
  });
});

describe('Salle chip', () => {
  it('labels the chip Salle and the clear row Toutes les salles', () => {
    assert.equal(SALLE_CHIP_LABEL, 'Salle');
    assert.equal(SALLE_ALL_LABEL, 'Toutes les salles');
  });

  it('shows on mobile without Filtres once Ciné or Théâtre is on', () => {
    assert.equal(
      venueChipShown({
        selectedMains: ['cinema'],
        venueCount: 0,
        loading: true,
      }),
      true,
    );
    assert.equal(
      venueChipShown({
        selectedMains: ['theatre_danse'],
        venueCount: 4,
        loading: false,
      }),
      true,
    );
    assert.equal(
      venueChipShown({ selectedMains: [], venueCount: 10, loading: true }),
      false,
    );
  });

  it('shows Musique only when that category has salles', () => {
    assert.equal(
      venueChipShown({
        selectedMains: ['musique'],
        venueCount: 0,
        loading: true,
      }),
      false,
    );
    assert.equal(
      venueChipShown({
        selectedMains: ['musique'],
        venueCount: 0,
        loading: false,
      }),
      false,
    );
    assert.equal(
      venueChipShown({
        selectedMains: ['musique'],
        venueCount: 2,
        loading: false,
      }),
      true,
    );
  });

  it('is a dropdown in the QUOI group, not a Filtres-gated chip rail', () => {
    const ui = readFileSync(join(here, '../components/VenueFilter.tsx'), 'utf8');
    const app = readFileSync(
      join(here, '../components/CultureConnectApp.tsx'),
      'utf8',
    );
    assert.match(ui, /aria-haspopup="listbox"/);
    assert.match(ui, /SALLE_CHIP_LABEL/);
    assert.match(ui, /SALLE_ALL_LABEL/);
    assert.equal(ui.includes('basis-full'), false);
    assert.equal(ui.includes('>Salles<'), false);
    const venueAt = app.indexOf('<VenueFilter');
    const moreAt = app.indexOf('cc-axes__more');
    assert.ok(venueAt > 0 && moreAt > venueAt);
    assert.equal(app.includes("showFiltersMobile ? 'flex' : 'hidden'"), false);
  });
});

describe('retainSelectedLieuId', () => {
  const venues = [{ lieu_id: 'L017' }, { lieu_id: 'L042' }];

  it('clears when category cleared', () => {
    assert.equal(retainSelectedLieuId('L017', [], venues), null);
  });

  it('clears when salle left the category options', () => {
    assert.equal(retainSelectedLieuId('L099', ['cinema'], venues), null);
  });

  it('keeps salle still in options', () => {
    assert.equal(retainSelectedLieuId('L017', ['cinema'], venues), 'L017');
  });

  it('keeps selection while options are still empty (in-flight)', () => {
    assert.equal(retainSelectedLieuId('L017', ['cinema'], []), 'L017');
  });

  it('noop when nothing selected', () => {
    assert.equal(retainSelectedLieuId(null, ['cinema'], venues), null);
  });
});

function venueIds(venues: { lieu_id: string }[]): string[] {
  return venues.map((v) => v.lieu_id).sort();
}

describe('Salle menu lists every venue of the category', () => {
  const now = new Date('2026-10-01T10:00:00Z');
  const base = {
    q: '',
    genres: [] as string[],
    lieuId: null as string | null,
    selectedDate: null,
    year: 2026,
    month: 10,
  };

  it('keeps the full category list when Quand, genre, or a salle narrow the cards', () => {
    const tous = queryAgenda(
      {
        ...base,
        scope: 'tous',
        commune: 'Toulouse',
        cats: ['cinema'],
      },
      now,
    );
    assert.ok(tous.venues.length > 1);
    assert.ok(
      tous.venues.every((v) => normalizeCommune(v.commune) === 'toulouse'),
    );
    const lieuId = tous.venues[0]?.lieu_id;
    assert.ok(lieuId);
    const narrowed = queryAgenda(
      {
        ...base,
        scope: 'soir',
        commune: 'Toulouse',
        cats: ['cinema'],
        lieuId,
        genres: ['__no_such_genre__'],
      },
      now,
    );
    assert.deepEqual(venueIds(narrowed.venues), venueIds(tous.venues));
    assert.equal(narrowed.items.length, 0);
  });

  it('uses the same salles for Théâtre on Ce soir and on Tout', () => {
    const soir = queryAgenda(
      {
        ...base,
        scope: 'soir',
        commune: 'Toulouse',
        cats: ['theatre_danse'],
      },
      now,
    );
    const tous = queryAgenda(
      {
        ...base,
        scope: 'tous',
        commune: 'Toulouse',
        cats: ['theatre_danse'],
      },
      now,
    );
    assert.ok(tous.venues.length > 1);
    assert.deepEqual(venueIds(soir.venues), venueIds(tous.venues));
    assert.ok(soir.total < tous.total);
  });

  it('shows Musique salles when that category has venues', () => {
    const mus = queryAgenda(
      {
        ...base,
        scope: 'tous',
        commune: 'Toulouse',
        cats: ['musique'],
      },
      now,
    );
    assert.ok(mus.venues.length > 0);
  });

  it('lists the whole category when no commune is set', () => {
    const metro = queryAgenda(
      {
        ...base,
        scope: 'soir',
        commune: null,
        cats: ['cinema'],
        lieuId: 'L000-missing',
        genres: ['__no_such_genre__'],
      },
      now,
    );
    const tous = queryAgenda(
      {
        ...base,
        scope: 'tous',
        commune: null,
        cats: ['cinema'],
      },
      now,
    );
    assert.deepEqual(venueIds(metro.venues), venueIds(tous.venues));
    assert.ok(
      metro.venues.some((v) => normalizeCommune(v.commune) !== 'toulouse'),
    );
  });
});
