'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useTastesUi } from './Providers';
import MailIdeasCheckbox from './MailIdeasCheckbox';
import { LOGIN_NUDGE_DISMISS_KEY as DISMISS_KEY } from '@/lib/signals';


/** Soft, dismissible invite to sign in — guests only, when Google auth is on. */
export default function LoginNudge() {
  const { data: session, status } = useSession();
  const { googleAuthEnabled } = useTastesUi();
  const [dismissed, setDismissed] = useState(true); // avoid flash before sessionStorage read
  const [providersOk, setProvidersOk] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/providers')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setProvidersOk(Boolean(data && data.google));
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

  if (status === 'loading' || session?.user || !enabled || dismissed) {
    return null;
  }

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <aside
      className="rounded-2xl border border-culture-sand bg-culture-surface/90 px-4 py-5 shadow-sm sm:px-6 sm:py-6"
      aria-label="Invitation à se connecter"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 text-left">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-culture-terracotta">
            Suggestions perso
          </p>
          <h2 className="mt-1 font-display text-lg text-culture-ink sm:text-xl">
            Connecte-toi, on te simplifie la recherche
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-culture-muted">
            En 10&nbsp;secondes avec Google. Dis ce que tu aimes, on te suggère
            des sorties Pour toi. Tes goûts restent entre toi et le site.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <MailIdeasCheckbox className="flex items-start gap-1.5 text-left text-xs leading-snug text-culture-ink sm:text-right" />
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-culture-clay"
          >
            Continuer avec Google
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-culture-muted underline-offset-2 hover:text-culture-ink hover:underline"
          >
            Plus tard
          </button>
        </div>
      </div>
    </aside>
  );
}
