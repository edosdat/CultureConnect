import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { queryAgenda } from './agendaQuery';
import { normalizeCommune } from './commune';
import type { DayItem } from './types';

const here = dirname(fileURLToPath(import.meta.url));

function itemLieuId(item: DayItem): string {
  if (item.lieu?.lieu_id) return item.lieu.lieu_id;
  if (item.kind === 'programme') return item.programme.lieu_id || '';
  return item.evenement.lieu_id || '';
}

describe('Salle chip is gone', () => {
  it('has no Salle control on home, QUOI, or the search confirm step', () => {
    const app = readFileSync(
      join(here, '../components/CultureConnectApp.tsx'),
      'utf8',
    );
    const search = readFileSync(
      join(here, '../components/SearchOmnibox.tsx'),
      'utf8',
    );
    const boot = readFileSync(
      join(here, '../components/HomeBootChrome.tsx'),
      'utf8',
    );
    assert.equal(app.includes('<VenueFilter'), false);
    assert.equal(app.includes('Toutes les salles'), false);
    assert.equal(app.includes('data-salle-chip'), false);
    assert.equal(app.includes('Filtrer par salle'), false);
    assert.equal(app.includes('setSelectedLieuId'), false);
    assert.equal(search.includes('salle'), false);
    assert.equal(boot.includes('>Salle<'), false);
    const bandAt = app.indexOf('className="cc-filter-band"');
    const cityAt = app.indexOf('<CityFilter');
    const nearAt = app.indexOf('<NearMeChip');
    const moreAt = app.indexOf('cc-axes__more');
    const genresAt = app.indexOf('GENRES: second band');
    const calAt = app.indexOf('<MonthCalendarDrawer');
    assert.ok(bandAt > 0 && cityAt > bandAt && nearAt > cityAt && moreAt > nearAt);
    assert.ok(genresAt > moreAt && calAt > genresAt);
    assert.equal(app.includes('Voir le mois'), false);
    assert.equal(boot.includes('Voir le mois'), false);
    assert.match(app, /cc-axes__group cc-axes__group--scroll/);
    assert.match(app, /selectedCategories\.length > 0 && facetsOpen/);
    assert.match(app, /onBareQuery=\{handleBareQuery\}/);
    const confirm = app.slice(
      app.indexOf('function handleNlConfirm'),
      app.indexOf('function handleSuggestTitre'),
    );
    assert.equal(confirm.includes('setSelectedLieuId'), false);
    assert.equal(confirm.includes('lieuId'), false);
  });
});

describe('search text lists a venue without a salle chip', () => {
  const now = new Date('2026-10-03T12:00:00+02:00');
  const base = {
    scope: 'tous' as const,
    commune: 'Toulouse',
    cats: [] as string[],
    genres: [] as string[],
    lieuId: null,
    selectedDate: null,
    year: 2026,
    month: 10,
    q: '',
  };

  it('taquin (any case) returns every upcoming Le Taquin event', () => {
    const byLieu = queryAgenda({ ...base, q: '', lieuId: 'L075', limit: 400 }, now);
    const lower = queryAgenda({ ...base, q: 'taquin', lieuId: null }, now);
    const upper = queryAgenda({ ...base, q: 'TAQUIN', lieuId: null }, now);
    assert.ok(byLieu.total > 0, 'catalogue has upcoming events at Le Taquin');
    assert.equal(byLieu.items.length, byLieu.total);
    const wanted = new Set(
      byLieu.items.filter((item) => itemLieuId(item) === 'L075').map((item) => item.key),
    );
    assert.equal(wanted.size, byLieu.total);
    for (const key of wanted) {
      assert.ok(lower.items.some((item) => item.key === key));
      assert.ok(upper.items.some((item) => item.key === key));
    }
    assert.equal(lower.total, upper.total);
    assert.ok(lower.total >= wanted.size);
    assert.equal(lower.items.length, lower.total);
  });

  it('a nonsense query does not list Le Taquin', () => {
    const noise = queryAgenda({ ...base, q: 'zzzzqxqqqq', lieuId: null }, now);
    assert.equal(noise.total, 0);
    assert.equal(noise.items.some((item) => itemLieuId(item) === 'L075'), false);
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
