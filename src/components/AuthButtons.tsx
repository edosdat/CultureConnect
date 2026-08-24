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
      <span className="hidden text-xs text-culture-muted sm:inline">…</span>
    );
  }

  if (session?.user) {
    const name = session.user.name?.split(' ')[0] || 'Toi';
    const image = session.user.image;
    return (
      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
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
      <p className="ml-auto max-w-[11rem] text-right text-[11px] leading-snug text-culture-muted sm:max-w-none sm:text-xs">
        Connexion Google bientôt disponible
      </p>
    );
  }

  return (
    <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        title="Pour des suggestions perso"
        onClick={() => signIn('google', { callbackUrl: '/' })}
        className="rounded-full bg-culture-terracotta px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-culture-clay sm:px-4 sm:text-sm"
      >
        Se connecter avec Google
      </button>
      <span className="hidden text-[10px] leading-none text-culture-muted sm:inline">
        Pour des suggestions perso
      </span>
    </div>
  );
}
