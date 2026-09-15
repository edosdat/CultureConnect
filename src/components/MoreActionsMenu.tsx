'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DayItem } from '@/lib/types';
import {
  calendarPayloadFromDayItem,
  downloadIcs,
  googleCalendarUrl,
} from '@/lib/calendar';
import { rawUrls, reservePickOf } from '@/lib/reserve';
import { isLikelyMobile } from '@/lib/displayHome';
import { favoriteToggleKind } from '@/lib/signals';
import { useFavorites } from './FavoritesProvider';
import { useSignals } from './SignalsProvider';

type Props = {
  item: DayItem;
  onAgenda?: (item: DayItem) => void;
  onIcs?: (item: DayItem) => void;
};

function webcalHref(itemKey: string): string {
  if (typeof window === 'undefined') return '';
  const host = window.location.host;
  const path = `/api/calendar/${encodeURIComponent(itemKey)}`;
  if (window.location.protocol === 'https:') return `webcal://${host}${path}`;
  return `${window.location.origin}${path}`;
}

function sourceUrlOf(item: DayItem): string {
  const { page } = rawUrls(item);
  const reserve = reservePickOf(item).url;
  if (!page || page === reserve) return '';
  return page;
}

const rowClass =
  'block w-full px-4 py-3 text-left text-sm font-medium text-culture-ink hover:bg-culture-sand';

export default function MoreActionsMenu({ item, onAgenda, onIcs }: Props) {
  const [open, setOpen] = useState(false);
  const [mobileCal, setMobileCal] = useState(false);
  const { has, toggle } = useFavorites();
  const { trackItem } = useSignals();
  const on = has(item.key);
  const cal = calendarPayloadFromDayItem(item);
  const source = sourceUrlOf(item);

  useEffect(() => {
    setMobileCal(isLikelyMobile());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const sheet =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[120] h-dvh min-h-dvh" role="presentation">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Fermer plus d’actions"
              className="absolute inset-0 bg-culture-ink/25"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Plus d’actions"
              data-testid="event-more-sheet"
              className="absolute inset-x-0 bottom-0 w-full rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_28px_rgba(0,0,0,.18)] sm:inset-x-auto sm:left-1/2 sm:max-w-[420px] sm:-translate-x-1/2"
            >
              <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-culture-line" />
              <div className="py-2">
                <button
                  type="button"
                  data-testid="event-more-favori"
                  onClick={() => {
                    trackItem(item, favoriteToggleKind(on));
                    toggle(item.key);
                    setOpen(false);
                  }}
                  className={rowClass}
                >
                  {on ? 'Retirer des favoris' : 'Ajouter à mes goûts / favori'}
                </button>
                {cal ? (
                  <a
                    href={googleCalendarUrl(cal)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="event-more-agenda"
                    onClick={() => {
                      onAgenda?.(item);
                      setOpen(false);
                    }}
                    className={rowClass}
                  >
                    Google Agenda
                  </a>
                ) : null}
                {cal ? (
                  mobileCal ? (
                    <a
                      href={webcalHref(item.key)}
                      data-testid="event-more-ics"
                      onClick={() => {
                        onIcs?.(item);
                        setOpen(false);
                      }}
                      className={rowClass}
                    >
                      Télécharger .ics
                    </a>
                  ) : (
                    <button
                      type="button"
                      data-testid="event-more-ics"
                      onClick={() => {
                        onIcs?.(item);
                        downloadIcs(cal);
                        setOpen(false);
                      }}
                      className={rowClass}
                    >
                      Télécharger .ics
                    </button>
                  )
                ) : null}
                {source ? (
                  <a
                    href={source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={rowClass}
                    onClick={() => setOpen(false)}
                  >
                    Voir la source
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-1 block w-full px-4 py-3 text-center text-sm text-culture-muted"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        data-testid="event-more"
        aria-label="Plus"
        onClick={() => setOpen(true)}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-culture-line bg-white text-xl font-bold leading-none text-culture-muted hover:bg-culture-sand hover:text-culture-ink"
      >
        ⋯
      </button>
      {sheet}
    </>
  );
}
