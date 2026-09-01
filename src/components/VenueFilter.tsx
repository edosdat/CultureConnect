'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lieu } from '@/lib/types';
import { formatLieuAffiche } from '@/lib/labels';
import { normalizeFr } from '@/lib/signals';

type Props = {
  lieux: Lieu[];
  selectedLieuId: string | null;
  onChange: (lieuId: string | null) => void;
  /** Compact chip that expands select (home P0) vs stacked block */
  variant?: 'inline' | 'block';
};

function lieuMatches(lieu: Lieu, qNorm: string): boolean {
  if (!qNorm) return true;
  const blob = normalizeFr(
    [formatLieuAffiche(lieu), lieu.nom, lieu.commune].filter(Boolean).join(' '),
  );
  return blob.includes(qNorm);
}

export default function VenueFilter({
  lieux,
  selectedLieuId,
  onChange,
  variant = 'inline',
}: Props) {
  const [open, setOpen] = useState(Boolean(selectedLieuId));
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedLieuId) setOpen(true);
  }, [selectedLieuId]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const qNorm = normalizeFr(query);
  const selectedFromList = useMemo(
    () => lieux.find((l) => l.lieu_id === selectedLieuId) ?? null,
    [lieux, selectedLieuId],
  );
  const [heldSelected, setHeldSelected] = useState<Lieu | null>(null);
  useEffect(() => {
    if (selectedFromList) setHeldSelected(selectedFromList);
    else if (!selectedLieuId) setHeldSelected(null);
  }, [selectedFromList, selectedLieuId]);
  const selected =
    selectedFromList ??
    (selectedLieuId && heldSelected?.lieu_id === selectedLieuId
      ? heldSelected
      : null);

  const filtered = useMemo(() => {
    const base = qNorm ? lieux.filter((l) => lieuMatches(l, qNorm)) : lieux;
    if (
      selected &&
      !base.some((l) => l.lieu_id === selected.lieu_id) &&
      (!qNorm || lieuMatches(selected, qNorm))
    ) {
      return [selected, ...base];
    }
    return base;
  }, [lieux, qNorm, selected]);

  if (lieux.length === 0 && !selectedLieuId) return null;

  const selectedLabel = selected ? formatLieuAffiche(selected) : '';

  const pick = (id: string | null) => {
    onChange(id);
    setQuery('');
    if (!id && variant === 'inline') setOpen(false);
  };

  const panel = (
    <div
      id="cc-venue"
      className="overflow-hidden rounded-xl border border-culture-line bg-culture-surface shadow-card"
    >
      <div className="border-b border-culture-line p-2">
        <p className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-culture-muted">
          Salles
        </p>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une salle"
          aria-label="Rechercher une salle"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          className="h-11 w-full rounded-lg border border-culture-line bg-culture-surface px-3 text-base text-culture-ink shadow-sm placeholder:text-culture-ink/40 focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta sm:h-10 sm:text-sm"
        />
      </div>
      <ul
        role="listbox"
        aria-label="Filtrer par salle"
        className="max-h-60 overflow-y-auto py-1"
      >
        {!qNorm && (
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!selectedLieuId}
              onClick={() => pick(null)}
              className={
                'flex min-h-11 w-full items-center px-3 text-left text-sm ' +
                (!selectedLieuId
                  ? 'bg-culture-soft text-culture-ink'
                  : 'text-culture-ink hover:bg-culture-soft')
              }
            >
              Toutes les salles
            </button>
          </li>
        )}
        {filtered.map((l) => {
          const active = l.lieu_id === selectedLieuId;
          return (
            <li key={l.lieu_id}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(l.lieu_id)}
                className={
                  'flex min-h-11 w-full items-center px-3 text-left text-sm ' +
                  (active
                    ? 'bg-culture-soft text-culture-ink'
                    : 'text-culture-ink hover:bg-culture-soft')
                }
              >
                {formatLieuAffiche(l)}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-3 text-sm text-culture-ink/50">Aucune salle</li>
        )}
      </ul>
    </div>
  );

  if (variant === 'inline') {
    return (
      <div
        ref={rootRef}
        className="relative flex min-w-0 flex-wrap items-center gap-2"
      >
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
          {selected ? selectedLabel : 'Salles'}
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
            aria-label="Effacer le filtre salles"
          >
            ×
          </button>
        )}
        {open && (
          <div className="basis-full w-full sm:absolute sm:left-0 sm:top-full sm:z-30 sm:mt-1 sm:w-80 sm:basis-auto">
            {panel}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          Salles
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="cc-venue"
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-culture-line bg-culture-surface px-3 py-2 text-left text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta"
        aria-label="Filtrer par salle"
      >
        <span className="min-w-0 truncate">
          {selected ? selectedLabel : 'Toutes les salles'}
        </span>
        <span aria-hidden className="ml-2 shrink-0 text-culture-ink/50">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && <div className="z-30">{panel}</div>}
    </div>
  );
}
