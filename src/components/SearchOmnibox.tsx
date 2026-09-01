'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { SEARCH_PLACEHOLDER } from '@/lib/displayHome';

type Props = {
  value: string;
  /** Draft text only — never parse / apply chips. */
  onChange: (value: string) => void;
  /** Enter or mobile Search key only. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
};

function isSearchCommitKey(e: KeyboardEvent<HTMLInputElement>): boolean {
  return e.key === 'Enter' && !e.repeat && !e.nativeEvent.isComposing;
}

export default function SearchOmnibox({
  value,
  onChange,
  onSubmit,
  placeholder = SEARCH_PLACEHOLDER,
}: Props) {
  function commit() {
    onSubmit?.(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isSearchCommitKey(e)) return;
    e.preventDefault();
    commit();
  }

  function onFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    commit();
  }

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={onFormSubmit}
    >
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
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        className="h-10 w-full rounded-full border border-culture-line bg-culture-surface py-0 pl-9 pr-10 text-sm text-culture-ink shadow-sm placeholder:truncate placeholder:text-culture-muted/70 focus:border-culture-terracotta focus:outline-none focus:ring-2 focus:ring-culture-terracotta/30"
      />
      {value ? (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-culture-muted hover:text-culture-terracotta"
          aria-label="Effacer la recherche"
        >
          ×
        </button>
      ) : null}
    </form>
  );
}
