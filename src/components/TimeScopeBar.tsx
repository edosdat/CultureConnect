'use client';

import {
  TIME_SCOPE_CHIPS,
  type TimeScopeId,
} from '@/lib/timeScope';

type Props = {
  /** `tous` / null = no chip pressed (tout à venir). */
  scope: TimeScopeId | null;
  onChange: (scope: TimeScopeId) => void;
};

export default function TimeScopeBar({ scope, onChange }: Props) {
  const none = scope == null || scope === 'tous';
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
        Quand
      </p>
      <div className="relative">
        <div
          role="group"
          aria-label="Période"
          className="flex snap-x snap-proximity gap-1.5 overflow-x-auto scroll-px-3 pe-4 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TIME_SCOPE_CHIPS.map(({ id, label }) => {
            const active = !none && scope === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onChange(active ? 'tous' : id);
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
