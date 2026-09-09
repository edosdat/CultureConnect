'use client';

import type { GenreLegend } from '@/lib/types';
import {
  genreBelongsToMains,
  labelMainCategory,
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

const SKELETON_CHIP_WIDTHS = ['w-14', 'w-16', 'w-[4.5rem]', 'w-12'] as const;

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

  const byMain = new Map<string, GenreLegend[]>();
  for (const g of allVisible) {
    const main =
      selectedMains.find((m) => belongsToSelectedMains(g, [m])) ?? 'autre';
    const list = byMain.get(main) ?? [];
    list.push(g);
    byMain.set(main, list);
  }

  const mainsOrder = selectedMains.filter((m) => byMain.has(m));
  const useGroups = mainsOrder.length > 1;

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
          'shrink-0 rounded-full border px-2.5 py-1.5 text-xs transition ' +
          (active
            ? 'border-culture-sage bg-culture-sage text-white shadow-sm'
            : 'border-culture-line bg-culture-surface text-culture-ink hover:border-culture-sage/60')
        }
      >
        {g.label_fr}
      </button>
    );
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-culture-muted">
          Genres
        </p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-culture-terracotta hover:underline"
          >
            Tout effacer
          </button>
        )}
      </div>

      {genreChipsPaint({
        selectedMains,
        availableCount: allVisible.length,
        loading,
      }) === 'loading' ? (
        <div
          className="space-y-1.5"
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-genres-state="loading"
        >
          {selected.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {selected.map((slug) => renderChip(resolve(slug)))}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-culture-line border-t-culture-sage"
              aria-hidden
            />
            <p className="text-xs text-culture-muted/90">
              Chargement des genres…
            </p>
          </div>
          <div className="flex gap-1.5" aria-hidden>
            {SKELETON_CHIP_WIDTHS.map((w) => (
              <span
                key={w}
                className={`h-7 ${w} animate-pulse rounded-full bg-culture-sand`}
              />
            ))}
          </div>
        </div>
      ) : allVisible.length === 0 ? (
        <p
          className="text-sm text-culture-muted/80"
          data-genres-state="empty"
        >
          Aucun genre pour cette sélection
        </p>
      ) : useGroups ? (
        <div className="space-y-3" data-genres-state="ready">
          {mainsOrder.map((main) => {
            const items = byMain.get(main) ?? [];
            items.sort((a, b) => a.label_fr.localeCompare(b.label_fr, 'fr'));
            return (
              <div key={main} className="space-y-1.5">
                <p className="text-xs font-medium text-culture-muted/80">
                  {labelMainCategory(main)}
                </p>
                <div className="flex flex-wrap gap-1.5">{items.map(renderChip)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-genres-state="ready"
        >
          {allVisible
            .slice()
            .sort((a, b) => a.label_fr.localeCompare(b.label_fr, 'fr'))
            .map(renderChip)}
        </div>
      )}
    </div>
  );
}
