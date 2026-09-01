'use client';

import {
  EXTRA_CATEGORY_CHIPS,
  HOME_CATEGORY_CHIPS,
  MAIN_CATEGORIES,
  type MainCategoryId,
} from '@/lib/categories';

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
  /** Horizontal chips (home P0) vs stacked sidebar list */
  variant?: 'chips' | 'list' | 'home' | 'extra';
};

/** Same --cc-cat-* hex as card bar / pastille. */
const CHIP_VAR: Record<MainCategoryId, string> = {
  musique: '--cc-cat-musique',
  theatre_danse: '--cc-cat-theatre',
  festival: '--cc-cat-festival',
  cinema: '--cc-cat-cinema',
  expo_patrimoine: '--cc-cat-expo',
  enfants_famille: '--cc-cat-famille',
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

  if (variant === 'chips' || variant === 'home' || variant === 'extra') {
    const chips =
      variant === 'home'
        ? [...HOME_CATEGORY_CHIPS, ...EXTRA_CATEGORY_CHIPS]
        : variant === 'extra'
          ? EXTRA_CATEGORY_CHIPS
          : MAIN_CATEGORIES;
    return (
      <div className="relative min-w-0 w-0 flex-1">
        <div
          role="group"
          aria-label="Quoi"
          className="flex min-w-0 flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain scroll-px-2 pe-3 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chips.map(({ id, label }) => {
            const active = selected.includes(id);
            const tint = `var(${CHIP_VAR[id]})`;
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={active}
                className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition"
                style={{
                  borderWidth: 1.5,
                  borderStyle: 'solid',
                  borderColor: tint,
                  backgroundColor: active ? tint : 'var(--cc-surface)',
                  color: active ? '#fff' : 'var(--cc-ink)',
                }}
              >
                {label}
              </button>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="shrink-0 rounded-full px-2.5 py-1.5 text-sm text-culture-terracotta hover:underline"
            >
              Tout effacer
            </button>
          )}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-culture-cream to-transparent sm:hidden"
        />
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
