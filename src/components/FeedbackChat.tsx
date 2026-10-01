'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GREETING = 'Une phrase suffit. Avis ou idée.';
const MODEL_LINE = 'Texte → modèle (US) pour une réponse courte.';
const RETENTION =
  'On garde ce texte 90 jours. N’écris pas ton e-mail dedans.';
const LAUNCHER_LABEL = 'Un avis ?';
const ICON_SRC = '/plan-c-icon-LOCK-v3-violet.jpg';

const CHIPS = [
  { label: 'Suggestion', kind: 'idee' },
  { label: 'Bug', kind: 'bug' },
] as const;

type ChipKind = (typeof CHIPS)[number]['kind'];
type Msg = { id: string; role: 'bot' | 'user'; text: string };

function calmError(status: number): string {
  if (status === 429) return 'Trop de messages d’un coup. Réessaie plus tard.';
  if (status === 400) return 'Écris quelques mots.';
  return 'Ça n’est pas parti. Réessaie.';
}

/** Keep the round launcher above the cookie banner and out of the PWA sheet. */
function placeFeedbackDock(node: HTMLElement) {
  const pwaOpen = document.querySelector('[data-testid="pwa-install-sheet"]');
  if (pwaOpen) {
    node.dataset.feedbackDock = 'clear';
    node.style.visibility = 'hidden';
    return;
  }
  node.style.visibility = '';
  const banner = document.querySelector<HTMLElement>('[data-consent-banner]');
  const bannerH = banner ? Math.ceil(banner.getBoundingClientRect().height) : 0;
  if (bannerH > 8) {
    node.dataset.feedbackDock = 'above-consent';
    node.style.bottom = `${bannerH + 12}px`;
    return;
  }
  node.dataset.feedbackDock = 'corner';
  node.style.bottom = 'max(1rem, env(safe-area-inset-bottom, 0px))';
}

function scrollListToEnd(list: HTMLElement, end: HTMLElement) {
  const listBox = list.getBoundingClientRect();
  const endBox = end.getBoundingClientRect();
  const delta = endBox.bottom - listBox.bottom;
  if (delta > 0) list.scrollTop += delta;
}

export default function FeedbackChat() {
  const pathname = usePathname();
  const inputId = useId();
  const panelId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const endRef = useRef<HTMLLIElement>(null);
  const seq = useRef(0);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ChipKind | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'greet', role: 'bot', text: GREETING },
  ]);

  useEffect(() => {
    if (pathname?.startsWith('/admin')) return;
    const node = dockRef.current;
    if (!node) return;
    const place = () => {
      const dock = dockRef.current;
      if (dock) placeFeedbackDock(dock);
    };
    place();
    const obs = new MutationObserver(place);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', place);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [pathname, open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const end = endRef.current;
    if (list && end) scrollListToEnd(list, end);
  }, [open, messages]);

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
    const pendingKind = kind;
    setSending(true);
    setError('');
    setText('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          pendingKind ? { text: pending, kind: pendingKind } : { text: pending },
        ),
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
      setKind(null);
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
    <div
      ref={dockRef}
      data-feedback-dock=""
      className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-4 z-40 flex w-[min(100vw-2rem,22rem)] flex-col items-end gap-2"
    >
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
            {MODEL_LINE}{' '}
            <Link
              href="/confidentialite"
              className="underline-offset-2 hover:text-culture-ink hover:underline"
            >
              Confidentialité
            </Link>
          </p>
          <p className="mt-1 text-xs leading-snug text-culture-muted">{RETENTION}</p>
          <ol
            ref={listRef}
            className="mt-3 max-h-52 space-y-2 overflow-y-auto"
          >
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
            <li ref={endRef} data-feedback-end="" aria-hidden="true" className="h-px" />
          </ol>
          <form onSubmit={onSubmit} className="mt-3">
            <div className="flex gap-2" role="group" aria-label="Type de message">
              {CHIPS.map((chip) => {
                const on = kind === chip.kind;
                return (
                  <button
                    key={chip.kind}
                    type="button"
                    aria-pressed={on}
                    disabled={sending}
                    onClick={() => {
                      setKind((cur) => (cur === chip.kind ? null : chip.kind));
                      inputRef.current?.focus();
                    }}
                    className={
                      'inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta disabled:opacity-50 ' +
                      (on
                        ? 'bg-culture-ink text-culture-cream'
                        : 'border border-culture-line bg-white text-culture-muted hover:text-culture-ink')
                    }
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
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
              className="mt-2 w-full resize-none rounded-xl border border-culture-line bg-white px-3 py-2 text-sm text-culture-ink placeholder:text-culture-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta disabled:opacity-60"
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
        aria-label={LAUNCHER_LABEL}
        className="pointer-events-auto grid h-12 w-12 place-items-center overflow-hidden rounded-full border border-culture-line bg-culture-surface p-0 shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
        onClick={() => setOpen((v) => !v)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ICON_SRC}
          alt=""
          width={48}
          height={48}
          draggable={false}
          className="h-12 w-12 object-cover"
        />
      </button>
    </div>
  );
}
