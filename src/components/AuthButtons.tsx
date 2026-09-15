'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useTastesUi } from './Providers';
import { requestOpenTastes } from './tastesUiEvents';
import { useSignals } from './SignalsProvider';
import MailIdeasCheckbox from './MailIdeasCheckbox';
import ActivityInbox from './ActivityInbox';
import GuestTeaserBell from './GuestTeaserBell';
import { showHomeEventsCounter } from '@/lib/homeEventsCounter';

const AUTH_HINT_KEY = 'cc_auth_hint';

function readAuthHint(): 'in' | 'out' | null {
  try {
    const v = sessionStorage.getItem(AUTH_HINT_KEY);
    if (v === 'in' || v === 'out') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeAuthHint(v: 'in' | 'out') {
  try {
    sessionStorage.setItem(AUTH_HINT_KEY, v);
  } catch {
    /* ignore */
  }
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-4 w-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function AvatarFace({
  image,
  initial,
}: {
  image?: string | null;
  initial: string;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className="h-full w-full rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-full w-full items-center justify-center rounded-full bg-culture-ink text-xs font-bold text-white">
      {initial}
    </span>
  );
}

export default function AuthButtons() {
  const { data: session, status } = useSession();
  const { googleAuthEnabled, openTastes } = useTastesUi();
  const { loginNudgeReady, loginNudgeDismissed, dismissLoginNudge } = useSignals();
  const [providersOk, setProvidersOk] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hint, setHint] = useState<'in' | 'out' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const showRemember = loginNudgeReady && !loginNudgeDismissed;

  useEffect(() => {
    setHint(readAuthHint());
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      writeAuthHint('in');
      setHint('in');
    }
    if (status === 'unauthenticated') {
      writeAuthHint('out');
      setHint('out');
    }
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/providers')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setProvidersOk(Boolean(data && data.google));
      })
      .catch(() => {
        if (!cancelled) setProvidersOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  /** Keep the menu mounted through pointerdown so click can still fire. */
  function holdMenu(e: { stopPropagation: () => void }) {
    e.stopPropagation();
  }

  /**
   * Open the tastes overlay on *click only*.
   * Opening on pointerdown (31cae3a) mounted the dialog before this click
   * finished; the leftover click hit the new backdrop and closed it (0 dialog).
   * Overlay state lives on TastesOverlayHost, not in this menu.
   */
  function openSheetFromClick(e: { stopPropagation: () => void; preventDefault: () => void }) {
    e.stopPropagation();
    e.preventDefault();
    openTastes();
    requestOpenTastes();
    window.setTimeout(() => setMenuOpen(false), 0);
  }

  const enabled =
    providersOk === true || (providersOk === null && googleAuthEnabled);

  const user = session?.user;
  const treatAsSignedIn = Boolean(user) || (status === 'loading' && hint === 'in');
  const treatAsGuest =
    status === 'unauthenticated' || (status === 'loading' && hint === 'out');

  if (treatAsSignedIn) {
    const name = user?.name?.split(' ')[0] || 'Toi';
    const image = user?.image;
    const initial = name.slice(0, 1).toUpperCase();
    return (
      <div
        className="relative z-[80] flex shrink-0 items-center gap-2 overflow-visible"
        ref={menuRef}
      >
        <ActivityInbox />
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Menu compte"
          data-account-control="signed-in"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full sm:h-auto sm:w-auto sm:gap-1.5"
        >
          <span className="flex h-[34px] w-[34px] shrink-0 overflow-hidden rounded-full sm:h-7 sm:w-7">
            <AvatarFace image={image} initial={initial} />
          </span>
          <span className="hidden max-w-[7rem] truncate text-sm text-culture-ink sm:inline">
            {name}
          </span>
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-[90] mt-1 min-w-[10rem] overflow-hidden rounded-[10px] border border-culture-line bg-white py-1.5 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              data-account-control="mes-gouts-menu"
              onPointerDown={holdMenu}
              onClick={openSheetFromClick}
              className="block w-full bg-culture-cream px-3 py-2 text-left text-[13px] font-semibold text-culture-ink hover:bg-culture-sand"
            >
              Mes goûts
            </button>
            {showHomeEventsCounter(user?.email) ? (
              <Link
                href="/admin/analytics"
                role="menuitem"
                data-account-control="admin-analytics"
                className="block w-full px-3 py-2 text-left text-[13px] text-culture-ink hover:bg-culture-cream"
              >
                Analytics
              </Link>
            ) : null}
            <div className="px-3 py-2">
              <MailIdeasCheckbox className="flex items-start gap-1.5 text-left text-xs leading-snug text-culture-ink" />
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void signOut({ callbackUrl: '/' });
              }}
              className="block w-full px-3 py-2 text-left text-[13px] text-culture-ink hover:bg-culture-cream"
            >
              Déconnexion
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (status === 'loading' && !treatAsGuest) {
    return (
      <span
        data-account-control="avatar-pending"
        aria-hidden
        className="flex h-9 w-9 shrink-0 animate-pulse overflow-hidden rounded-full border border-culture-line bg-culture-sand/70"
      />
    );
  }

  if (!enabled) {
    return (
      <button
        type="button"
        data-account-control="guest-disabled"
        aria-label="Connexion bientôt disponible"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-culture-line bg-white text-culture-muted"
        disabled
      >
        <PersonIcon />
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      {showRemember ? (
        <span className="flex max-w-[7.5rem] items-center gap-0.5 sm:max-w-none">
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="text-left text-[10px] font-medium leading-tight text-culture-terracotta hover:underline sm:text-xs"
          >
            On retient ça&nbsp;?
          </button>
          <button
            type="button"
            onClick={dismissLoginNudge}
            className="px-0.5 text-xs leading-none text-culture-muted hover:text-culture-ink"
            aria-label="Fermer"
          >
            ×
          </button>
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-2">
        <GuestTeaserBell />
        <MailIdeasCheckbox className="hidden max-w-[10.5rem] items-start gap-1.5 text-left text-[10px] leading-snug text-culture-ink sm:flex" />
        <button
          type="button"
          title="Connecte-toi"
          aria-label="Connecte-toi"
          data-account-control="login"
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="shrink-0 rounded-full bg-culture-terracotta px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-culture-clay sm:px-4 sm:py-1.5 sm:text-sm"
        >
          Connecte-toi
        </button>
      </div>
    </div>
  );
}
