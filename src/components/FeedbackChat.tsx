'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AUTH_GATE_OPEN_EVENT } from '@/lib/authActionGate';
import { compressFeedbackCapture } from '@/lib/feedbackCapture';
import {
  BUG_QUESTION,
  BUG_STUB,
  BUG_SUBTYPES,
  SUGGESTION_QUESTION,
  SUGGESTION_STUB,
  SUGGESTION_SUBTYPES,
  clearStub,
  fieldForTrack,
} from '@/lib/feedbackChips';
import {
  ATTACH_LABEL,
  CAPTURE_LABEL,
  IMAGE_PERMISSION,
  IMAGE_SEND_FAIL,
  IMAGE_TOO_HEAVY,
  REMOVE_CAPTURE_LABEL,
} from '@/lib/feedbackImage';
import {
  feedbackOpenAllowed,
  getOverlayStack,
  getServerOverlayStack,
  subscribeOverlayStack,
} from '@/lib/overlayStack';

const GREETING =
  'Bienvenue sur Plan C — on est en phase de test. Ce robot est là pour recueillir tes impressions (suggestion ou bug). Dis-moi ce que tu penses.';
const MODEL_LINE = 'Texte → modèle (US) pour une réponse courte.';
const RETENTION =
  'On garde ce texte 90 jours. N’écris pas ton e-mail dedans.';
const LAUNCHER_LABEL = 'Un avis ?';
/** Swap the file in /public. Static, ≤64px, no sound. Hidden under `sm`. */
const WELCOME_STICKER_SRC = '/feedback-welcome-c-wink.svg';

const CHIPS = [
  {
    label: 'Bug',
    kind: 'bug' as const,
    stub: BUG_STUB,
    question: BUG_QUESTION,
    subtypes: BUG_SUBTYPES,
  },
  {
    label: 'Suggestion',
    kind: 'idee' as const,
    stub: SUGGESTION_STUB,
    question: SUGGESTION_QUESTION,
    subtypes: SUGGESTION_SUBTYPES,
  },
];

const KIND_ASK = 'kind-ask';

const CHIP_CLASS =
  'inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta disabled:opacity-50 ';

type ChipKind = (typeof CHIPS)[number]['kind'];
type DraftCapture = { url: string; blob: Blob };
type Msg = { id: string; role: 'bot' | 'user'; text: string; imageUrl?: string };

const KNOWN_ERRORS = new Set([
  'Trop de messages d’un coup. Réessaie plus tard.',
  'Écris quelques mots.',
  'Ça n’est pas parti. Réessaie.',
  IMAGE_TOO_HEAVY,
  IMAGE_SEND_FAIL,
  IMAGE_PERMISSION,
]);

function calmError(status: number, raw: string, hadImage: boolean): string {
  if (raw === IMAGE_TOO_HEAVY || status === 413) return IMAGE_TOO_HEAVY;
  if (status === 429) return 'Trop de messages d’un coup. Réessaie plus tard.';
  if (hadImage) return IMAGE_SEND_FAIL;
  if (raw && KNOWN_ERRORS.has(raw)) return raw;
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
  const caretRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const liveUrls = useRef<string[]>([]);
  const captureRef = useRef<DraftCapture | null>(null);
  const [open, setOpen] = useState(false);
  const overlay = useSyncExternalStore(subscribeOverlayStack, getOverlayStack, getServerOverlayStack);
  const a2hsSheetOpen = overlay.a2hsSheetOpen;
  const panelOpen = open && feedbackOpenAllowed({ a2hsSheetOpen });
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ChipKind | null>(null);
  const [subtype, setSubtype] = useState<string | null>(null);
  const [capture, setCapture] = useState<DraftCapture | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'greet', role: 'bot', text: GREETING },
  ]);

  useEffect(() => {
    if (a2hsSheetOpen) setOpen(false);
  }, [a2hsSheetOpen]);

  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  useEffect(() => {
    const urls = liveUrls;
    const draft = captureRef;
    return () => {
      const pending = draft.current;
      if (pending && !urls.current.includes(pending.url)) URL.revokeObjectURL(pending.url);
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    function onAuthGate() {
      setOpen(false);
    }
    window.addEventListener(AUTH_GATE_OPEN_EVENT, onAuthGate);
    return () => window.removeEventListener(AUTH_GATE_OPEN_EVENT, onAuthGate);
  }, []);

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
    const pos = caretRef.current;
    if (pos == null) return;
    const el = inputRef.current;
    caretRef.current = null;
    if (!el) return;
    el.focus();
    const at = Math.min(pos, el.value.length);
    el.setSelectionRange(at, at);
  }, [text]);

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

  const active = CHIPS.find((chip) => chip.kind === kind) ?? null;

  function openPicker() {
    if (sending) return;
    const input = fileRef.current;
    if (!input) return;
    input.value = '';
    try {
      input.click();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError(IMAGE_PERMISSION);
      }
    }
  }

  async function onPick(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || sending) return;
    const result = await compressFeedbackCapture(file);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setCapture((prev) => {
      if (prev && !liveUrls.current.includes(prev.url)) URL.revokeObjectURL(prev.url);
      return { url: URL.createObjectURL(result.blob), blob: result.blob };
    });
    setError('');
  }

  function clearCapture() {
    if (sending) return;
    setCapture((prev) => {
      if (prev && !liveUrls.current.includes(prev.url)) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const pending = text.trim();
    if (sending) return;
    if (pending.length > 0 && pending.length < 2) {
      setError('Écris quelques mots.');
      return;
    }
    if (!pending && !capture) return;
    const pendingKind = kind;
    const draft = capture;
    setSending(true);
    setError('');
    setText('');
    try {
      let res: Response;
      if (draft) {
        const form = new FormData();
        form.set('text', pending);
        if (pendingKind) form.set('kind', pendingKind);
        form.set('image', new File([draft.blob], 'capture.jpg', { type: 'image/jpeg' }));
        res = await fetch('/api/feedback', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            pendingKind ? { text: pending, kind: pendingKind } : { text: pending },
          ),
        });
      }
      const data = (await res.json().catch(() => null)) as { reply?: unknown; error?: unknown } | null;
      if (!res.ok) {
        setText(pending);
        const raw = data && typeof data.error === 'string' ? data.error : '';
        setError(calmError(res.status, raw, Boolean(draft)));
        return;
      }
      const reply =
        data && typeof data.reply === 'string' && data.reply.trim()
          ? data.reply.trim()
          : 'Bien reçu. On lit ça.';
      seq.current += 1;
      const n = seq.current;
      if (draft) liveUrls.current.push(draft.url);
      setKind(null);
      setSubtype(null);
      setCapture(null);
      setMessages((prev) => [
        ...prev,
        { id: `u${n}`, role: 'user', text: pending, imageUrl: draft?.url },
        { id: `b${n}`, role: 'bot', text: reply },
      ]);
    } catch {
      setText(pending);
      setError(draft ? IMAGE_SEND_FAIL : calmError(0, '', false));
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
      {panelOpen ? (
        <section
          id={panelId}
          role="dialog"
          aria-label="Un avis, une idée"
          className="pointer-events-auto max-h-[min(32rem,calc(100dvh-4.5rem))] w-full overflow-y-auto rounded-2xl border border-culture-line bg-culture-surface p-3 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="font-display text-lg leading-tight text-culture-ink">
                Un avis, une idée
              </h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={WELCOME_STICKER_SRC}
                alt=""
                width={48}
                height={48}
                draggable={false}
                className="hidden h-12 w-12 shrink-0 sm:block"
              />
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full px-2 py-1 text-xs text-culture-muted hover:text-culture-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
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
                    ? 'ml-6 rounded-2xl bg-planc-nuit px-3 py-2 text-sm text-planc-creme'
                    : 'mr-6 whitespace-normal break-words rounded-2xl bg-culture-sand px-3 py-2 text-sm text-culture-ink'
                }
              >
                {msg.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={msg.imageUrl}
                    alt={CAPTURE_LABEL}
                    className={
                      'max-h-32 w-full rounded-lg object-cover ' + (msg.text ? 'mb-1' : '')
                    }
                  />
                ) : null}
                {msg.text ? msg.text : null}
              </li>
            ))}
            <li ref={endRef} data-feedback-end="" aria-hidden="true" className="h-px" />
          </ol>
          <form onSubmit={onSubmit} className="mt-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Type de message">
              {CHIPS.map((chip) => {
                const on = kind === chip.kind;
                return (
                  <button
                    key={chip.kind}
                    type="button"
                    aria-pressed={on}
                    disabled={sending}
                    onClick={() => {
                      if (kind === chip.kind) {
                        setKind(null);
                        setSubtype(null);
                        setText((cur) => clearStub(cur, chip.stub));
                        setMessages((prev) => prev.filter((msg) => msg.id !== KIND_ASK));
                      } else {
                        const previous = CHIPS.find((item) => item.kind === kind);
                        const next = fieldForTrack(text, previous?.stub ?? null, chip.stub);
                        setKind(chip.kind);
                        setSubtype(null);
                        if (next !== text) {
                          caretRef.current = next.length;
                          setText(next);
                        }
                        setMessages((prev) => [
                          ...prev.filter((msg) => msg.id !== KIND_ASK),
                          { id: KIND_ASK, role: 'bot', text: chip.question },
                        ]);
                      }
                      inputRef.current?.focus();
                    }}
                    className={
                      CHIP_CLASS +
                      (on
                        ? 'bg-planc-nuit text-planc-creme'
                        : 'border border-culture-line bg-culture-surface text-culture-muted hover:text-culture-ink')
                    }
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            {active ? (
              <div
                className="mt-2 flex flex-wrap gap-2"
                role="group"
                aria-label={active.kind === 'bug' ? 'Type de bug' : 'Type de suggestion'}
              >
                {active.subtypes.map((label) => {
                  const on = subtype === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      disabled={sending}
                      onClick={() => {
                        setSubtype((cur) => (cur === label ? null : label));
                        inputRef.current?.focus();
                      }}
                      className={
                        CHIP_CLASS +
                        (on
                          ? 'border border-culture-terracotta bg-culture-terracotta text-planc-nuit'
                          : 'border border-culture-line bg-culture-surface text-culture-muted hover:text-culture-ink')
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <label htmlFor={inputId} className="sr-only">
              Ton avis ou ton idée
            </label>
            <div className="mt-2 flex items-end gap-2">
              <button
                type="button"
                data-feedback="attach"
                title={ATTACH_LABEL}
                aria-label={ATTACH_LABEL}
                disabled={sending}
                onClick={openPicker}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-culture-line bg-culture-surface text-culture-ink hover:text-culture-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
                </svg>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
                onChange={onPick}
              />
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
                className="min-w-0 flex-1 resize-none rounded-xl border border-planc-controle bg-culture-surface px-3 py-2 text-sm text-culture-ink placeholder:text-culture-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={sending || (text.trim().length < 2 && !(capture && text.trim().length === 0))}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-planc-nuit px-4 text-sm font-medium text-planc-creme hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
              >
                {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
            {capture ? (
              <div data-feedback="capture-preview" className="mt-2 flex items-center gap-2">
                <span className="relative h-10 w-10 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capture.url}
                    alt=""
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                  {sending ? (
                    <span
                      className="absolute inset-0 grid place-items-center rounded-lg bg-planc-nuit/40"
                      aria-hidden="true"
                    >
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-culture-cream border-t-transparent" />
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 text-xs text-culture-muted">
                  {CAPTURE_LABEL}
                </span>
                <button
                  type="button"
                  aria-label={REMOVE_CAPTURE_LABEL}
                  disabled={sending}
                  onClick={clearCapture}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm text-culture-muted hover:text-culture-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta disabled:opacity-50"
                >
                  ×
                </button>
              </div>
            ) : null}
            {error ? (
              <p className="mt-1 text-xs text-culture-ink" role="status">
                {error}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}
      <button
        type="button"
        data-feedback="launcher"
        aria-expanded={panelOpen}
        aria-controls={panelOpen ? panelId : undefined}
        aria-label={LAUNCHER_LABEL}
        className="pointer-events-auto grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-culture-surface p-0 shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
        onClick={() => {
          if (!feedbackOpenAllowed({ a2hsSheetOpen })) return;
          setOpen((v) => !v);
        }}
      >
        <svg className="h-7 w-7" viewBox="0 0 64 64" aria-hidden="true">
          <g transform="translate(-5.6 0) skewX(-12) translate(8 0)">
            <path
              d="M48 16a18 18 0 1 0 0 32"
              fill="none"
              stroke="#FF2E7E"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </button>
    </div>
  );
}
