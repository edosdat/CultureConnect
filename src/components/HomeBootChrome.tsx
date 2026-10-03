import type { ReactNode } from 'react';
import {
  EXTRA_CATEGORY_CHIPS,
  HOME_CATEGORY_CHIPS,
} from '@/lib/categories';
import { MAIN_CAT_CSS_VAR } from '@/lib/categoryColor';
import { HOME_CHROME_STACK_CLASS, SEARCH_PLACEHOLDER } from '@/lib/displayHome';
import { NEAR_ME_CHIP_LABEL, TOULOUSE_CHIP_DEFAULT } from '@/lib/nearMe';
import { TIME_SCOPE_CHIPS } from '@/lib/timeScope';
import { HomeListWaitSlot } from './ListWaitDots';

/**
 * Inert first-paint chrome above Top 3. Mirrors CultureConnectApp so the
 * streaming Suspense fallback does not leave [data-top3] too high.
 *
 * Reserved at ~380px (Design LAYOUT_JUMP):
 * - sticky search: h-10 + py-1.5 + border-b + mb-2 (~61px); ↵ always visible
 * - no SEARCH_EXAMPLES (retired)
 * - .cc-filter-band: Ville + Près de moi on one nowrap line, then QUAND → QUOI
 *   each as one scroll row (›). No Filtres and no Salle (no category yet).
 *   Gap 6px, no empty row.
 * - HomeListWaitSlot: overlay (no flow well; dots are 12px)
 *
 * SiteNav is already in the root layout. Genre chips sit in Filtres
 * after a QUOI category. There is no Salle chip.
 * Chips / wait slot are siblings of [data-top3].
 */
export default function HomeBootChrome({ children }: { children: ReactNode }) {
  const homeCats = [...HOME_CATEGORY_CHIPS, ...EXTRA_CATEGORY_CHIPS];

  return (
    <>
      <div inert aria-hidden data-home-boot-chrome="">
        <div className="sticky top-[var(--a2hs-bar-h)] z-20 -mx-4 mb-2 border-b border-culture-line/80 bg-culture-cream/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="relative w-full" role="search">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-culture-muted">
              ⌕
            </span>
            <input
              readOnly
              tabIndex={-1}
              placeholder={SEARCH_PLACEHOLDER}
              aria-label={SEARCH_PLACEHOLDER}
              className="h-10 w-full rounded-full border border-culture-line bg-culture-surface py-0 pl-9 pr-11 text-sm text-culture-ink shadow-sm placeholder:truncate placeholder:text-culture-muted/70"
            />
            <div className="absolute inset-y-0 right-1 flex items-center">
              <span className="grid h-8 w-8 place-items-center rounded-full text-base font-medium leading-none text-culture-terracotta">
                ↵
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className={HOME_CHROME_STACK_CLASS}>
        <div inert aria-hidden className="cc-filter-band">
          <div className="cc-filter-band__place">
            <span className="inline-flex items-center gap-1.5">
              <span className="cc-axes__chip shrink-0 whitespace-nowrap rounded-full border border-culture-terracotta bg-culture-soft font-medium text-culture-clay shadow-sm">
                {TOULOUSE_CHIP_DEFAULT}
              </span>
              <span className="rounded-full bg-culture-soft px-2.5 py-1 text-xs text-culture-clay">
                ×
              </span>
            </span>
            <span className="cc-axes__chip shrink-0 whitespace-nowrap rounded-full border border-culture-line bg-culture-surface font-medium text-culture-ink">
              {NEAR_ME_CHIP_LABEL}
            </span>
          </div>
          <div className="cc-axes-row">
            <div className="cc-axes">
              <div className="cc-scroll-shell">
                <div className="cc-axes__group cc-axes__group--scroll">
                  <p className="cc-axes__label max-md:sr-only text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
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
                </div>
              </div>
              <span className="cc-axes__rule" />
              <div className="cc-scroll-shell">
                <div className="cc-axes__group cc-axes__group--scroll">
                  <p className="cc-axes__label max-md:sr-only text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
                    Quoi
                  </p>
                  {homeCats.map(({ id, label }) => {
                    const tint = `var(${MAIN_CAT_CSS_VAR[id]})`;
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
              </div>
            </div>
          </div>
        </div>
        <div className="relative">
          <HomeListWaitSlot />
          {children}
        </div>
      </div>
    </>
  );
}
