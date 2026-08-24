'use client';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export default function SearchOmnibox({
  value,
  onChange,
  placeholder = 'Titre, artiste, lieu, genre…',
}: Props) {
  return (
    <div className="relative w-full">
      <label htmlFor="cc-search" className="sr-only">
        Rechercher
      </label>
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-culture-muted"
      >
        ⌕
      </span>
      <input
        id="cc-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-full border border-culture-line bg-culture-surface py-2.5 pl-9 pr-10 text-sm text-culture-ink shadow-sm placeholder:text-culture-muted/70 focus:border-culture-terracotta focus:outline-none focus:ring-2 focus:ring-culture-terracotta/30"
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
