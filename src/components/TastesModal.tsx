'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

type Props = {
  /** Controlled open from « Mes goûts » / parent */
  open: boolean;
  /** When true, user explicitly opened — allow close even if empty */
  forceOpen: boolean;
  onRequestOpen: () => void;
  onClose: () => void;
};

function useEscapeClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);
}

export default function TastesModal({
  open,
  forceOpen,
  onRequestOpen,
  onClose,
}: Props) {
  const { data: session, status, update } = useSession();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoPrompted = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tastes = session?.user?.tastes?.trim() ?? '';
  const authenticated = status === 'authenticated' && Boolean(session?.user);

  // Free text only via « Mes goûts » — never auto-modal before the first card.
  useEffect(() => {
    if (!authenticated) autoPrompted.current = false;
  }, [authenticated]);

  // Sync textarea when opening
  useEffect(() => {
    if (open) {
      setText(tastes);
      setError(null);
      const t = window.setTimeout(() => textareaRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open, tastes]);

  const visible = open && authenticated;
  const canDismiss = forceOpen || Boolean(tastes);

  useEscapeClose(visible && canDismiss, onClose);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const next = text.trim();
    if (!next) {
      setError('Dis-nous un peu ce que tu aimes — même en quelques mots.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/tastes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tastes: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || 'Enregistrement impossible');
      }
      const data = (await res.json()) as {
        tastes: string;
        tastesSetAt?: string;
      };
      const payload = data as {
        tastes: string;
        tastesSetAt?: string;
        tasteState?: import('@/lib/signals').AccountTasteState;
      };
      await update({
        tastes: payload.tastes,
        tastesSetAt: payload.tastesSetAt,
        tasteState: payload.tasteState,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-culture-ink/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tastes-modal-title"
      onClick={canDismiss ? onClose : undefined}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg min-w-0 overflow-y-auto overflow-x-hidden rounded-t-3xl border border-culture-sand bg-culture-cream shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-culture-sand bg-culture-cream/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-culture-terracotta">
              Pour toi
            </p>
            <h2
              id="tastes-modal-title"
              className="mt-1 font-display text-2xl text-culture-ink"
            >
              Qu&apos;est-ce que tu aimes dans la vie&nbsp;?
            </h2>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-culture-sand bg-white px-3 py-1 text-sm text-culture-ink hover:bg-culture-sand"
              aria-label="Fermer"
            >
              Fermer
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4 px-5 py-5">
          <p className="text-sm text-culture-muted">
            Concerts, théâtre, jazz, expos, cinéma d&apos;auteur, guinguettes…
            Écris librement — on s&apos;en sert pour te proposer des sorties.
          </p>
          <label className="block">
            <span className="sr-only">Tes goûts</span>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="Ex. : j’adore le jazz live, les expos d’art contemporain, et les soirées en terrasse…"
              className="w-full resize-y rounded-2xl border border-culture-line bg-culture-surface px-4 py-3 text-sm text-culture-ink placeholder:text-culture-muted/70 focus:border-culture-terracotta focus:outline-none focus:ring-2 focus:ring-culture-terracotta/30"
            />
          </label>
          {error && (
            <p className="text-sm text-culture-clay" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-culture-clay disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer mes goûts'}
            </button>
            {canDismiss && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-culture-sand bg-white px-5 py-2.5 text-sm font-medium text-culture-ink hover:bg-culture-sand"
              >
                Plus tard
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
