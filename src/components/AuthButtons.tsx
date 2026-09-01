'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { requestOpenTastes, useTastesUi } from './Providers';
import { useSignals } from './SignalsProvider';
import MailIdeasCheckbox from './MailIdeasCheckbox';

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
    <span className="flex h-full w-full items-center justify-center rounded-full bg-culture-terracotta/15 text-xs font-semibold text-culture-terracotta">
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

  function openSheet(e?: { stopPropagation?: () => void; preventDefault?: () => void }) {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    setMenuOpen(false);
    openTastes();
    requestOpenTastes();
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
        className="relative z-[80] flex shrink-0 items-center gap-1.5 overflow-visible"
        ref={menuRef}
      >
        <button
          type="button"
          onPointerDown={openSheet}
          onClick={openSheet}
          data-account-control="mes-gouts"
          aria-label="Mes goûts"
          className="shrink-0 rounded-full bg-culture-terracotta px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-culture-clay sm:px-3 sm:text-sm"
        >
          Mes goûts
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Menu compte"
          data-account-control="signed-in"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-auto sm:w-auto sm:gap-1.5"
        >
          <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-culture-line bg-white sm:h-7 sm:w-7">
            <AvatarFace image={image} initial={initial} />
          </span>
          <span className="hidden max-w-[7rem] truncate text-sm text-culture-ink sm:inline">
            {name}
          </span>
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-[80] mt-1 min-w-[14rem] overflow-hidden rounded-xl border-[1.5px] border-culture-line bg-culture-cream py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onPointerDown={openSheet}
              onClick={openSheet}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-culture-ink hover:bg-white"
            >
              Mes goûts
            </button>
            <div className="px-3 py-2">
              <MailIdeasCheckbox className="flex items-start gap-1.5 text-left text-xs leading-snug text-culture-ink" />
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void signOut({ callbackUrl: '/' });
              }}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-culture-ink hover:bg-white"
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
      <button
        type="button"
        onPointerDown={openSheet}
        onClick={openSheet}
        data-account-control="mes-gouts-pending"
        aria-label="Mes goûts"
        className="shrink-0 rounded-full bg-culture-terracotta px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-culture-clay"
      >
        Mes goûts
      </button>
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
        <MailIdeasCheckbox className="hidden max-w-[10.5rem] items-start gap-1.5 text-left text-[10px] leading-snug text-culture-ink sm:flex" />
        <button
          type="button"
          title="Connecte-toi pour tes suggestions"
          aria-label="Connecte-toi pour tes suggestions"
          data-account-control="login"
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-culture-terracotta text-white shadow-sm transition hover:bg-culture-clay sm:h-auto sm:w-auto sm:px-4 sm:py-1.5 sm:text-sm sm:font-semibold"
        >
          <PersonIcon className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline">Connecte-toi pour tes suggestions</span>
        </button>
      </div>
    </div>
  );
}
