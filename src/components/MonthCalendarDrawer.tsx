'use client';

import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
};

const ANIM_MS = 200;
/** Swallow the mobile ghost click that would hit Connecte-toi / Google. */
const GHOST_CLICK_MS = 350;

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
    const t = window.setTimeout(
      () => setShouldRender(false),
      ANIM_MS + GHOST_CLICK_MS,
    );
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

  function dismiss(e: SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (open) onClose();
  }

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 h-dvh min-h-dvh overflow-x-hidden pointer-events-auto"
      role="presentation"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer le calendrier"
        className={
          'absolute inset-0 bg-culture-ink/20 transition-opacity duration-200 ease-out pointer-events-auto ' +
          (visible ? 'opacity-100' : 'opacity-0')
        }
        onPointerDown={dismiss}
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          'absolute flex min-w-0 w-full max-w-full flex-col overflow-x-hidden bg-culture-surface shadow-xl ' +
          'inset-x-0 bottom-0 max-h-[70vh] max-h-[70dvh] rounded-t-3xl border border-culture-line pb-[env(safe-area-inset-bottom,0px)] ' +
          'md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:max-w-md md:rounded-none md:border-y-0 md:border-l md:border-r-0 ' +
          'transition-transform duration-200 ease-out ' +
          (visible
            ? 'translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full')
        }
      >
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-culture-line px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <div
              aria-hidden
              className="mx-auto mb-2 h-1 w-10 rounded-full bg-culture-line md:hidden"
            />
            <p className="truncate font-display text-base text-culture-ink sm:text-lg">
              {title}
            </p>
          </div>
          <button
            type="button"
            onPointerDown={dismiss}
            onClick={dismiss}
            className="shrink-0 rounded-full border border-culture-line bg-culture-cream px-3 py-1.5 text-sm font-medium text-culture-ink hover:bg-white"
          >
            Fermer
          </button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-2 sm:p-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
