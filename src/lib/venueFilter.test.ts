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
  VENUE_MENU_MAX_PX,
  VENUE_MENU_Z,
  placeVenueMenu,
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

  it('is a dropdown in the dense band, not a Filtres-gated chip rail', () => {
    const ui = readFileSync(join(here, '../components/VenueFilter.tsx'), 'utf8');
    const app = readFileSync(
      join(here, '../components/CultureConnectApp.tsx'),
      'utf8',
    );
    assert.match(ui, /aria-haspopup="listbox"/);
    assert.match(ui, /SALLE_CHIP_LABEL/);
    assert.match(ui, /SALLE_ALL_LABEL/);
    assert.match(ui, /data-salle-slot/);
    assert.equal(ui.includes('basis-full'), false);
    assert.equal(ui.includes('>Salles<'), false);
    const bandAt = app.indexOf('className="cc-filter-band"');
    const cityAt = app.indexOf('<CityFilter');
    const nearAt = app.indexOf('<NearMeChip');
    const moreAt = app.indexOf('cc-axes__more');
    const venueAt = app.indexOf('<VenueFilter');
    const genresAt = app.indexOf('GENRES: second band');
    const calAt = app.indexOf('<MonthCalendarDrawer');
    const boot = readFileSync(
      join(here, '../components/HomeBootChrome.tsx'),
      'utf8',
    );
    assert.ok(bandAt > 0 && cityAt > bandAt && nearAt > cityAt);
    assert.ok(venueAt > nearAt && moreAt > venueAt);
    assert.ok(genresAt > moreAt && calAt > genresAt);
    assert.equal(app.includes('Voir le mois'), false);
    assert.equal(app.includes('Masquer le mois'), false);
    assert.equal(boot.includes('Voir le mois'), false);
    assert.match(app, /cc-filter-band__place[\s\S]{0,2500}<VenueFilter/);
    assert.match(app, /cc-axes__group cc-axes__group--scroll/);
    assert.match(app, /cc-filter-band__facets/);
    assert.match(app, /selectedCategories\.length > 0 && facetsOpen/);
    assert.match(app, /hideWhenNoCategory/);
    assert.equal(app.includes("showFiltersMobile ? 'flex' : 'hidden'"), false);
    assert.equal(app.includes('md:flex'), false);
    assert.equal(app.includes('md:hidden'), false);
    assert.equal(app.includes('data-salle-slot'), false);
    assert.match(ui, /placeVenueMenu/);
    assert.match(ui, /createPortal/);
    assert.match(ui, /overflow-y-auto/);
    assert.match(ui, /VENUE_MENU_Z/);
  });
});

describe('placeVenueMenu', () => {
  const view = { viewportWidth: 1200, viewportHeight: 800 };

  it('opens under the chip when there is room below', () => {
    const box = placeVenueMenu({
      ...view,
      rect: { top: 120, bottom: 156, left: 40 },
    });
    assert.equal(box.top, 160);
    assert.equal(box.bottom, null);
    assert.equal(box.left, 40);
    assert.equal(box.width, 320);
    assert.equal(box.maxHeight, VENUE_MENU_MAX_PX);
  });

  it('flips above the chip when space below is tight and space above is larger', () => {
    const box = placeVenueMenu({
      ...view,
      rect: { top: 700, bottom: 736, left: 40 },
    });
    assert.equal(box.top, null);
    assert.equal(box.bottom, 800 - 700 + 4);
    assert.equal(box.maxHeight, VENUE_MENU_MAX_PX);
  });

  it('stays below and shortens maxHeight when the space above is smaller', () => {
    const box = placeVenueMenu({
      viewportWidth: 390,
      viewportHeight: 700,
      rect: { top: 80, bottom: 560, left: 16 },
    });
    assert.equal(box.top, 564);
    assert.equal(box.bottom, null);
    assert.equal(box.maxHeight, 700 - 560 - 4 - 8);
  });

  it('clamps the menu inside the viewport horizontally', () => {
    const box = placeVenueMenu({
      viewportWidth: 400,
      viewportHeight: 800,
      rect: { top: 200, bottom: 236, left: 300 },
    });
    assert.equal(box.width, 320);
    assert.equal(box.left, 400 - 320 - 8);
    const narrow = placeVenueMenu({
      viewportWidth: 280,
      viewportHeight: 800,
      rect: { top: 200, bottom: 236, left: -40 },
    });
    assert.equal(narrow.width, 280 - 16);
    assert.equal(narrow.left, 8);
  });

  it('keeps the open menu above the cookie banner and the digest intro', () => {
    assert.ok(VENUE_MENU_Z >= 80);
  });
});

describe('home axes column', () => {
  it('keeps QUAND then QUOI stacked and glues the band at 6px', () => {
    const css = readFileSync(join(here, '../app/globals.css'), 'utf8');
    const start = css.indexOf('Filter band');
    const end = css.indexOf('.cine-hero-frame');
    assert.ok(start > 0 && end > start);
    const axes = css.slice(start, end);
    assert.match(axes, /\.cc-filter-band \{[^}]*flex-direction:\s*column/);
    assert.match(axes, /\.cc-filter-band \{[^}]*gap:\s*0\.375rem/);
    assert.match(axes, /\.cc-axes-row \{[^}]*flex-direction:\s*column/);
    assert.match(axes, /\.cc-axes \{[^}]*flex-direction:\s*column/);
    assert.match(axes, /\.cc-axes__group \{[^}]*gap:\s*0\.375rem/);
    assert.match(axes, /\.cc-axes__chip \{[^}]*padding:\s*0\.2rem 0\.55rem/);
    assert.match(axes, /\.cc-filter-band__facets \{[^}]*gap:\s*0\.375rem/);
    assert.match(axes, /\.cc-genre-scroll \{[^}]*overflow-x:\s*auto/);
    assert.match(axes, /\.cc-filter-band__place \{[^}]*flex-wrap:\s*nowrap/);
    assert.match(axes, /\.cc-filter-band__place \{[^}]*overflow-x:\s*auto/);
    assert.match(
      axes,
      /\.cc-axes__group\.cc-axes__group--scroll \{[^}]*flex-wrap:\s*nowrap/,
    );
    assert.match(
      axes,
      /\.cc-axes__group\.cc-axes__group--scroll \{[^}]*overflow-x:\s*auto/,
    );
    assert.equal(axes.includes('display: contents'), false);
    assert.equal(css.includes('flex-direction: row'), false);
    const outside = css.slice(0, start) + css.slice(end);
    assert.equal(outside.includes('overflow-x: auto'), false);
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
