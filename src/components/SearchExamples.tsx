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
      className="mt-2 flex flex-wrap gap-2"
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
                'min-h-10 rounded-full border px-3 py-1.5 text-sm transition ' +
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
