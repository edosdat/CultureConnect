'use client';

import {
  EXTRA_CATEGORY_CHIPS,
  HOME_CATEGORY_CHIPS,
  MAIN_CATEGORIES,
  type MainCategoryId,
} from '@/lib/categories';
import { MAIN_CAT_CSS_VAR } from '@/lib/categoryColor';

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
  /** Horizontal chips (home P0) vs stacked sidebar list */
  variant?: 'chips' | 'list' | 'home' | 'extra';
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
    const buttons = (
      <>
        {chips.map(({ id, label }) => {
          const active = selected.includes(id);
          const tint = `var(${MAIN_CAT_CSS_VAR[id]})`;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={active}
              data-cat-chip={id}
              className="cc-axes__chip shrink-0 whitespace-nowrap rounded-full transition"
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
            key="clear"
            type="button"
            onClick={() => onChange([])}
            className="cc-axes__chip shrink-0 rounded-full text-culture-terracotta hover:underline"
          >
            Tout effacer
          </button>
        )}
      </>
    );

    /* Home: no wrapper — parent `.cc-axes__group` wraps on mobile, scrolls on md+. */
    if (variant === 'home') return buttons;

    return (
      <div
        role="group"
        aria-label="Quoi"
        className="flex flex-nowrap gap-1.5"
      >
        {buttons}
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
          const tint = `var(${MAIN_CAT_CSS_VAR[id]})`;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={active}
              data-cat-chip={id}
              className="w-full rounded-xl px-3 py-2 text-left text-sm transition"
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
      </div>
    </div>
  );
}
