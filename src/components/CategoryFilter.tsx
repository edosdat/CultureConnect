'use client';

import {
  MAIN_CATEGORIES,
  type MainCategoryId,
} from '@/lib/categories';

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
};

export default function CategoryFilter({ selected, onChange }: Props) {
  function toggle(id: MainCategoryId) {
    if (selected.includes(id)) {
      onChange(selected.filter((c) => c !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          Catégories
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
      <div className="flex flex-wrap gap-2">
        {MAIN_CATEGORIES.map(({ id, label }) => {
          const active = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={active}
              className={
                'rounded-full border px-3 py-1.5 text-sm transition ' +
                (active
                  ? 'border-culture-terracotta bg-culture-terracotta text-white shadow-sm'
                  : 'border-culture-sand bg-white text-culture-ink hover:border-culture-terracotta/50')
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
