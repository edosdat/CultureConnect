'use client';

import { SEARCH_EXAMPLES } from '@/lib/displayHome';

type Props = {
  onPick: (query: string) => void;
  activeQuery?: string;
};

export default function SearchExamples({ onPick, activeQuery = '' }: Props) {
  const current = activeQuery.trim().toLocaleLowerCase('fr');
  return (
    <ul
      aria-label="Exemples de recherche"
      className="mb-2 mt-1.5 flex flex-wrap gap-1.5"
    >
      {SEARCH_EXAMPLES.map(({ label, query }) => {
        const on = current === query.toLocaleLowerCase('fr');
        return (
          <li key={query}>
            <button
              type="button"
              onClick={() => onPick(on ? '' : query)}
              aria-pressed={on}
              className={
                'min-h-8 rounded-full border px-2.5 py-1 text-[13px] leading-tight sm:min-h-9 sm:px-3 sm:text-sm ' +
                (on
                  ? 'border-culture-terracotta bg-culture-soft text-culture-ink'
                  : 'border-culture-line bg-culture-surface text-culture-muted hover:border-culture-terracotta/50 hover:text-culture-ink')
              }
            >
              {label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
