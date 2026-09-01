'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { profileChips, SHEET_BUCKET_TITLES } from '@/lib/pourToi';
import { useSignals } from './SignalsProvider';
import MailIdeasCheckbox from './MailIdeasCheckbox';

type Props = {
  open: boolean;
  onClose: () => void;
};

const ANIM_MS = 200;

function formatPct(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Bottom sheet Mes goûts — lines label + % + ×. Not a questionnaire. */
export default function TastesSheet({ open, onClose }: Props) {
  const { wipeKey, addPhrase, tasteState } = useSignals();
  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState('');
  const rows = profileChips(tasteState?.profile, 64);

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
          'absolute inset-x-0 bottom-0 flex max-h-[80dvh] w-full max-w-full min-w-0 flex-col overflow-x-hidden bg-culture-surface shadow-xl ' +
          'rounded-t-3xl border border-culture-line pb-[env(safe-area-inset-bottom,0px)] ' +
          'sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-full sm:max-w-[420px] sm:-translate-x-1/2 sm:rounded-2xl ' +
          'transition-transform duration-200 ease-out ' +
          (visible ? 'translate-y-0' : 'translate-y-full')
        }
      >
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 px-4 pt-3">
          <p className="min-w-0 truncate font-display text-lg text-culture-ink">
            Mes goûts
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none text-culture-muted hover:bg-culture-cream hover:text-culture-ink"
          >
            ×
          </button>
        </div>
        <p className="shrink-0 px-4 pb-3 pt-1 text-sm text-culture-muted">
          Tes goûts, en une ligne. Ça nourrit le top 3.
        </p>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4">
          {rows.length === 0 ? (
            <p className="py-6 text-sm text-culture-muted">
              aucun goût pour l’instant
            </p>
          ) : null}
          {SHEET_BUCKET_TITLES.map(({ bucket, title }) => {
            const group = rows.filter((row) => row.bucket === bucket);
            if (group.length === 0) return null;
            return (
              <div key={bucket} className="mb-3">
                <p className="pt-2 text-xs font-medium uppercase tracking-[0.12em] text-culture-muted">
                  {title}
                </p>
                <ul className="divide-y divide-culture-line">
                  {group.map((row) => (
                    <li
                      key={`${row.bucket}:${row.key}`}
                      className="flex min-w-0 items-center gap-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-culture-ink">
                        {row.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-sm text-culture-terracotta">
                        {formatPct(row.pct)}&nbsp;%
                      </span>
                      <button
                        type="button"
                        aria-label={`Retirer ${row.label}`}
                        onClick={() => wipeKey(row.bucket, row.key)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center text-lg leading-none text-culture-muted hover:text-culture-ink"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="shrink-0 border-t border-culture-line px-4 py-3">
          <MailIdeasCheckbox className="flex items-start gap-2 text-sm leading-snug text-culture-ink" />
        </div>
        <form
          className="shrink-0 border-t border-culture-line px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            addPhrase(t);
            setDraft('');
          }}
        >
          <label className="flex items-center gap-2 rounded-full border border-culture-line bg-culture-cream px-3 py-2">
            <span className="text-sm text-culture-muted" aria-hidden>
              +
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-culture-ink outline-none placeholder:text-culture-muted/60"
              placeholder="Qu’est-ce qui te ferait vibrer ?"
              aria-label="Ajouter un goût"
            />
          </label>
        </form>
      </div>
    </div>,
    document.body,
  );
}
