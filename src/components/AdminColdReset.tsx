'use client';

import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import {
  COLD_RESET_CONFIRM,
  COLD_RESET_LABEL,
  COLD_RESET_NOTE,
} from '@/lib/coldReset';
import { clearPlanCClientCold } from '@/lib/coldResetClient';
import { showHomeEventsCounter } from '@/lib/homeEventsCounter';

/**
 * Admin chrome. The layout already 404s other sessions; this hides the
 * control unless the session email is in `ADMIN_EMAILS`.
 * Cookie deletes run before `signOut`: `cc_vid` is HttpOnly and the route
 * refuses once the admin session is gone.
 */
export default function AdminColdReset() {
  const { data: session, status } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed =
    status === 'authenticated' &&
    showHomeEventsCounter(session?.user?.email);

  async function onReset() {
    if (busy || !allowed) return;
    if (!window.confirm(COLD_RESET_CONFIRM)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/cold-reset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        setError('Le reset n’a pas abouti. Réessaie.');
        setBusy(false);
        return;
      }
      clearPlanCClientCold();
      await signOut({ callbackUrl: '/' });
    } catch {
      setError('Le reset n’a pas abouti. Réessaie.');
      setBusy(false);
    }
  }

  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
      <section
        className="rounded-2xl border border-culture-line bg-white px-4 py-3"
        aria-labelledby="cold-reset-title"
      >
        <h2
          id="cold-reset-title"
          className="text-sm font-semibold text-culture-ink"
        >
          Appareil
        </h2>
        <p id="cold-reset-note" className="mt-1 text-xs text-culture-muted">
          {COLD_RESET_NOTE}
        </p>
        <button
          type="button"
          data-admin-control="cold-reset"
          disabled={busy}
          aria-describedby="cold-reset-note"
          onClick={() => void onReset()}
          className="mt-3 inline-flex h-9 items-center rounded-full border border-culture-terracotta/50 bg-white px-4 text-sm font-medium text-culture-terracotta transition hover:border-culture-terracotta hover:bg-culture-terracotta/10 disabled:opacity-50"
        >
          {busy ? 'Reset en cours…' : COLD_RESET_LABEL}
        </button>
        {error ? (
          <p className="mt-2 text-sm text-culture-terracotta" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
