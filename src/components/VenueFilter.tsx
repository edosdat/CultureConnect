'use client';

import { useEffect, useState } from 'react';
import type { Lieu } from '@/lib/types';
import { formatLieuAffiche } from '@/lib/labels';

type Props = {
  lieux: Lieu[];
  selectedLieuId: string | null;
  onChange: (lieuId: string | null) => void;
  /** Compact chip that expands select (home P0) vs stacked block */
  variant?: 'inline' | 'block';
};

export default function VenueFilter({
  lieux,
  selectedLieuId,
  onChange,
  variant = 'inline',
}: Props) {
  const [open, setOpen] = useState(Boolean(selectedLieuId));

  useEffect(() => {
    if (selectedLieuId) setOpen(true);
  }, [selectedLieuId]);

  if (lieux.length === 0 && !selectedLieuId) return null;

  const selected = lieux.find((l) => l.lieu_id === selectedLieuId);
  const selectedLabel = selected ? formatLieuAffiche(selected) : '';

  if (variant === 'inline') {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="cc-venue"
          className={
            'shrink-0 rounded-full border px-3 py-1.5 text-sm transition ' +
            (selectedLieuId || open
              ? 'border-culture-terracotta bg-culture-soft text-culture-clay shadow-sm'
              : 'border-culture-line bg-culture-surface text-culture-ink hover:border-culture-terracotta/50')
          }
        >
          {selected ? selectedLabel : 'Lieu'}
          {selected ? '' : open ? ' ▾' : ' ▸'}
        </button>
        {selected && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="rounded-full bg-culture-soft px-2.5 py-1 text-xs text-culture-clay"
            aria-label="Effacer le filtre lieu"
          >
            ×
          </button>
        )}
        {open && (
          <select
            id="cc-venue"
            value={selectedLieuId ?? ''}
            onChange={(e) => {
              const v = e.target.value || null;
              onChange(v);
              if (!v) setOpen(false);
            }}
            className="max-w-full min-w-[12rem] flex-1 rounded-full border border-culture-line bg-culture-surface px-3 py-1.5 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta sm:max-w-xs"
            aria-label="Filtrer par lieu"
          >
            <option value="">Tous les lieux</option>
            {lieux.map((l) => (
              <option key={l.lieu_id} value={l.lieu_id}>
                {formatLieuAffiche(l)}
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
            {formatLieuAffiche(l)}
          </option>
        ))}
      </select>
    </div>
  );
}
