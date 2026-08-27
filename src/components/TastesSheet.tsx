'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { profileChips } from '@/lib/pourToi';
import { useSignals } from './SignalsProvider';

type Props = {
  open: boolean;
  onClose: () => void;
};

const ANIM_MS = 200;

/** 390-friendly bottom sheet (desktop: right panel). Not a questionnaire. */
export default function TastesSheet({ open, onClose }: Props) {
  const { wipeKey, addPhrase, tasteState } = useSignals();
  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState('');
  const chips = profileChips(tasteState?.profile, 64);

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

  useEffect(() => {
    if (!open) setDraft('');
  }, [open]);

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 h-dvh min-h-dvh overflow-x-hidden" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer Mes goûts"
        className={
          'absolute inset-0 bg-culture-ink/20 transition-opacity duration-200 ease-out ' +
          (visible ? 'opacity-100' : 'opacity-0')
        }
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mes goûts"
        className={
          'absolute flex min-w-0 w-full max-w-full flex-col overflow-x-hidden bg-culture-surface shadow-xl ' +
          'inset-x-0 bottom-0 max-h-[80vh] max-h-[80dvh] rounded-t-3xl border border-culture-line pb-[env(safe-area-inset-bottom,0px)] ' +
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
              Mes goûts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-culture-line bg-culture-cream px-3 py-1.5 text-sm font-medium text-culture-ink hover:bg-white"
          >
            Fermer
          </button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <span
                key={`${chip.bucket}:${chip.key}`}
                className="inline-flex items-center gap-1 rounded-full border border-culture-line bg-culture-cream px-2.5 py-1 text-sm text-culture-ink"
              >
                {chip.label} {chip.pct}&nbsp;%
                <button
                  type="button"
                  aria-label={`Retirer ${chip.label}`}
                  onClick={() => wipeKey(chip.bucket, chip.key)}
                  className="text-culture-muted/70 hover:text-culture-ink"
                >
                  ×
                </button>
              </span>
            ))}
            <form
              className="inline-flex"
              onSubmit={(e) => {
                e.preventDefault();
                const t = draft.trim();
                if (!t) return;
                addPhrase(t);
                setDraft('');
              }}
            >
              <label className="inline-flex items-center gap-1 rounded-full border border-culture-line bg-culture-cream px-2 py-1">
                <span className="text-sm text-culture-muted" aria-hidden>
                  +
                </span>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-24 bg-transparent text-sm text-culture-ink outline-none placeholder:text-culture-muted/60"
                  placeholder="rire…"
                  aria-label="Ajouter un goût"
                />
              </label>
            </form>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
