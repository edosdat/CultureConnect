'use client';

import {
  MAIN_CATEGORIES,
  type MainCategoryId,
} from '@/lib/categories';

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
  /** Horizontal chips (home P0) vs stacked sidebar list */
  variant?: 'chips' | 'list';
};

export default function CategoryFilter({
  selected,
  onChange,
  variant = 'chips',
}: Props) {
  function toggle(id: MainCategoryId) {
    // Single-select preferred on chips; click again clears. Multi still supported.
    if (selected.includes(id)) {
      onChange(selected.filter((c) => c !== id));
    } else if (variant === 'chips') {
      onChange([id]);
    } else {
      onChange([...selected, id]);
    }
  }

  if (variant === 'chips') {
    return (
      <div className="space-y-2">
        <div
          role="group"
          aria-label="Catégories"
          className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {MAIN_CATEGORIES.map(({ id, label }) => {
            const active = selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={active}
                className={
                  'shrink-0 rounded-full border px-3.5 py-2 text-sm transition ' +
                  (active
                    ? 'border-culture-terracotta bg-culture-soft text-culture-clay shadow-sm'
                    : 'border-culture-line bg-culture-surface text-culture-ink hover:border-culture-terracotta/50')
                }
              >
                {label}
              </button>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="shrink-0 rounded-full px-3 py-2 text-sm text-culture-terracotta hover:underline"
            >
              Tout effacer
            </button>
          )}
        </div>
      </div>
    );
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
      <div className="flex flex-col gap-1.5">
        {MAIN_CATEGORIES.map(({ id, label }) => {
          const active = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={active}
              className={
                'w-full rounded-xl border px-3 py-2 text-left text-sm transition ' +
                (active
                  ? 'border-culture-terracotta bg-culture-terracotta text-white shadow-sm'
                  : 'border-culture-line bg-culture-surface text-culture-ink hover:border-culture-terracotta/50')
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
