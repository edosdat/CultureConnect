'use client';

import type { ReactNode } from 'react';

import {
  TIME_SCOPE_CHIPS,
  type TimeScopeId,
} from '@/lib/timeScope';

type Props = {
  scope: TimeScopeId;
  onChange: (scope: TimeScopeId) => void;
  /** When scope is 'date', show compact calendar below */
  datePanel?: ReactNode;
};

export default function TimeScopeBar({ scope, onChange, datePanel }: Props) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          role="group"
          aria-label="Période"
          className="flex snap-x snap-proximity gap-1.5 overflow-x-auto scroll-px-3 pe-4 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TIME_SCOPE_CHIPS.map(({ id, label }) => {
            const active = scope === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
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
        {/* Mobile: hint that chips scroll horizontally; hide once desktop fits */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-culture-cream to-transparent sm:hidden"
        />
      </div>
      {scope === 'date' && datePanel}
    </div>
  );
}
