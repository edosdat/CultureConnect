'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const VELOURS = '#2A1231';
const NUIT = '#1A0B1E';
const CREME = '#FFF1F4';
const ROSE = '#FF2E7E';
const MUTED = '#D3B3CE';
const LIGNE = '#4A2350';
const CONTROLE = '#8F738F';
const SABLE = '#3A1840';
const MENTHE = '#5EEAD4';

type MatchPreview = {
  eventId: string;
  title: string;
  venue: string;
  whenLabel: string;
  imageUrl: string;
  categoryLabel: string;
};

type ProposalResponse = {
  id: string;
  status: string;
  duplicate?: boolean;
  match?: MatchPreview | null;
};

type Phase = 'form' | 'loading' | 'match' | 'pending';

function VenueMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 88 72"
      className="mx-auto h-16 w-20 text-planc-rose"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M18 46c8-14 14-22 18-22s6 6 8 10" strokeLinecap="round" />
      <path d="M34 28c2-6 6-12 8-16 1 4 2 8 1 14" strokeLinecap="round" />
      <path d="M28 34c-6 2-12 8-14 14" strokeLinecap="round" />
      <path d="M44 40v14M36 54h28" strokeLinecap="round" />
      <path d="M40 54V44h16v10" />
      <path d="M44 44l8-6 8 6" />
      <circle cx="68" cy="22" r="8" />
      <path d="M68 16v4M66 26c1.2 1 2.6 1.4 4 1" strokeLinecap="round" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M10 3.2a4.3 4.3 0 0 0-2.4 7.9c.4.3.7.8.7 1.3v.6h3.4v-.6c0-.5.3-1 .7-1.3A4.3 4.3 0 0 0 10 3.2Z"
        strokeLinejoin="round"
      />
      <path d="M8.2 15h3.6M8.7 16.6h2.6" strokeLinecap="round" />
    </svg>
  );
}

function BranchMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 180 120"
      className="mx-auto h-28 w-44 text-planc-rose/70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M90 108c-8-28-6-48 8-70 6-8 8-16 6-26" strokeLinecap="round" />
      <path d="M98 38c10-2 22 2 30 10" strokeLinecap="round" />
      <path d="M96 52c-16 2-28 12-34 24" strokeLinecap="round" />
      <path d="M92 70c12 4 22 16 26 28" strokeLinecap="round" />
      <path d="M70 78c-8 2-14 8-16 16" strokeLinecap="round" />
      <ellipse cx="128" cy="40" rx="10" ry="4" transform="rotate(-20 128 40)" />
      <ellipse cx="62" cy="78" rx="9" ry="3.5" transform="rotate(30 62 78)" />
      <ellipse cx="118" cy="96" rx="8" ry="3" transform="rotate(-10 118 96)" />
    </svg>
  );
}

function calmError(status: number, fallback: string): string {
  if (status === 429) {
    return 'Tu as déjà proposé 5 spectacles sur 24 h. On vérifie ceux-là.';
  }
  if (status === 400) return 'Indique au moins un titre.';
  return fallback;
}

export function ProposeEmptyCard({ onPropose }: { onPropose: () => void }) {
  return (
    <section
      data-propose="empty"
      aria-label="Pas encore sur CultureConnect"
      className="rounded-2xl border border-planc-ligne px-5 py-8 text-center shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
      style={{ background: VELOURS, color: CREME }}
    >
      <VenueMark />
      <h2 className="mt-3 font-display text-[1.65rem] leading-tight">
        Pas encore sur CultureConnect
      </h2>
      <p className="mx-auto mt-3 max-w-[18rem] text-[15px] leading-relaxed">
        Un bar, un concert, une date — propose-la, on vérifie.
      </p>
      <button
        type="button"
        data-propose-cta="empty"
        onClick={onPropose}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold"
        style={{ background: ROSE, color: NUIT }}
      >
        Proposer un spectacle
      </button>
      <p className="mt-4 text-[13px] italic" style={{ color: MUTED }}>
        Tu aides les salles qu’on rate encore.
      </p>
    </section>
  );
}

export function ProposeListFooter({ onPropose }: { onPropose: () => void }) {
  return (
    <div data-propose="footer" className="px-2 pb-6 pt-1 text-center">
      <div
        aria-hidden
        className="mb-4 h-px w-full"
        style={{ background: LIGNE }}
      />
      <p className="text-[13px]" style={{ color: MUTED }}>
        Tu ne trouves pas ce que tu cherches ?
      </p>
      <button
        type="button"
        data-propose-cta="footer"
        onClick={onPropose}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border bg-transparent px-4 py-2 text-sm font-semibold"
        style={{ borderColor: ROSE, color: ROSE }}
      >
        <LightbulbIcon />
        Proposer un spectacle
      </button>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="mb-1 block text-[13px] font-medium" style={{ color: CREME }}>
      {children}
    </label>
  );
}

const inputClass =
  'h-11 w-full rounded-xl border border-planc-controle bg-culture-surface px-3 text-[15px] text-culture-ink outline-none focus:border-culture-terracotta';

export function ProposeSpectacleSheet({
  open,
  query,
  onClose,
  onNeedAuth,
}: {
  open: boolean;
  query: string;
  onClose: () => void;
  onNeedAuth: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('form');
  const [title, setTitle] = useState(query);
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [match, setMatch] = useState<MatchPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase('form');
    setTitle(query);
    setVenue('');
    setDate('');
    setTime('');
    setUrl('');
    setNote('');
    setToast('');
    setProposalId('');
    setMatch(null);
    setBusy(false);
  }, [open, query]);

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
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  function showPending(message = 'Merci — on vérifie.') {
    setPhase('pending');
    setToast(message);
  }

  async function onSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setNote('Indique au moins un titre.');
      return;
    }
    setNote('');
    setBusy(true);
    setPhase('loading');
    try {
      const res = await fetch('/api/propose-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
          venue_name: venue.trim(),
          date: date || undefined,
          time: time || undefined,
          url_user: url.trim() || undefined,
        }),
      });
      if (res.status === 401) {
        setPhase('form');
        onNeedAuth();
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | (ProposalResponse & { error?: string })
        | null;
      if (!res.ok || !data?.id) {
        setPhase('form');
        setNote(
          calmError(
            res.status,
            'On n’a pas pu enregistrer. Réessaie dans un instant.',
          ),
        );
        return;
      }
      setProposalId(data.id);
      if (data.status === 'matched_candidate' && data.match?.title) {
        setMatch(data.match);
        setPhase('match');
        return;
      }
      showPending();
    } catch {
      setPhase('form');
      setNote('On n’a pas pu enregistrer. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(accept: boolean) {
    if (!proposalId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/propose-event/${encodeURIComponent(proposalId)}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accept }),
        },
      );
      if (res.status === 401) {
        onNeedAuth();
        return;
      }
      if (!res.ok) {
        setNote('On n’a pas pu enregistrer. Réessaie dans un instant.');
        return;
      }
      showPending();
    } catch {
      setNote('On n’a pas pu enregistrer. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] h-dvh min-h-dvh" role="presentation">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="propose-spectacle-title"
        data-propose-sheet={phase}
        className="absolute inset-x-0 bottom-0 flex h-[85dvh] max-h-[85dvh] flex-col rounded-t-3xl border border-planc-ligne shadow-xl"
        style={{ background: VELOURS, color: CREME }}
      >
        <div className="flex shrink-0 justify-center pt-2">
          <span
            aria-hidden
            className="h-1.5 w-10 rounded-full"
            style={{ background: SABLE }}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-3">
          {phase === 'form' ? (
            <form
              data-propose-form=""
              onSubmit={(e) => {
                e.preventDefault();
                void onSubmit();
              }}
            >
              <h2
                id="propose-spectacle-title"
                className="font-display text-2xl leading-tight"
              >
                Proposer un spectacle
              </h2>
              <div className="mt-4">
                <FieldLabel>Titre</FieldLabel>
                <div className="relative">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={200}
                    className={`${inputClass} pr-10`}
                    autoComplete="off"
                  />
                  {title ? (
                    <button
                      type="button"
                      aria-label="Effacer le titre"
                      onClick={() => setTitle('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
                      style={{ color: MUTED }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3">
                <FieldLabel>Lieu</FieldLabel>
                <input
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  maxLength={200}
                  className={inputClass}
                  autoComplete="off"
                />
                <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
                  Nouveau lieu OK — bars et salles petites bienvenus.
                </p>
              </div>
              <div className="mt-3">
                <FieldLabel>Date</FieldLabel>
                <div className="grid grid-cols-[1fr_7.5rem] gap-2">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    aria-label="Heure"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mt-3">
                <FieldLabel>Lien de la prog (optionnel)</FieldLabel>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  inputMode="url"
                  maxLength={500}
                  className={inputClass}
                  autoComplete="off"
                />
              </div>
              {note ? (
                <p className="mt-3 text-sm" style={{ color: CREME }} role="status">
                  {note}
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{ background: ROSE, color: NUIT }}
                >
                  Envoyer <span aria-hidden>→</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex min-h-11 items-center rounded-xl border bg-culture-surface px-5 py-2.5 text-sm font-semibold"
                  style={{ borderColor: CONTROLE, color: CREME }}
                >
                  Annuler
                </button>
              </div>
            </form>
          ) : null}

          {phase === 'loading' ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <h2 id="propose-spectacle-title" className="font-display text-3xl">
                On cherche…
              </h2>
            </div>
          ) : null}

          {phase === 'match' && match ? (
            <div>
              <h2
                id="propose-spectacle-title"
                className="font-display text-[1.7rem] leading-tight"
              >
                On a trouvé ça — c’est bien ?
              </h2>
              <p className="mt-2 text-sm" style={{ color: MUTED }}>
                Vérifions ensemble pour affiner nos suggestions.
              </p>
              <article className="mt-4 flex gap-3 rounded-2xl border border-planc-ligne bg-planc-sable p-3">
                {match.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={match.imageUrl}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="h-20 w-20 shrink-0 rounded-xl"
                    style={{ background: SABLE }}
                  />
                )}
                <div className="min-w-0 text-left">
                  <p className="font-display text-lg leading-snug">{match.title}</p>
                  {match.venue ? (
                    <p className="mt-1 text-sm" style={{ color: MUTED }}>
                      {match.venue}
                    </p>
                  ) : null}
                  {match.whenLabel ? (
                    <p className="mt-0.5 text-sm" style={{ color: MUTED }}>
                      {match.whenLabel}
                    </p>
                  ) : null}
                  {match.categoryLabel ? (
                    <p
                      className="mt-2 inline-flex rounded-full px-2 py-0.5 text-xs"
                      style={{ background: SABLE, color: MENTHE }}
                    >
                      {match.categoryLabel}
                    </p>
                  ) : null}
                </div>
              </article>
              {note ? (
                <p className="mt-3 text-sm" role="status">
                  {note}
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void onConfirm(true)}
                className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ background: ROSE, color: NUIT }}
              >
                Oui, c’est ça
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onConfirm(false)}
                className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border bg-culture-surface text-sm font-semibold disabled:opacity-60"
                style={{ borderColor: CONTROLE, color: CREME }}
              >
                Non, continuer la vérif
              </button>
            </div>
          ) : null}

          {phase === 'pending' ? (
            <div data-propose-pending="">
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-medium"
                style={{ color: ROSE }}
              >
                ← Retour
              </button>
              <h2
                id="propose-spectacle-title"
                className="mt-4 font-display text-5xl"
                style={{ color: ROSE }}
              >
                Merci.
              </h2>
              <p className="mt-3 max-w-[16rem] text-[17px] leading-snug">
                On vérifie avant de l’ajouter à l’agenda.
              </p>
              <BranchMark />
              <div className="rounded-2xl border border-planc-rose/25 bg-planc-sable p-4 text-left">
                <p className="text-sm font-semibold" style={{ color: ROSE }}>
                  Proposition reçue
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: MUTED }}>
                  Merci pour votre suggestion. Nous vous tiendrons informé dès que
                  c’est ajouté.
                </p>
              </div>
              <p className="mt-6 text-center text-sm" style={{ color: ROSE }}>
                ♥ Votre participation tisse des ponts culturels.
              </p>
            </div>
          ) : null}
        </div>
        {toast ? (
          <p
            role="status"
            data-propose-toast=""
            className="pointer-events-none absolute inset-x-4 bottom-4 rounded-full px-4 py-2 text-center text-sm shadow-md"
            style={{ background: NUIT, color: CREME }}
          >
            {toast}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
