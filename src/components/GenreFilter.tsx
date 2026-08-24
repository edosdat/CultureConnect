'use client';

import type { GenreLegend } from '@/lib/types';
import { genreBelongsToMains, labelMainCategory } from '@/lib/categories';

type Props = {
  /** Genre slugs available for the current selection (month/day + other filters). */
  availableSlugs: string[];
  legend: GenreLegend[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Selected main category ids — genres only show when at least one is set. */
  selectedMains: string[];
};

export default function GenreFilter({
  availableSlugs,
  legend,
  selected,
  onChange,
  selectedMains,
}: Props) {
  if (selectedMains.length === 0) {
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

  const inSelectedMains = (g: GenreLegend) =>
    genreBelongsToMains(g, selectedMains);

  const available = availableSlugs
    .map((slug) => legendBySlug.get(slug))
    .filter((g): g is GenreLegend => Boolean(g))
    .filter(inSelectedMains);

  // Keep selected genres visible even if they fall out of the current slice
  // (e.g. after changing day), so the user can clear them — but only if they
  // still belong to a selected main.
  const selectedExtra = selected
    .filter((slug) => !availableSlugs.includes(slug))
    .map((slug) => legendBySlug.get(slug))
    .filter((g): g is GenreLegend => Boolean(g))
    .filter(inSelectedMains);

  const allVisible = [...available, ...selectedExtra];

  // Group by main bucket for clarity when several mains are selected
  const byMain = new Map<string, GenreLegend[]>();
  for (const g of allVisible) {
    const main =
      selectedMains.find((m) => genreBelongsToMains(g, [m])) ?? 'autre';
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
          'rounded-full border px-3 py-1.5 text-sm transition ' +
          (active
            ? 'border-culture-sage bg-culture-sage text-white shadow-sm'
            : 'border-culture-sand bg-white text-culture-ink hover:border-culture-sage/60')
        }
      >
        {g.label_fr}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          Genres
        </h2>
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
                <div className="flex flex-wrap gap-2">{items.map(renderChip)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allVisible
            .slice()
            .sort((a, b) => a.label_fr.localeCompare(b.label_fr, 'fr'))
            .map(renderChip)}
        </div>
      )}
    </div>
  );
}
