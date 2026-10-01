'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Lieu } from '@/lib/types';
import { formatLieuAffiche } from '@/lib/labels';
import { normalizeFr } from '@/lib/signals';
import {
  SALLE_ALL_LABEL,
  SALLE_CHIP_LABEL,
  VENUE_MENU_Z,
  placeVenueMenu,
  venueChipShown,
  type VenueMenuBox,
} from '@/lib/venueFilter';

type Props = {
  lieux: Lieu[];
  selectedLieuId: string | null;
  onChange: (lieuId: string | null) => void;
  /** Compact chip that opens a dropdown (home) vs stacked block */
  variant?: 'inline' | 'block';
  /**
   * Selected QUOI category ids — Salle stays hidden until at least one is set.
   */
  selectedMains?: string[];
  /** When true, hide entirely until a QUOI category is selected. */
  hideWhenNoCategory?: boolean;
  /** Category venue list still in flight (Ciné / Théâtre keep the chip). */
  loading?: boolean;
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
  selectedMains = [],
  hideWhenNoCategory = false,
  loading = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [box, setBox] = useState<VenueMenuBox | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mainsKey = selectedMains.join(',');

  useEffect(() => {
    setOpen(false);
  }, [mainsKey]);

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

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = buttonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBox(
        placeVenueMenu({
          rect: { top: r.top, bottom: r.bottom, left: r.left },
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
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

  if (hideWhenNoCategory) {
    if (
      !venueChipShown({
        selectedMains,
        venueCount: lieux.length,
        loading,
      })
    ) {
      return null;
    }
  } else if (lieux.length === 0 && !selectedLieuId && !loading) {
    return null;
  }

  const selectedLabel = selected ? formatLieuAffiche(selected) : '';

  const pick = (id: string | null) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  const menuEl =
    open && box ? (
      <div
        ref={menuRef}
        id="cc-venue"
        style={{
          position: 'fixed',
          top: box.top ?? undefined,
          bottom: box.bottom ?? undefined,
          left: box.left,
          width: box.width,
          zIndex: VENUE_MENU_Z,
          maxHeight: box.maxHeight,
        }}
        className="flex flex-col overflow-hidden rounded-xl border border-culture-line bg-culture-surface shadow-card"
      >
        <div className="shrink-0 border-b border-culture-line p-2">
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
          aria-label={SALLE_CHIP_LABEL}
          className="min-h-0 flex-1 overflow-y-auto py-1"
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
                {SALLE_ALL_LABEL}
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
          {loading && filtered.length === 0 && (
            <li className="px-3 py-3 text-sm text-culture-ink/50">
              Chargement…
            </li>
          )}
          {!loading && filtered.length === 0 && (
            <li className="px-3 py-3 text-sm text-culture-ink/50">
              Aucune salle
            </li>
          )}
        </ul>
      </div>
    ) : null;

  const menu =
    menuEl && typeof document !== 'undefined'
      ? createPortal(menuEl, document.body)
      : null;

  const triggerClass =
    (variant === 'inline'
      ? 'cc-axes__chip inline-flex max-w-[11rem] items-center gap-1 rounded-full border text-left transition '
      : 'flex min-h-11 w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm shadow-sm transition ') +
    (selectedLieuId || open
      ? 'border-culture-terracotta bg-culture-soft text-culture-clay shadow-sm'
      : 'border-culture-line bg-culture-surface text-culture-ink hover:border-culture-terracotta/50');

  if (variant === 'inline') {
    return (
      <div
        ref={rootRef}
        data-salle-slot=""
        className="relative inline-flex min-w-0 shrink-0 items-center gap-1"
      >
        <button
          ref={buttonRef}
          type="button"
          data-salle-chip=""
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls="cc-venue"
          className={triggerClass}
        >
          <span className="min-w-0 truncate">
            {selected ? selectedLabel : SALLE_CHIP_LABEL}
          </span>
          <span aria-hidden className="shrink-0 text-culture-muted">
            {open ? '▴' : '▾'}
          </span>
        </button>
        {selected && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="rounded-full bg-culture-soft px-2.5 py-1 text-xs text-culture-clay"
            aria-label="Effacer le filtre salle"
          >
            ×
          </button>
        )}
        {menu}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          {SALLE_CHIP_LABEL}
        </h2>
        {selectedLieuId && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="text-xs text-culture-terracotta hover:underline"
          >
            {SALLE_ALL_LABEL}
          </button>
        )}
      </div>
      <button
        ref={buttonRef}
        type="button"
        data-salle-chip=""
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="cc-venue"
        className={triggerClass}
        aria-label="Filtrer par salle"
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? selectedLabel : SALLE_ALL_LABEL}
        </span>
        <span aria-hidden className="ml-2 shrink-0 text-culture-ink/50">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {menu}
    </div>
  );
}
