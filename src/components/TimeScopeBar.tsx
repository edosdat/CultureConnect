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
    <div className="cc-axes__track">
      <div
        role="group"
        aria-label="Quand"
        className="cc-axes__chips"
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
                'cc-axes__chip shrink-0 whitespace-nowrap rounded-full border font-medium transition ' +
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
