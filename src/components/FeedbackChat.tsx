'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GREETING = 'Une phrase suffit. Avis ou idée.';
const RETENTION =
  'On garde ce texte 90 jours. N’écris pas ton e-mail dedans.';

type Msg = { id: string; role: 'bot' | 'user'; text: string };

function calmError(status: number): string {
  if (status === 429) return 'Trop de messages d’un coup. Réessaie plus tard.';
  if (status === 400) return 'Écris quelques mots.';
  return 'Ça n’est pas parti. Réessaie.';
}

export default function FeedbackChat() {
  const pathname = usePathname();
  const inputId = useId();
  const panelId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'greet', role: 'bot', text: GREETING },
  ]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (pathname?.startsWith('/admin')) return null;

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const pending = text.trim();
    if (!pending || sending) return;
    setSending(true);
    setError('');
    setText('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pending }),
      });
      if (!res.ok) {
        setText(pending);
        setError(calmError(res.status));
        return;
      }
      const data = (await res.json()) as { reply?: unknown };
      const reply =
        typeof data.reply === 'string' && data.reply.trim()
          ? data.reply.trim()
          : 'Bien reçu. On lit ça.';
      seq.current += 1;
      const n = seq.current;
      setMessages((prev) => [
        ...prev,
        { id: `u${n}`, role: 'user', text: pending },
        { id: `b${n}`, role: 'bot', text: reply },
      ]);
    } catch {
      setText(pending);
      setError(calmError(0));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[min(100vw-2rem,22rem)] flex-col items-end gap-2">
      {open ? (
        <section
          id={panelId}
          role="dialog"
          aria-label="Un avis, une idée"
          className="pointer-events-auto w-full rounded-2xl border border-culture-line bg-culture-surface p-3 shadow-card"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg leading-tight text-culture-ink">
              Un avis, une idée
            </h2>
            <button
              type="button"
              className="rounded-full px-2 py-1 text-xs text-culture-muted hover:text-culture-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
              onClick={() => setOpen(false)}
            >
              Fermer
            </button>
          </div>
          <p className="mt-1 text-xs leading-snug text-culture-muted">
            {RETENTION}{' '}
            <Link
              href="/confidentialite"
              className="underline-offset-2 hover:text-culture-ink hover:underline"
            >
              Confidentialité
            </Link>
          </p>
          <ol className="mt-3 max-h-52 space-y-2 overflow-y-auto">
            {messages.map((msg) => (
              <li
                key={msg.id}
                className={
                  msg.role === 'user'
                    ? 'ml-6 rounded-2xl bg-culture-ink px-3 py-2 text-sm text-culture-cream'
                    : 'mr-6 rounded-2xl bg-culture-sand px-3 py-2 text-sm text-culture-ink'
                }
              >
                {msg.text}
              </li>
            ))}
          </ol>
          <form onSubmit={onSubmit} className="mt-3">
            <label htmlFor={inputId} className="sr-only">
              Ton avis ou ton idée
            </label>
            <textarea
              ref={inputRef}
              id={inputId}
              name="text"
              rows={3}
              maxLength={400}
              value={text}
              disabled={sending}
              placeholder="Quelques mots"
              onChange={(ev) => setText(ev.target.value)}
              className="w-full resize-none rounded-xl border border-culture-line bg-white px-3 py-2 text-sm text-culture-ink placeholder:text-culture-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta disabled:opacity-60"
            />
            {error ? (
              <p className="mt-1 text-xs text-culture-ink" role="status">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sending || text.trim().length < 2}
              className="mt-2 inline-flex min-h-10 items-center justify-center rounded-full bg-culture-ink px-4 text-sm font-medium text-culture-cream hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
            >
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          </form>
        </section>
      ) : null}
      <button
        type="button"
        data-feedback="launcher"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="pointer-events-auto rounded-full border border-culture-line bg-culture-surface px-3 py-2 text-xs font-medium text-culture-muted shadow-card hover:text-culture-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
        onClick={() => setOpen((v) => !v)}
      >
        Un avis ?
      </button>
    </div>
  );
}
