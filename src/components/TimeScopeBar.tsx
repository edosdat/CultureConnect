'use client';

import {
  TIME_SCOPE_CHIPS,
  type TimeScopeId,
} from '@/lib/timeScope';

type Props = {
  /** null = no chip pressed (search mode: all upcoming dates). */
  scope: TimeScopeId | null;
  onChange: (scope: TimeScopeId) => void;
};

export default function TimeScopeBar({ scope, onChange }: Props) {
  const inactive = scope == null;
  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          role="group"
          aria-label="Période"
          aria-disabled={inactive}
          className={
            'flex snap-x snap-proximity gap-1.5 overflow-x-auto scroll-px-3 pe-4 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' +
            (inactive ? ' opacity-40' : '')
          }
        >
          {TIME_SCOPE_CHIPS.map(({ id, label }) => {
            const active = !inactive && scope === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (inactive) return;
                  onChange(id);
                }}
                aria-pressed={active}
                className={
                  'snap-start shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ' +
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
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-culture-cream to-transparent sm:hidden"
        />
      </div>
    </div>
  );
}
