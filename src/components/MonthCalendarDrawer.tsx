'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
};

const ANIM_MS = 200;

/** Desktop: right slide-in (max-w-md). Mobile: bottom sheet. Close keeps filters. */
export default function MonthCalendarDrawer({
  open,
  onClose,
  children,
  title = 'Calendrier',
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (open) {
      setShouldRender(true);
      setVisible(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => setShouldRender(false), ANIM_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-40" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer le calendrier"
        className={
          'absolute inset-0 bg-culture-ink/20 transition-opacity duration-200 ease-out ' +
          (visible ? 'opacity-100' : 'opacity-0')
        }
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          'absolute flex flex-col bg-culture-surface shadow-xl ' +
          'inset-x-0 bottom-0 max-h-[70vh] rounded-t-3xl border border-culture-line ' +
          'md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-y-0 md:border-l md:border-r-0 ' +
          'transition-transform duration-200 ease-out ' +
          (visible
            ? 'translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full')
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
            className="shrink-0 rounded-full border border-culture-line bg-culture-cream px-3 py-1.5 text-sm font-medium text-culture-ink hover:bg-white"
          >
            Fermer
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
