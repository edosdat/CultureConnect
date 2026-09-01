'use client';

import type { ReactNode } from 'react';

type Props = {
  id: string;
  title: string;
  count: number;
  shown: number;
  onSeeAll?: () => void;
  expanded?: boolean;
  /** Public: hide "N sorties". Admin debug keeps the number. */
  hideCount?: boolean;
  children: ReactNode;
  className?: string;
};

export default function HomeSection({
  id,
  title,
  count,
  shown,
  onSeeAll,
  expanded = false,
  hideCount = false,
  children,
  className = '',
}: Props) {
  const canSeeAll = Boolean(onSeeAll) && count > shown && !expanded;
  const showMeta = !hideCount || canSeeAll;
  return (
    <section id={id} className={'scroll-mt-16 space-y-3 ' + className}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-xl text-culture-ink sm:text-2xl">
          <span className="border-b-2 border-culture-terracotta pb-0.5">
            {title}
          </span>
        </h2>
        {showMeta ? (
          <div className="flex items-center gap-3 text-sm">
            {hideCount ? null : (
              <span className="text-culture-muted">
                <span className="font-medium text-culture-ink">{count}</span>
                {count <= 1 ? ' sortie' : ' sorties'}
              </span>
            )}
            {canSeeAll ? (
              <button
                type="button"
                onClick={onSeeAll}
                className="min-h-10 font-medium text-culture-terracotta hover:underline"
              >
                voir tout
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
