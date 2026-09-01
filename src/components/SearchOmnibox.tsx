'use client';

import { SEARCH_PLACEHOLDER } from '@/lib/displayHome';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export default function SearchOmnibox({
  value,
  onChange,
  placeholder = SEARCH_PLACEHOLDER,
}: Props) {
  return (
    <div className="relative w-full">
      <label htmlFor="cc-search" className="sr-only">
        {placeholder}
      </label>
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-culture-muted"
      >
        ⌕
      </span>
      <input
        id="cc-search"
        type="text"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className="h-10 w-full rounded-full border border-culture-line bg-culture-surface py-0 pl-9 pr-10 text-sm text-culture-ink shadow-sm placeholder:truncate placeholder:text-culture-muted/70 focus:border-culture-terracotta focus:outline-none focus:ring-2 focus:ring-culture-terracotta/30 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-culture-muted hover:text-culture-terracotta"
          aria-label="Effacer la recherche"
        >
          ×
        </button>
      )}
    </div>
  );
}
