'use client';

import { PROPOSE_COLORS, PROPOSE_COPY } from '@/lib/eventProposal';

type SessionKind = 'loading' | 'authenticated' | 'unauthenticated';

type Props = {
  query: string;
  sessionStatus: SessionKind;
  onPropose: () => void;
  onLogin: () => void;
};

function CalendarPlusIcon() {
  return (
    <svg
      className="h-10 w-10"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
    >
      <rect
        x="6"
        y="9"
        width="22"
        height="20"
        rx="3"
        stroke={PROPOSE_COLORS.terracotta}
        strokeWidth="1.8"
      />
      <path
        d="M6 15h22M13 6.5v5M21 6.5v5"
        stroke={PROPOSE_COLORS.terracotta}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="29" cy="29" r="7" fill={PROPOSE_COLORS.cream} />
      <circle
        cx="29"
        cy="29"
        r="6.2"
        stroke={PROPOSE_COLORS.terracotta}
        strokeWidth="1.6"
      />
      <path
        d="M29 26v6M26 29h6"
        stroke={PROPOSE_COLORS.terracotta}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="white" fillOpacity="0.2" />
      <circle cx="10" cy="10" r="8.2" stroke="white" strokeWidth="1.4" />
      <path
        d="M10 6.2v7.6M6.2 10h7.6"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpeechIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 3.5h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 13 11.5H8l-3.2 2.2V11.5H3A1.5 1.5 0 0 1 1.5 10V5A1.5 1.5 0 0 1 3 3.5Z"
        stroke={PROPOSE_COLORS.terracotta}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ProposeEventEmpty({
  query,
  sessionStatus,
  onPropose,
  onLogin,
}: Props) {
  const q = query.trim();
  const signedIn = sessionStatus === 'authenticated';
  const guest = sessionStatus === 'unauthenticated';

  return (
    <section
      data-propose-empty=""
      aria-label={PROPOSE_COPY.emptyTitle}
      className="rounded-2xl border px-5 py-8 text-center sm:px-8 sm:py-10"
      style={{
        backgroundColor: PROPOSE_COLORS.cream,
        borderColor: '#E4D9CC',
        color: PROPOSE_COLORS.ink,
      }}
    >
      <div className="mx-auto flex justify-center">
        <CalendarPlusIcon />
      </div>
      <h2
        className="mt-4 font-display text-xl font-semibold sm:text-2xl"
        style={{ color: PROPOSE_COLORS.ink }}
      >
        {PROPOSE_COPY.emptyTitle}
      </h2>
      {q ? (
        <p className="sr-only">Aucun résultat pour « {q} »</p>
      ) : null}
      <p
        className="mx-auto mt-2 max-w-sm text-sm leading-relaxed sm:text-[15px]"
        style={{ color: PROPOSE_COLORS.ink }}
      >
        {PROPOSE_COPY.emptyBody}
      </p>
      <div className="mt-6">
        {signedIn || sessionStatus === 'loading' ? (
          <button
            type="button"
            data-propose-cta="connected"
            onClick={onPropose}
            disabled={sessionStatus === 'loading'}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
            style={{ backgroundColor: PROPOSE_COLORS.terracotta }}
          >
            <PlusCircleIcon />
            {PROPOSE_COPY.emptyCta}
          </button>
        ) : null}
        {guest ? (
          <button
            type="button"
            data-propose-cta="guest"
            onClick={onLogin}
            className="inline-flex min-h-11 items-center justify-center rounded-full border-2 bg-transparent px-5 py-2.5 text-sm font-semibold transition hover:bg-white/60"
            style={{
              borderColor: PROPOSE_COLORS.terracotta,
              color: PROPOSE_COLORS.terracotta,
            }}
          >
            {PROPOSE_COPY.emptyGuestCta}
          </button>
        ) : null}
      </div>
      <p
        className="mt-4 flex items-center justify-center gap-1.5 text-xs leading-snug sm:text-sm"
        style={{ color: PROPOSE_COLORS.ink }}
      >
        <SpeechIcon />
        <span>{PROPOSE_COPY.emptyHelp}</span>
      </p>
    </section>
  );
}
