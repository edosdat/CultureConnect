'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import {
  normalizeShareToken,
  shareVisitStorageKey,
} from '@/lib/shareToken';

type ShareVisitValue = {
  seanceKey: string | null;
  itemKey: string | null;
};

const ShareVisitContext = createContext<ShareVisitValue>({
  seanceKey: null,
  itemKey: null,
});

export function useShareVisit() {
  return useContext(ShareVisitContext);
}

export default function ShareVisitProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [value, setValue] = useState<ShareVisitValue>({
    seanceKey: null,
    itemKey: null,
  });

  useEffect(() => {
    if (status === 'loading') return;
    const token = normalizeShareToken(
      new URLSearchParams(window.location.search).get('t') || '',
    );
    if (!token) return;
    const storageKey = shareVisitStorageKey(token);
    const seanceCache = `${storageKey}:seance`;
    const itemCache = `${storageKey}:item`;
    try {
      if (sessionStorage.getItem(storageKey) === '1') {
        setValue({
          seanceKey: normalizeDeepLinkId(sessionStorage.getItem(seanceCache) || ''),
          itemKey: normalizeDeepLinkId(sessionStorage.getItem(itemCache) || ''),
        });
        return;
      }
      sessionStorage.setItem(storageKey, '1');
    } catch {
      /* still POST once */
    }
    void fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ kind: 'visit', token }),
    })
      .then(async (res) => {
        if (res.status === 204 || !res.ok) return;
        const data = (await res.json()) as {
          seanceKey?: string;
          itemKey?: string;
        };
        const seanceKey = normalizeDeepLinkId(data.seanceKey || '');
        const itemKey = normalizeDeepLinkId(data.itemKey || '');
        try {
          if (seanceKey) sessionStorage.setItem(seanceCache, seanceKey);
          if (itemKey) sessionStorage.setItem(itemCache, itemKey);
        } catch {
          /* ignore */
        }
        setValue({ seanceKey, itemKey });
      })
      .catch(() => {
        /* never break the fiche */
      });
  }, [status]);

  return (
    <ShareVisitContext.Provider value={value}>{children}</ShareVisitContext.Provider>
  );
}
