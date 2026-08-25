'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useTastesUi } from './Providers';
import { useSignals } from './SignalsProvider';

export default function AuthButtons() {
  const { data: session, status } = useSession();
  const { googleAuthEnabled } = useTastesUi();
  const { loginNudgeReady, loginNudgeDismissed, dismissLoginNudge } = useSignals();
  const [providersOk, setProvidersOk] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const showRemember = loginNudgeReady && !loginNudgeDismissed;

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

  const enabled =
    providersOk === true || (providersOk === null && googleAuthEnabled);

  if (status === 'loading') {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center text-xs text-culture-muted sm:h-auto sm:w-auto">
        …
      </span>
    );
  }

  if (session?.user) {
    const name = session.user.name?.split(' ')[0] || 'Toi';
    const image = session.user.image;
    const initial = name.slice(0, 1).toUpperCase();
    function AvatarFace() {
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

    return (
      <>
        <div className="relative sm:hidden" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Menu compte"
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-culture-line bg-white"
          >
            <AvatarFace />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 min-w-[10.5rem] overflow-hidden rounded-xl border border-culture-sand bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="block w-full px-3 py-2 text-left text-sm font-medium text-culture-muted hover:bg-culture-soft hover:text-culture-ink"
              >
                Déconnexion
              </button>
            </div>
          ) : null}
        </div>
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex h-7 w-7 shrink-0 overflow-hidden rounded-full border border-culture-line">
              <AvatarFace />
            </span>
            <span className="max-w-[7rem] truncate text-sm text-culture-ink">
              {name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/' })}
            className="shrink-0 rounded-full border border-culture-sand bg-white px-3 py-1.5 text-sm font-medium text-culture-muted hover:text-culture-ink"
          >
            Déconnexion
          </button>
        </div>
      </>
    );
  }

  if (!enabled) {
    return (
      <p className="max-w-[6.5rem] text-right text-[10px] leading-snug text-culture-muted sm:max-w-none sm:text-xs">
        Connexion Google bientôt disponible
      </p>
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
      <div className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        title="Se connecter avec Google"
        aria-label="Se connecter avec Google"
        onClick={() => signIn('google', { callbackUrl: '/' })}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-culture-terracotta text-white shadow-sm transition hover:bg-culture-clay sm:h-auto sm:w-auto sm:px-4 sm:py-1.5 sm:text-sm sm:font-semibold"
      >
        <svg
          className="h-4 w-4 sm:hidden"
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
        <span className="hidden sm:inline">Se connecter avec Google</span>
      </button>
      <span className="hidden text-[10px] leading-none text-culture-muted sm:inline">
        Pour des suggestions perso
      </span>
      </div>
    </div>
  );
}
