'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { DayItem } from '@/lib/types';
import {
  MES_RECOS_CTA,
  MES_RECOS_SHEET_TITLE,
  mesRecosSubtitle,
  type MesRecosCopyState,
} from '@/lib/mesRecosWeek';
import SeanceCard from './SeanceCard';

type Props = {
  open: boolean;
  onClose: () => void;
  cards: DayItem[];
  copyState: MesRecosCopyState;
  /** False while semaine|profile pool is still in flight — sheet opens immediately with a light local loading state. */
  poolReady?: boolean;
  onSelectCard: (key: string) => void;
  onNotInterested: (item: DayItem) => void;
  notInterested: (item: DayItem) => boolean;
};

/**
 * Bottom/centered sheet « Mes recos de la semaine ».
 * × chrome = close (no negative signal). × on cards = Pas pour moi (P3).
 * Cards always stack in a single column (sm panel max-w-[440px] — never
 * a 3-up poster rail). Full-width default SeanceCard (not the home rail).
 * Opens immediately; poolReady=false shows a light local pulse until cards land.
 */
export default function MesRecosSheet({
  open,
  onClose,
  cards,
  copyState,
  poolReady = true,
  onSelectCard,
  onNotInterested,
  notInterested,
}: Props) {
  const titleId = useId();
  const ignoreCloseUntil = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) ignoreCloseUntil.current = performance.now() + 400;
  }, [open]);

  function closeUnlessOpeningClick() {
    if (performance.now() < ignoreCloseUntil.current) return;
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const subtitle = mesRecosSubtitle(copyState);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] h-dvh min-h-dvh"
      role="presentation"
      data-mes-recos-overlay="1"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer Mes recos de la semaine"
        className="absolute inset-0 bg-planc-nuit/45"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={closeUnlessOpeningClick}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-mes-recos-dialog="1"
        className={
          'absolute inset-x-0 bottom-0 flex max-h-[85dvh] w-full max-w-full min-w-0 flex-col bg-culture-surface shadow-xl ' +
          'rounded-t-3xl border border-culture-line pb-[env(safe-area-inset-bottom,0px)] ' +
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl'
        }
      >
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 px-4 pt-3">
          <p
            id={titleId}
            className="min-w-0 truncate font-display text-lg text-culture-ink"
          >
            {MES_RECOS_SHEET_TITLE}
          </p>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            data-mes-recos-chrome-close=""
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none text-culture-muted hover:bg-culture-cream hover:text-culture-ink"
          >
            ×
          </button>
        </div>
        <p className="shrink-0 px-4 pb-3 pt-1 text-sm text-culture-muted">
          {subtitle}
        </p>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-2">
          {!poolReady && cards.length === 0 ? (
            <ul
              className="grid grid-cols-1 gap-3"
              data-mes-recos-loading=""
              aria-busy="true"
              aria-live="polite"
            >
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="h-28 w-full min-w-0 animate-pulse rounded-card bg-culture-cream"
                />
              ))}
            </ul>
          ) : cards.length === 0 ? (
            <p className="py-6 text-sm text-culture-muted">{subtitle}</p>
          ) : (
            <ul
              className="grid grid-cols-1 gap-3"
              data-mes-recos-cards={cards.length}
            >
              {cards.map((item, i) => (
                <li key={item.key} className="min-w-0 w-full">
                  <SeanceCard
                    item={item}
                    showDate
                    onSelect={onSelectCard}
                    variant="default"
                    source="top3"
                    priority={i === 0}
                    onNotInterested={onNotInterested}
                    notInterested={notInterested(item)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="shrink-0 border-t border-culture-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            data-mes-recos-cta=""
            className="w-full rounded-full border border-culture-line bg-culture-cream px-4 py-2.5 text-sm font-semibold text-culture-ink hover:bg-culture-sand"
          >
            {MES_RECOS_CTA}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
