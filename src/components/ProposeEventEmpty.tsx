'use client';

import { PROPOSE_COLORS, PROPOSE_COPY } from '@/lib/eventProposal';

type SessionKind = 'loading' | 'authenticated' | 'unauthenticated';

type Props = {
  query: string;
  sessionStatus: SessionKind;
  onPropose: () => void;
  onLogin: () => void;
};

function CalendarPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-10 w-10'}
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

function SearchGlyph() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="4.2"
        stroke={PROPOSE_COLORS.terracotta}
        strokeWidth="1.4"
      />
      <path
        d="M10.4 10.4 14 14"
        stroke={PROPOSE_COLORS.terracotta}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HeartIcon() {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: '#F3D6CC' }}
      aria-hidden
    >
      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 13.2S2.8 9.6 2.8 6.4A2.7 2.7 0 0 1 8 5.2a2.7 2.7 0 0 1 5.2 1.2C13.2 9.6 8 13.2 8 13.2Z"
          fill={PROPOSE_COLORS.terracotta}
        />
      </svg>
    </span>
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
  const connectedChrome = signedIn || sessionStatus === 'loading';

  return (
    <section
      data-propose-empty={guest ? 'guest' : 'connected'}
      aria-label={PROPOSE_COPY.emptyTitle}
      className="rounded-2xl border px-5 py-6 text-center shadow-sm sm:px-8 sm:py-8"
      style={{
        backgroundColor: '#FFFCF8',
        borderColor: '#E4D9CC',
        color: PROPOSE_COLORS.ink,
      }}
    >
      {guest && q ? (
        <p
          className="mb-4 flex items-center justify-center gap-2 text-left"
          data-propose-query=""
        >
          <SearchGlyph />
          <span
            className="max-w-[min(100%,18rem)] truncate rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: '#F3D6CC',
              color: PROPOSE_COLORS.terracotta,
            }}
            title={q}
          >
            {q}
          </span>
        </p>
      ) : null}

      {connectedChrome ? (
        <div className="flex items-start gap-3 text-left sm:gap-4">
          <div className="shrink-0 pt-0.5">
            <CalendarPlusIcon className="h-9 w-9" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              className="font-display text-xl font-semibold leading-snug sm:text-2xl"
              style={{ color: PROPOSE_COLORS.ink }}
            >
              {PROPOSE_COPY.emptyTitle}
            </h2>
            {q ? (
              <p className="sr-only">Aucun résultat pour « {q} »</p>
            ) : null}
            <p
              className="mt-1.5 text-sm leading-relaxed sm:text-[15px]"
              style={{ color: PROPOSE_COLORS.ink }}
            >
              {PROPOSE_COPY.emptyBody}
            </p>
          </div>
        </div>
      ) : (
        <>
          <h2
            className="font-display text-[1.65rem] font-semibold leading-tight sm:text-3xl"
            style={{ color: PROPOSE_COLORS.terracotta }}
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
        </>
      )}

      <div className={connectedChrome ? 'mt-5 text-left' : 'mt-6'}>
        {connectedChrome ? (
          <button
            type="button"
            data-propose-cta="connected"
            onClick={onPropose}
            disabled={sessionStatus === 'loading'}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60 sm:w-auto"
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
            className="inline-flex min-h-11 w-full max-w-sm items-center justify-center rounded-full border-2 bg-transparent px-5 py-2.5 text-sm font-semibold transition hover:bg-[#F7F1E8] sm:max-w-none"
            style={{
              borderColor: PROPOSE_COLORS.terracotta,
              color: PROPOSE_COLORS.terracotta,
            }}
          >
            {PROPOSE_COPY.emptyGuestCta}
          </button>
        ) : null}
      </div>

      {guest ? (
        <p
          className="mt-4 flex items-center justify-center gap-2 text-xs italic leading-snug sm:text-sm"
          style={{ color: PROPOSE_COLORS.ink }}
        >
          <HeartIcon />
          <span>{PROPOSE_COPY.emptyHelp}</span>
        </p>
      ) : (
        <p
          className="mt-3 text-left text-xs leading-snug sm:text-sm"
          style={{ color: PROPOSE_COLORS.ink }}
        >
          {PROPOSE_COPY.emptyHelp}
        </p>
      )}
    </section>
  );
}
