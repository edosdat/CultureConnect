import React, { type ReactNode } from 'react';
import {
  EXTRA_CATEGORY_CHIPS,
  HOME_CATEGORY_CHIPS,
  type MainCategoryId,
} from '../lib/categories';
import { homeBootFilterChrome } from '../lib/displayHome';

/** Same --cc-cat-* tokens as CategoryFilter chips. */
const CHIP_VAR: Record<MainCategoryId, string> = {
  musique: '--cc-cat-musique',
  theatre_danse: '--cc-cat-theatre',
  festival: '--cc-cat-festival',
  cinema: '--cc-cat-cinema',
  expo_patrimoine: '--cc-cat-expo',
  enfants_famille: '--cc-cat-famille',
};

type Props = {
  children?: ReactNode;
};

/**
 * Inert SSR replica of CultureConnectApp's default filter chrome.
 * Occupies the same vertical slots (search, examples, QUAND/QUOI, where/month)
 * so a streaming Top 3 fallback does not sit under the nav.
 */
export default function HomeFilterChromeShell({ children }: Props) {
  const chrome = homeBootFilterChrome();
  const quoiChips = [...HOME_CATEGORY_CHIPS, ...EXTRA_CATEGORY_CHIPS];

  return (
    <>
      <div
        inert
        aria-hidden
        data-home-filter-chrome="search"
        className="sticky top-0 z-20 -mx-4 mb-2 border-b border-culture-line/80 bg-culture-cream/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <div className="relative w-full">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-culture-muted"
          >
            ⌕
          </span>
          <div className="flex h-10 w-full items-center overflow-hidden rounded-full border border-culture-line bg-culture-surface py-0 pl-9 pr-10 text-sm shadow-sm">
            <span className="truncate text-culture-muted/70">
              {chrome.searchPlaceholder}
            </span>
          </div>
        </div>
      </div>

      <ul
        inert
        aria-hidden
        data-home-filter-chrome="examples"
        className="mb-2 mt-1.5 flex flex-wrap gap-1.5"
      >
        {chrome.exampleLabels.map((label) => (
          <li key={label}>
            <span className="inline-flex min-h-8 items-center rounded-full border border-culture-line bg-culture-surface px-2.5 py-1 text-[13px] leading-tight text-culture-muted sm:min-h-9 sm:px-3 sm:text-sm">
              {label}
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-2.5 sm:space-y-4">
        <div
          inert
          aria-hidden
          data-home-filter-chrome="quand-quoi"
          className="cc-axes-row"
        >
          <div className="cc-axes">
            <p className="cc-axes__label text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
              Quand
            </p>
            {chrome.dateChipLabels.map((label) => (
              <span
                key={label}
                className="cc-axes__chip shrink-0 whitespace-nowrap rounded-full border border-culture-line bg-culture-surface font-medium text-culture-ink"
              >
                {label}
              </span>
            ))}
            <span aria-hidden className="cc-axes__rule" />
            <p className="cc-axes__label text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
              Quoi
            </p>
            {quoiChips.map(({ id, label }) => {
              const tint = `var(${CHIP_VAR[id]})`;
              return (
                <span
                  key={id}
                  className="cc-axes__chip shrink-0 whitespace-nowrap rounded-full"
                  style={{
                    borderWidth: 1.5,
                    borderStyle: 'solid',
                    borderColor: tint,
                    backgroundColor: 'var(--cc-surface)',
                    color: 'var(--cc-ink)',
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
          <div className="cc-axes__more md:hidden">
            <span className="cc-axes__chip inline-flex items-center gap-1 rounded-full border border-culture-line bg-culture-surface font-medium text-culture-ink">
              {chrome.filtersLabel}
              <span className="text-culture-muted">▾</span>
            </span>
          </div>
        </div>

        <div
          inert
          aria-hidden
          data-home-filter-chrome="where-month"
          className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-0.5 sm:pt-1"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="shrink-0 rounded-full border border-culture-terracotta bg-culture-soft px-3 py-1.5 text-sm text-culture-clay shadow-sm">
              {chrome.commune}
            </span>
            <span className="rounded-full bg-culture-soft px-2.5 py-1 text-xs text-culture-clay">
              ×
            </span>
            <span className="shrink-0 rounded-full border border-culture-line bg-culture-surface px-3 py-1.5 text-sm font-medium text-culture-ink">
              {chrome.nearMe}
            </span>
            <span className="hidden shrink-0 rounded-full border border-culture-line bg-culture-surface px-3 py-1.5 text-sm text-culture-ink md:inline-flex">
              {chrome.sallesLabel} ▸
            </span>
          </div>
          <span className="text-sm font-medium text-culture-terracotta">
            {chrome.monthLink}
          </span>
        </div>

        {children}
      </div>
    </>
  );
}
