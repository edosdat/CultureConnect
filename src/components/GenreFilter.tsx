'use client';

import type { GenreLegend } from '@/lib/types';
import {
  genreBelongsToMains,
  mainFromGenreSlug,
} from '@/lib/categories';
import { genreChipsPaint } from '@/lib/genreChipMatch';
import { humanizeGenreSlug } from '@/lib/labels';

type Props = {
  /** Genre slugs available for the current selection (month/day + other filters). */
  availableSlugs: string[];
  legend: GenreLegend[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Selected main category ids — genres only show when at least one is set. */
  selectedMains: string[];
  /** When true, hide the "choose a category" placeholder entirely */
  hideWhenNoCategory?: boolean;
  /** Filtered genre options are still computing — never show the empty copy. */
  loading?: boolean;
};

function syntheticLegend(slug: string): GenreLegend {
  return {
    slug,
    label_fr: humanizeGenreSlug(slug),
    famille: '',
  };
}

function belongsToSelectedMains(
  g: GenreLegend,
  selectedMains: string[],
): boolean {
  if (genreBelongsToMains(g, selectedMains)) return true;
  const fromSlug = mainFromGenreSlug(g.slug);
  if (fromSlug && selectedMains.includes(fromSlug)) return true;
  return false;
}

export default function GenreFilter({
  availableSlugs,
  legend,
  selected,
  onChange,
  selectedMains,
  hideWhenNoCategory = true,
  loading = false,
}: Props) {
  if (selectedMains.length === 0) {
    if (hideWhenNoCategory) return null;
    return (
      <div className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          Genres
        </h2>
        <p className="text-sm text-culture-muted/80">
          Choisissez une catégorie pour affiner par genre
        </p>
      </div>
    );
  }

  const legendBySlug = new Map(legend.map((g) => [g.slug, g]));

  const resolve = (slug: string): GenreLegend =>
    legendBySlug.get(slug) ?? syntheticLegend(slug);

  const available = availableSlugs
    .map(resolve)
    .filter((g) => {
      if (belongsToSelectedMains(g, selectedMains)) return true;
      const fromSlug = mainFromGenreSlug(g.slug);
      if (fromSlug && selectedMains.includes(fromSlug)) return true;
      return selectedMains.length > 0;
    });

  // Selected chips are merged into availableSlugs by the parent (sticky Jazz).
  const allVisible = available;

  function toggle(slug: string) {
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else {
      onChange([...selected, slug]);
    }
  }

  function renderChip(g: GenreLegend) {
    const active = selected.includes(g.slug);
    return (
      <button
        key={g.slug}
        type="button"
        onClick={() => toggle(g.slug)}
        aria-pressed={active}
        className={
          'cc-axes__chip shrink-0 whitespace-nowrap rounded-full border transition ' +
          (active
            ? 'border-culture-sage bg-culture-sage text-planc-nuit shadow-sm'
            : 'border-culture-line bg-culture-surface text-culture-ink hover:border-culture-sage/60')
        }
      >
        {g.label_fr}
      </button>
    );
  }

  const paint = genreChipsPaint({
    selectedMains,
    availableCount: allVisible.length,
    loading,
  });
  const chips =
    paint === 'loading'
      ? selected.map((slug) => renderChip(resolve(slug)))
      : allVisible
          .slice()
          .sort((a, b) => a.label_fr.localeCompare(b.label_fr, 'fr'))
          .map(renderChip);

  return (
    <div
      className="cc-scroll-shell min-w-0"
      data-genres-state={paint === 'loading' ? 'loading' : allVisible.length === 0 ? 'empty' : 'ready'}
      role={paint === 'loading' ? 'status' : undefined}
      aria-live={paint === 'loading' ? 'polite' : undefined}
      aria-busy={paint === 'loading' ? true : undefined}
    >
      <div className="cc-axes__group cc-genre-scroll" role="group" aria-label="Genres">
        <p className="sr-only">Genres</p>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="cc-axes__chip shrink-0 whitespace-nowrap rounded-full text-culture-terracotta hover:underline"
          >
            Tout effacer
          </button>
        ) : null}
        {paint === 'loading' ? (
          <span className="cc-genre-skel h-7 w-24 shrink-0 rounded-full" aria-hidden />
        ) : null}
        {paint === 'loading' ? (
          <p className="sr-only">Chargement…</p>
        ) : null}
        {paint !== 'loading' && allVisible.length === 0 ? (
          <p className="shrink-0 whitespace-nowrap text-xs text-culture-muted/80">
            Aucun genre pour cette sélection
          </p>
        ) : (
          chips
        )}
      </div>
    </div>
  );
}
