'use client';

import {
  TIME_SCOPE_CHIPS,
  type TimeScopeId,
} from '@/lib/timeScope';

type Props = {
  /** `tous` / null = no chip pressed (tout à venir). */
  scope: TimeScopeId | null;
  onChange: (scope: TimeScopeId) => void;
  /** Chip track only — parent owns the QUAND label (shared filter row). */
  hideLabel?: boolean;
};

export default function TimeScopeBar({
  scope,
  onChange,
  hideLabel = false,
}: Props) {
  const none = scope == null || scope === 'tous';
  const track = (
    <div className="relative min-w-0 flex-1">
      <div
        role="group"
        aria-label="Période"
        className="flex flex-nowrap snap-x snap-proximity gap-1.5 overflow-x-auto overscroll-x-contain scroll-px-3 pe-4 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                'snap-start shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ' +
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
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-culture-cream to-transparent sm:hidden"
      />
    </div>
  );

  if (hideLabel) return track;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
        Quand
      </p>
      {track}
    </div>
  );
}
