'use client';

import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
};

/** Desktop: right slide-in. Mobile: bottom sheet. Backdrop closes without clearing filters. */
export default function MonthCalendarDrawer({
  open,
  onClose,
  children,
  title = 'Calendrier',
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <button
        type="button"
        aria-label="Fermer le calendrier"
        className="absolute inset-0 bg-culture-ink/20 transition-opacity duration-200 ease-out"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          'absolute flex flex-col bg-culture-cream shadow-xl transition-transform duration-200 ease-out ' +
          /* mobile bottom sheet */
          'inset-x-0 bottom-0 max-h-[70vh] rounded-t-3xl border border-culture-sand ' +
          /* desktop right drawer */
          'md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[min(100%,24rem)] md:rounded-none md:border-y-0 md:border-l md:border-r-0'
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-culture-line px-4 py-3">
          <div className="min-w-0">
            <div
              aria-hidden
              className="mx-auto mb-2 h-1 w-10 rounded-full bg-culture-line md:hidden"
            />
            <p className="font-display text-lg text-culture-ink">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-culture-sand bg-white px-3 py-1.5 text-sm font-medium text-culture-muted hover:text-culture-ink"
          >
            Fermer
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
