'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useTastesUi } from './Providers';

export default function AuthButtons() {
  const { data: session, status } = useSession();
  const { openTastes, googleAuthEnabled } = useTastesUi();
  const [providersOk, setProvidersOk] = useState<boolean | null>(null);

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
    return (
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={openTastes}
          className="shrink-0 rounded-full border border-culture-sand bg-white px-2.5 py-1.5 text-xs font-medium text-culture-ink hover:border-culture-terracotta/50 sm:px-3 sm:text-sm"
        >
          Mes goûts
        </button>
        <div className="flex min-w-0 items-center gap-1.5">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full border border-culture-line object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-culture-terracotta/15 text-xs font-semibold text-culture-terracotta">
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="hidden max-w-[7rem] truncate text-sm text-culture-ink sm:inline">
            {name}
          </span>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="shrink-0 rounded-full border border-culture-sand bg-white px-2.5 py-1.5 text-xs font-medium text-culture-muted hover:text-culture-ink sm:px-3 sm:text-sm"
        >
          Déconnexion
        </button>
      </div>
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
  );
}
