'use client';

import type { GenreLegend } from '@/lib/types';
import {
  genreBelongsToMains,
  labelMainCategory,
  mainFromGenreSlug,
} from '@/lib/categories';
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

  const selectedExtra = selected
    .filter((slug) => !availableSlugs.includes(slug))
    .map(resolve)
    .filter((g) => belongsToSelectedMains(g, selectedMains));

  const allVisible = [...available, ...selectedExtra];

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

      {allVisible.length === 0 ? (
        <p className="text-sm text-culture-muted/80">
          Aucun genre pour cette sélection
        </p>
      ) : useGroups ? (
        <div className="space-y-3">
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
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {allVisible
            .slice()
            .sort((a, b) => a.label_fr.localeCompare(b.label_fr, 'fr'))
            .map(renderChip)}
        </div>
      )}
    </div>
  );
}
