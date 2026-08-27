'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MAIL_IDEAS_LABEL, writeMailIdeasCookie } from '@/lib/mailConsent';

export default function FirstLoginModal() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [opted, setOpted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) {
      setOpen(false);
      return;
    }
    let cancelled = false;
    fetch('/api/mail-consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { seen?: unknown } | null) => {
        if (cancelled) return;
        if (d?.seen === true) {
          setOpen(false);
          return;
        }
        setOpted(false);
        setOpen(true);
      })
      .catch(() => {
        if (!cancelled) setOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, session?.user]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    const patch: { seen: true; opted?: boolean } = { seen: true };
    if (opted) {
      patch.opted = true;
      writeMailIdeasCookie(true);
    }
    try {
      await fetch('/api/mail-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      /* still close — they read */
    }
    setOpen(false);
    setBusy(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-culture-ink/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-culture-sand bg-culture-cream p-5 shadow-xl sm:rounded-3xl sm:p-6">
        <h2
          id="welcome-title"
          className="font-display text-2xl text-culture-ink"
        >
          On te dit tout, une fois.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-culture-ink">
          CultureConnect, c’est l’agenda des sorties à Toulouse. Tu te
          connectes, on retient tes goûts pour te proposer des idées. On ne
          revend rien.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-culture-ink">
          Cookies : session + goûts 14j si pas de compte.{' '}
          <Link
            href="/confidentialite"
            className="text-culture-terracotta underline-offset-2 hover:underline"
          >
            Confidentialité
          </Link>
          .
        </p>
        <p className="mt-3 text-sm leading-relaxed text-culture-ink">
          Tes goûts, c’est comme tes places : on les garde pour toi, on ne les
          revend pas à la sortie.
        </p>
        <label className="mt-5 flex items-start gap-2.5 text-sm leading-snug text-culture-ink">
          <input
            type="checkbox"
            checked={opted}
            onChange={(e) => setOpted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-culture-terracotta"
          />
          <span>
            {MAIL_IDEAS_LABEL}. Une fois par semaine, calées sur tes goûts.
            Rien ne part si tu ne coches pas.
          </span>
        </label>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
          className="mt-6 w-full rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-culture-clay disabled:opacity-50"
        >
          C’est bon, j’y vais
        </button>
      </div>
    </div>
  );
}
