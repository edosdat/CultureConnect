'use client';

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Lieu } from '@/lib/types';
import { formatLieuAffiche } from '@/lib/labels';
import {
  PROPOSE_COLORS,
  PROPOSE_COPY,
  formatProposePreviewWhen,
  type EventProposalPublic,
  type MatchPreview,
} from '@/lib/eventProposal';

type Step = 'form' | 'match' | 'pending';

type FieldErrors = Partial<
  Record<'title' | 'venue_name' | 'date' | 'url_user', string>
>;

type Props = {
  open: boolean;
  onClose: () => void;
  initialTitle: string;
  venues: Lieu[];
};

const FIELD =
  'w-full rounded-xl border bg-white px-3 py-2.5 text-[15px] outline-none placeholder:text-stone-400';
const LABEL = 'mb-1 block text-sm font-medium';

function Grabber() {
  return (
    <div
      aria-hidden
      className="mx-auto mb-3 h-1 w-10 rounded-full"
      style={{ backgroundColor: '#D4CBBE' }}
    />
  );
}

function FieldIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-stone-400">
      {children}
    </span>
  );
}

export default function ProposeEventFlow({
  open,
  onClose,
  initialTitle,
  venues,
}: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [title, setTitle] = useState(initialTitle);
  const [venueName, setVenueName] = useState('');
  const [venueId, setVenueId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [urlUser, setUrlUser] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<EventProposalPublic | null>(null);
  const [match, setMatch] = useState<MatchPreview | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep('form');
    setTitle(initialTitle);
    setVenueName('');
    setVenueId('');
    setDate('');
    setTime('');
    setUrlUser('');
    setErrors({});
    setFormError('');
    setBusy(false);
    setProposal(null);
    setMatch(null);
  }, [open, initialTitle]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, busy]);

  const listId = useId();
  const venueOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const lieu of venues) {
      const label = formatLieuAffiche(lieu) || lieu.nom;
      if (!label || seen.has(lieu.lieu_id)) continue;
      seen.add(lieu.lieu_id);
      out.push({ id: lieu.lieu_id, label });
    }
    return out.slice(0, 80);
  }, [venues]);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!title.trim()) next.title = 'Le titre est requis';
    if (!venueName.trim()) next.venue_name = 'Le lieu est requis';
    if (!date.trim()) next.date = 'La date est requise';
    return next;
  }

  function applyVenueLabel(label: string) {
    setVenueName(label);
    const hit = venueOptions.find(
      (v) => v.label.toLocaleLowerCase('fr') === label.toLocaleLowerCase('fr'),
    );
    setVenueId(hit?.id ?? '');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/propose-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          venue_name: venueName.trim(),
          venue_id: venueId || undefined,
          date,
          time: time || undefined,
          url_user: urlUser.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        proposal?: EventProposalPublic;
        match?: MatchPreview | null;
        error?: string;
        fields?: FieldErrors;
        code?: string;
      } | null;
      if (res.status === 401) {
        setFormError('Connexion requise');
        return;
      }
      if (res.status === 429) {
        setFormError(data?.error || 'Trop de propositions (5 / 24h)');
        return;
      }
      if (res.status === 409 && data?.proposal) {
        setProposal(data.proposal);
        setMatch(data.match ?? null);
        setStep(
          data.proposal.status === 'matched_candidate' && data.match
            ? 'match'
            : 'pending',
        );
        return;
      }
      if (!res.ok || !data?.proposal) {
        if (data?.fields) setErrors(data.fields);
        setFormError(data?.error || 'Envoi impossible');
        return;
      }
      setProposal(data.proposal);
      setMatch(data.match ?? null);
      setStep(
        data.proposal.status === 'matched_candidate' && data.match
          ? 'match'
          : 'pending',
      );
    } catch {
      setFormError('Envoi impossible');
    } finally {
      setBusy(false);
    }
  }

  async function confirmMatch(accept: boolean) {
    if (!proposal) {
      setStep('pending');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/propose-event/${proposal.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      });
      const data = (await res.json().catch(() => null)) as {
        proposal?: EventProposalPublic;
      } | null;
      if (data?.proposal) setProposal(data.proposal);
      setMatch(null);
      setStep('pending');
    } catch {
      setStep('pending');
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || !open) return null;

  const heading =
    step === 'form'
      ? PROPOSE_COPY.formTitle
      : step === 'match'
        ? PROPOSE_COPY.matchTitle
        : PROPOSE_COPY.pendingMerci;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] h-dvh min-h-dvh"
      role="presentation"
      data-propose-flow={step}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer"
        className="absolute inset-0 bg-[#2C241B]/30"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[#E4D9CC] shadow-xl md:inset-y-4 md:left-auto md:right-4 md:max-h-[calc(100dvh-2rem)] md:max-w-md md:rounded-3xl"
        style={{
          backgroundColor: PROPOSE_COLORS.cream,
          color: PROPOSE_COLORS.ink,
        }}
      >
        <div className="shrink-0 px-5 pt-3">
          <Grabber />
          <h2
            id={titleId}
            className={
              step === 'pending'
                ? 'font-display text-3xl'
                : 'font-display text-xl sm:text-2xl'
            }
            style={{
              color:
                step === 'pending'
                  ? PROPOSE_COLORS.terracotta
                  : PROPOSE_COLORS.ink,
            }}
          >
            {heading}
          </h2>
          {step === 'form' ? (
            <div
              aria-hidden
              className="mt-2 h-0.5 w-10 rounded-full"
              style={{ backgroundColor: PROPOSE_COLORS.terracotta }}
            />
          ) : null}
          {step === 'match' ? (
            <p className="mt-1.5 text-sm" style={{ color: PROPOSE_COLORS.ink }}>
              Vérifions ensemble pour affiner nos suggestions.
            </p>
          ) : null}
          {step === 'pending' ? (
            <p className="mt-2 text-sm leading-relaxed" style={{ color: PROPOSE_COLORS.ink }}>
              {PROPOSE_COPY.pendingVerify}
            </p>
          ) : null}
        </div>

        {step === 'form' ? (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => void handleSubmit(e)}
            noValidate
          >
            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
              <div>
                <label className={LABEL} htmlFor="propose-title" style={{ color: PROPOSE_COLORS.ink }}>
                  Titre *
                </label>
                <div className="relative">
                  <input
                    id="propose-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={FIELD + ' pr-9'}
                    style={{ borderColor: errors.title ? PROPOSE_COLORS.terracotta : '#E4D9CC' }}
                    autoComplete="off"
                  />
                  {title ? (
                    <button
                      type="button"
                      aria-label="Effacer le titre"
                      className="absolute inset-y-0 right-2 text-stone-400 hover:text-stone-600"
                      onClick={() => setTitle('')}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                {errors.title ? (
                  <p className="mt-1 text-xs" style={{ color: PROPOSE_COLORS.terracotta }}>
                    {errors.title}
                  </p>
                ) : null}
              </div>

              <div>
                <label className={LABEL} htmlFor="propose-venue" style={{ color: PROPOSE_COLORS.ink }}>
                  Lieu *
                </label>
                <div className="relative">
                  <input
                    id="propose-venue"
                    list={listId}
                    value={venueName}
                    onChange={(e) => applyVenueLabel(e.target.value)}
                    className={FIELD + ' pr-9'}
                    style={{
                      borderColor: errors.venue_name
                        ? PROPOSE_COLORS.terracotta
                        : '#E4D9CC',
                    }}
                    autoComplete="off"
                  />
                  <FieldIcon>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </FieldIcon>
                  <datalist id={listId}>
                    {venueOptions.map((v) => (
                      <option key={v.id} value={v.label} />
                    ))}
                  </datalist>
                </div>
                <p className="mt-1 text-xs leading-snug text-stone-500">
                  {PROPOSE_COPY.lieuHelper}
                </p>
                {errors.venue_name ? (
                  <p className="mt-1 text-xs" style={{ color: PROPOSE_COLORS.terracotta }}>
                    {errors.venue_name}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <label className={LABEL} htmlFor="propose-date" style={{ color: PROPOSE_COLORS.ink }}>
                    Date *
                  </label>
                  <div className="relative">
                    <input
                      id="propose-date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={FIELD + ' pr-3'}
                      style={{
                        borderColor: errors.date
                          ? PROPOSE_COLORS.terracotta
                          : '#E4D9CC',
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className={LABEL} htmlFor="propose-time" style={{ color: PROPOSE_COLORS.ink }}>
                    Heure
                  </label>
                  <input
                    id="propose-time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={FIELD + ' w-[7.5rem]'}
                    style={{ borderColor: '#E4D9CC' }}
                  />
                </div>
              </div>
              {errors.date ? (
                <p className="-mt-2 text-xs" style={{ color: PROPOSE_COLORS.terracotta }}>
                  {errors.date}
                </p>
              ) : null}

              <div>
                <label className={LABEL} htmlFor="propose-url" style={{ color: PROPOSE_COLORS.ink }}>
                  Lien de la prog (optionnel)
                </label>
                <div className="relative">
                  <input
                    id="propose-url"
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    value={urlUser}
                    onChange={(e) => setUrlUser(e.target.value)}
                    className={FIELD + ' pr-9'}
                    style={{
                      borderColor: errors.url_user
                        ? PROPOSE_COLORS.terracotta
                        : '#E4D9CC',
                    }}
                  />
                  <FieldIcon>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M10 14a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 6.93M14 10a5 5 0 0 0-7.07 0L5.5 11.42a5 5 0 0 0 7.07 7.07L14 17.07"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </FieldIcon>
                </div>
                {errors.url_user ? (
                  <p className="mt-1 text-xs" style={{ color: PROPOSE_COLORS.terracotta }}>
                    {errors.url_user}
                  </p>
                ) : null}
              </div>
              {formError ? (
                <p className="text-sm" style={{ color: PROPOSE_COLORS.terracotta }} role="alert">
                  {formError}
                </p>
              ) : null}
            </div>

            <div
              className="sticky bottom-0 flex gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              style={{
                backgroundColor: PROPOSE_COLORS.cream,
                borderColor: '#E4D9CC',
              }}
            >
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: PROPOSE_COLORS.terracotta }}
              >
                Envoyer
                <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="min-h-11 rounded-full border-2 px-4 text-sm font-semibold"
                style={{
                  borderColor: PROPOSE_COLORS.ink,
                  color: PROPOSE_COLORS.ink,
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        ) : null}

        {step === 'match' && match ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <article
                className="flex gap-3 rounded-2xl border bg-white p-3"
                style={{ borderColor: '#E4D9CC' }}
              >
                <div
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-xl"
                  style={{ backgroundColor: '#EDE4D8' }}
                >
                  {match.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={match.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-stone-400">
                      ◇
                    </div>
                  )}
                </div>
                <div className="min-w-0 text-left">
                  <p className="font-display text-base font-semibold" style={{ color: PROPOSE_COLORS.ink }}>
                    {match.title}
                  </p>
                  <p className="mt-1 flex items-start gap-1 text-sm text-stone-600">
                    <span aria-hidden>📍</span>
                    <span>{match.venue_name}</span>
                  </p>
                  <p className="mt-0.5 flex items-start gap-1 text-sm text-stone-600">
                    <span aria-hidden>📅</span>
                    <span>{formatProposePreviewWhen(match.date, match.time)}</span>
                  </p>
                </div>
              </article>
            </div>
            <div
              className="sticky bottom-0 space-y-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              style={{
                backgroundColor: PROPOSE_COLORS.cream,
                borderColor: '#E4D9CC',
              }}
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmMatch(true)}
                className="flex min-h-11 w-full items-center justify-center rounded-full text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: PROPOSE_COLORS.terracotta }}
              >
                {PROPOSE_COPY.matchYes}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmMatch(false)}
                className="flex min-h-11 w-full items-center justify-center rounded-full border-2 text-sm font-semibold disabled:opacity-60"
                style={{
                  borderColor: PROPOSE_COLORS.ink,
                  color: PROPOSE_COLORS.ink,
                }}
              >
                {PROPOSE_COPY.matchNo}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'pending' ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 py-5">
            <div
              className="rounded-2xl border bg-white p-4 text-left"
              style={{ borderColor: '#E4D9CC' }}
              role="status"
            >
              <p
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: PROPOSE_COLORS.terracotta }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full border"
                  style={{ borderColor: PROPOSE_COLORS.terracotta }}
                  aria-hidden
                >
                  ⏱
                </span>
                {PROPOSE_COPY.pendingBadge}
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: PROPOSE_COLORS.ink }}>
                {PROPOSE_COPY.pendingBody}
              </p>
              <div className="my-3 h-px" style={{ backgroundColor: '#E4D9CC' }} />
              <button
                type="button"
                onClick={onClose}
                className="flex w-full items-center justify-between text-sm font-medium"
                style={{ color: PROPOSE_COLORS.terracotta }}
              >
                <span>Voir mon agenda</span>
                <span aria-hidden>›</span>
              </button>
            </div>
            <p className="mt-auto pt-6 text-center text-xs" style={{ color: PROPOSE_COLORS.ink }}>
              Votre participation tisse des ponts culturels.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 min-h-10 text-sm font-medium underline-offset-2 hover:underline"
              style={{ color: PROPOSE_COLORS.terracotta }}
            >
              Retour
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
