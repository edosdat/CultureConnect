'use client';

import type { Lieu } from '@/lib/types';

type Props = {
  lieux: Lieu[];
  selectedLieuId: string | null;
  onChange: (lieuId: string | null) => void;
  /** Compact inline chip + select (home P0) */
  variant?: 'inline' | 'block';
};

export default function VenueFilter({
  lieux,
  selectedLieuId,
  onChange,
  variant = 'inline',
}: Props) {
  if (lieux.length === 0 && !selectedLieuId) return null;

  const selected = lieux.find((l) => l.lieu_id === selectedLieuId);

  if (variant === 'inline') {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor="cc-venue" className="text-sm text-culture-muted">
          Lieu
        </label>
        <select
          id="cc-venue"
          value={selectedLieuId ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="max-w-full rounded-full border border-culture-line bg-culture-surface px-3 py-1.5 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta"
          aria-label="Filtrer par lieu"
        >
          <option value="">Tous les lieux</option>
          {lieux.map((l) => (
            <option key={l.lieu_id} value={l.lieu_id}>
              {l.nom}
              {l.commune ? ` · ${l.commune}` : ''}
            </option>
          ))}
        </select>
        {selected && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-full bg-culture-soft px-2.5 py-1 text-xs text-culture-clay"
          >
            {selected.nom} ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          Lieux
        </h2>
        {selectedLieuId && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-culture-terracotta hover:underline"
          >
            Tous
          </button>
        )}
      </div>
      <select
        value={selectedLieuId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-xl border border-culture-line bg-culture-surface px-3 py-2 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta"
        aria-label="Filtrer par lieu"
      >
        <option value="">Tous les lieux</option>
        {lieux.map((l) => (
          <option key={l.lieu_id} value={l.lieu_id}>
            {l.nom}
            {l.commune ? ` · ${l.commune}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
