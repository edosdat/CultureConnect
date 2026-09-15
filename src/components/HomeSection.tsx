'use client';

import type { ReactNode } from 'react';
import {
  HOME_SECTION_TITLE_ACCENT_VAR,
  HOME_SECTION_TITLE_CLASS,
  HOME_SECTION_TITLE_RULE_CLASS,
  homeSectionAccentStyle,
} from '@/lib/displayHome';

type Props = {
  id: string;
  title: string;
  count: number;
  shown: number;
  onSeeAll?: () => void;
  expanded?: boolean;
  /** Public: hide "N sorties". Admin debug keeps the number. */
  hideCount?: boolean;
  /** S8 `--cat-*` token for the H2 underline (pack rail title). */
  accentVar?: string;
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
  accentVar = HOME_SECTION_TITLE_ACCENT_VAR,
  children,
  className = '',
}: Props) {
  const canSeeAll = Boolean(onSeeAll) && count > shown && !expanded;
  const showMeta = !hideCount || canSeeAll;
  return (
    <section id={id} className={'scroll-mt-16 space-y-3 ' + className}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className={HOME_SECTION_TITLE_CLASS}>
          <span
            className={HOME_SECTION_TITLE_RULE_CLASS}
            style={homeSectionAccentStyle(accentVar)}
            data-cat-h2={accentVar}
          >
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
