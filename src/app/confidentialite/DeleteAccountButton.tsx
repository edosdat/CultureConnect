'use client';

import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { clearGuestStore, notifySignalsChanged } from '@/lib/signalsStore';
import { clearMailIdeasCookie } from '@/lib/mailConsent';

export default function DeleteAccountButton() {
  const { data: session, status } = useSession();
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (deleting) return;
    if (
      !window.confirm(
        'Supprimer ton compte et tes goûts enregistrés ? Cette action est définitive.',
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch('/api/account-tastes', { method: 'DELETE' });
      if (!res.ok) {
        setDeleting(false);
        return;
      }
      clearGuestStore();
      clearMailIdeasCookie();
      notifySignalsChanged();
      await signOut({ callbackUrl: '/' });
    } catch {
      setDeleting(false);
    }
  }

  if (status === 'loading') {
    return null;
  }

  if (!session?.user) {
    return (
      <p className="mt-6 text-sm text-culture-muted">
        Connecte-toi pour tout effacer
      </p>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={deleting}
        onClick={() => void handleDeleteAccount()}
        className="inline-flex h-9 items-center rounded-full border border-culture-terracotta/50 bg-white px-4 text-sm font-medium text-culture-terracotta transition hover:border-culture-terracotta hover:bg-culture-terracotta/10 disabled:opacity-50"
      >
        {deleting ? 'Suppression…' : 'Supprimer mon compte'}
      </button>
    </div>
  );
}
