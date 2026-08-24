'use client';

import { useEffect, useState } from 'react';

type Props = {
  communes: string[];
  selectedCommune: string | null;
  onChange: (commune: string | null) => void;
  /** Compact chip that expands select (home P0) vs stacked block */
  variant?: 'inline' | 'block';
};

export default function CityFilter({
  communes,
  selectedCommune,
  onChange,
  variant = 'inline',
}: Props) {
  const [open, setOpen] = useState(false);

  // Keep select visible after a pick so the user can switch easily; collapse when cleared.
  useEffect(() => {
    if (!selectedCommune) setOpen(false);
  }, [selectedCommune]);

  if (communes.length === 0 && !selectedCommune) return null;

  const selectedLabel = selectedCommune ?? '';

  if (variant === 'inline') {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="cc-city"
          className={
            'shrink-0 rounded-full border px-3 py-1.5 text-sm transition ' +
            (selectedCommune || open
              ? 'border-culture-terracotta bg-culture-soft text-culture-clay shadow-sm'
              : 'border-culture-line bg-culture-surface text-culture-ink hover:border-culture-terracotta/50')
          }
        >
          {selectedCommune ? selectedLabel : 'Ville'}
          {selectedCommune ? '' : open ? ' ▾' : ' ▸'}
        </button>
        {selectedCommune && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="rounded-full bg-culture-soft px-2.5 py-1 text-xs text-culture-clay"
            aria-label="Effacer le filtre ville"
          >
            ×
          </button>
        )}
        {open && (
          <select
            id="cc-city"
            value={selectedCommune ?? ''}
            onChange={(e) => {
              const v = e.target.value || null;
              onChange(v);
              if (!v) setOpen(false);
            }}
            className="max-w-full min-w-[10rem] flex-1 rounded-full border border-culture-line bg-culture-surface px-3 py-1.5 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta sm:max-w-xs"
            aria-label="Filtrer par ville"
          >
            <option value="">Toute l'agglo</option>
            {communes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          Ville
        </h2>
        {selectedCommune && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-culture-terracotta hover:underline"
          >
            Toute l'agglo
          </button>
        )}
      </div>
      <select
        value={selectedCommune ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-xl border border-culture-line bg-culture-surface px-3 py-2 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta"
        aria-label="Filtrer par ville"
      >
        <option value="">Toute l'agglo</option>
        {communes.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
