import type { ReactNode } from 'react';
import {
  EXTRA_CATEGORY_CHIPS,
  HOME_CATEGORY_CHIPS,
  type MainCategoryId,
} from '@/lib/categories';
import { SEARCH_EXAMPLES, SEARCH_PLACEHOLDER } from '@/lib/displayHome';
import { MONTH_NAMES_FR } from '@/lib/labels';
import { NEAR_ME_CHIP_LABEL, TOULOUSE_CHIP_DEFAULT } from '@/lib/nearMe';
import { parisParts, TIME_SCOPE_CHIPS } from '@/lib/timeScope';
import { HomeListWaitSlot } from './ListWaitDots';

/** Same --cc-cat-* hex as CategoryFilter home chips. */
const CHIP_VAR: Record<MainCategoryId, string> = {
  musique: '--cc-cat-musique',
  theatre_danse: '--cc-cat-theatre',
  festival: '--cc-cat-festival',
  cinema: '--cc-cat-cinema',
  expo_patrimoine: '--cc-cat-expo',
  enfants_famille: '--cc-cat-famille',
};

function homeBootMonthLabel(now = new Date()): string {
  const { year, month } = parisParts(now);
  return `${MONTH_NAMES_FR[month - 1]} ${year}`;
}

/**
 * Inert first-paint chrome above Top 3. Mirrors CultureConnectApp so the
 * streaming Suspense fallback does not leave [data-top3] too high.
 *
 * Reserved at ~380px (Design LAYOUT_JUMP):
 * - sticky search: h-10 + py-1.5 + border-b + mb-2 (~61px)
 * - SEARCH_EXAMPLES: 3 chips, wrap, min-h-8 + mt-1.5 + mb-2 (~2 rows)
 * - .cc-axes QUAND/QUOI + Filtres: nowrap overflow-x (~24px)
 * - Toulouse + Près de moi + Voir le mois (Paris month; wraps)
 * - HomeListWaitSlot: 32px (list-wait dots + stack gap)
 *
 * SiteNav is already in the root layout. GenreFilter is null without QUOI.
 * Chips / city / wait slot are siblings of [data-top3] (same as live).
 */
export default function HomeBootChrome({ children }: { children: ReactNode }) {
  const monthLabel = homeBootMonthLabel();
  const homeCats = [...HOME_CATEGORY_CHIPS, ...EXTRA_CATEGORY_CHIPS];

  return (
    <>
      <div inert aria-hidden data-home-boot-chrome="">
        <div className="sticky top-0 z-20 -mx-4 mb-2 border-b border-culture-line/80 bg-culture-cream/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="relative w-full" role="search">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-culture-muted">
              ⌕
            </span>
            <input
              readOnly
              tabIndex={-1}
              placeholder={SEARCH_PLACEHOLDER}
              aria-label={SEARCH_PLACEHOLDER}
              className="h-10 w-full rounded-full border border-culture-line bg-culture-surface py-0 pl-9 pr-10 text-sm text-culture-ink shadow-sm placeholder:truncate placeholder:text-culture-muted/70"
            />
          </div>
        </div>
        <ul className="mb-2 mt-1.5 flex flex-wrap gap-1.5">
          {SEARCH_EXAMPLES.map(({ label }) => (
            <li key={label}>
              <span className="inline-flex min-h-8 items-center rounded-full border border-culture-line bg-culture-surface px-2.5 py-1 text-[13px] leading-tight text-culture-muted sm:min-h-9 sm:px-3 sm:text-sm">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-2.5 sm:space-y-4">
        <div inert aria-hidden className="cc-axes-row">
          <div className="cc-axes">
            <p className="cc-axes__label text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
              Quand
            </p>
            {TIME_SCOPE_CHIPS.map(({ id, label }) => (
              <span
                key={id}
                className="cc-axes__chip shrink-0 whitespace-nowrap rounded-full border border-culture-line bg-culture-surface font-medium text-culture-ink"
              >
                {label}
              </span>
            ))}
            <span className="cc-axes__rule" />
            <p className="cc-axes__label text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
              Quoi
            </p>
            {homeCats.map(({ id, label }) => {
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
              Filtres
              <span className="text-culture-muted">▾</span>
            </span>
          </div>
        </div>
        <div
          inert
          aria-hidden
          className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-0.5 sm:pt-1"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="shrink-0 rounded-full border border-culture-terracotta bg-culture-soft px-3 py-1.5 text-sm text-culture-clay shadow-sm">
              {TOULOUSE_CHIP_DEFAULT}
            </span>
            <span className="shrink-0 rounded-full border border-culture-line bg-culture-surface px-3 py-1.5 text-sm font-medium text-culture-ink">
              {NEAR_ME_CHIP_LABEL}
            </span>
          </div>
          <span className="text-sm font-medium text-culture-terracotta">
            Voir le mois ({monthLabel})
          </span>
        </div>
        <HomeListWaitSlot />
        {children}
      </div>
    </>
  );
}
