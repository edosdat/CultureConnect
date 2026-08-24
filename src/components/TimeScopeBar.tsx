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
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Période"
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ' +
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
      {scope === 'date' && datePanel}
    </div>
  );
}
