'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { signIn, useSession } from 'next-auth/react';
import { unreadBadgeLabel } from '@/lib/shareActivity';
import {
  GUEST_TEASER_LATER,
  GUEST_TEASER_LOGIN,
  GUEST_TEASER_SHEET_SUB,
  guestTeaserCopy,
  guestTeaserShouldShow,
  guestTeaserTitle,
  readGuestCreatedTokens,
  sumGuestTeaserReactions,
} from '@/lib/guestShareTeaser';

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 text-culture-ink"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1.1-.6 1.4L4 17h5" />
      <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

async function fetchTokenReactions(token: string): Promise<{
  envie: number;
  going: number;
} | null> {
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(token)}/social`, {
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { envie?: unknown; going?: unknown };
    return {
      envie: Number(data.envie) || 0,
      going: Number(data.going) || 0,
    };
  } catch {
    return null;
  }
}

export default function GuestTeaserBell() {
  const { status } = useSession();
  const signedIn = status === 'authenticated';
  const [tokens, setTokens] = useState<string[]>([]);
  const [reactions, setReactions] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (signedIn || status === 'loading') {
      setTokens([]);
      setReactions(0);
      return;
    }
    const mine = readGuestCreatedTokens();
    setTokens(mine);
    if (mine.length === 0) {
      setReactions(0);
      return;
    }
    const rows = await Promise.all(mine.map(fetchTokenReactions));
    setReactions(sumGuestTeaserReactions(rows));
  }, [signedIn, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!guestTeaserShouldShow({ signedIn, tokens, reactions })) return null;

  const badge = unreadBadgeLabel(reactions);
  const title = guestTeaserTitle(reactions);
  const aria = `${badge || reactions} notifications`;

  const sheet =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[110] h-dvh min-h-dvh" role="presentation">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Fermer"
              className="absolute inset-0 bg-transparent"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              data-testid="guest-teaser-sheet"
              className="absolute inset-x-0 bottom-0 max-h-[42%] w-full rounded-t-2xl bg-white px-4 pb-4 pt-3 shadow-[0_-8px_28px_rgba(0,0,0,.18)] sm:inset-x-auto sm:left-1/2 sm:max-w-[420px] sm:-translate-x-1/2"
            >
              <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-culture-line" />
              <h2 className="text-center text-[15px] font-semibold text-culture-ink">
                {title}
              </h2>
              <p className="mt-1.5 text-center text-[13px] leading-snug text-culture-muted">
                {GUEST_TEASER_SHEET_SUB}
              </p>
              <p className="sr-only">{guestTeaserCopy(reactions)}</p>
              <button
                type="button"
                data-testid="guest-teaser-login"
                onClick={() => signIn('google', { callbackUrl: '/' })}
                className="mt-3 w-full rounded-full bg-culture-terracotta px-4 py-3 text-sm font-bold text-white hover:bg-culture-clay"
              >
                {GUEST_TEASER_LOGIN}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-1 w-full bg-transparent py-2 text-xs text-culture-muted"
              >
                {GUEST_TEASER_LATER}
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={aria}
        data-testid="guest-teaser-bell"
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-culture-line bg-white"
      >
        <BellIcon />
        {badge ? (
          <span
            data-testid="guest-teaser-badge"
            className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-culture-terracotta px-1 text-[10px] font-bold text-white"
          >
            {badge}
          </span>
        ) : null}
      </button>
      {sheet}
    </>
  );
}
