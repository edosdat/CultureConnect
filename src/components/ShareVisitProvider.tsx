'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import { normalizeShareToken, shareVisitStorageKey } from '@/lib/shareToken';
import type { DayItem } from '@/lib/types';
import { OPEN_FICHE_EVENT, type OpenFicheDetail } from './openFicheEvents';

type ShareVisitValue = {
  seanceKey: string | null;
  itemKey: string | null;
  token: string | null;
  hasShareToken: boolean;
  /** Token séance fetched without commune — may be outside the Toulouse chip. */
  sharedSeanceItem: DayItem | null;
  sharedRelatedItems: DayItem[];
};

const ShareVisitContext = createContext<ShareVisitValue>({
  seanceKey: null,
  itemKey: null,
  token: null,
  hasShareToken: false,
  sharedSeanceItem: null,
  sharedRelatedItems: [],
});

export function useShareVisit() {
  return useContext(ShareVisitContext);
}

function tokenFromLocation(next?: string | null): string | null {
  if (typeof window === 'undefined') return normalizeShareToken(next || '');
  const params = new URLSearchParams(window.location.search);
  return normalizeShareToken(next || params.get('t') || '');
}

export default function ShareVisitProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [token, setToken] = useState<string | null>(() => tokenFromLocation());
  const hasShareToken = Boolean(token);
  const [keys, setKeys] = useState<{
    seanceKey: string | null;
    itemKey: string | null;
  }>({
    seanceKey: null,
    itemKey: null,
  });
  const [sharedSeanceItem, setSharedSeanceItem] = useState<DayItem | null>(null);
  const [sharedRelatedItems, setSharedRelatedItems] = useState<DayItem[]>([]);

  useEffect(() => {
    function syncToken(e?: Event) {
      const fromEvent = (e as CustomEvent<OpenFicheDetail> | undefined)?.detail
        ?.token;
      setToken(tokenFromLocation(fromEvent));
    }
    window.addEventListener(OPEN_FICHE_EVENT, syncToken);
    window.addEventListener('popstate', syncToken);
    return () => {
      window.removeEventListener(OPEN_FICHE_EVENT, syncToken);
      window.removeEventListener('popstate', syncToken);
    };
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    const params = new URLSearchParams(window.location.search);
    const eKey = normalizeDeepLinkId(params.get('e') || params.get('id') || '');
    if (!token) return;
    setKeys((prev) => ({
      seanceKey: prev.seanceKey,
      itemKey: prev.itemKey || eKey,
    }));
    const storageKey = shareVisitStorageKey(token);
    const seanceCache = `${storageKey}:seance`;
    const itemCache = `${storageKey}:item`;
    try {
      const cachedSeance = normalizeDeepLinkId(
        sessionStorage.getItem(seanceCache) || '',
      );
      const cachedItem = normalizeDeepLinkId(
        sessionStorage.getItem(itemCache) || '',
      );
      if (cachedSeance || cachedItem) {
        setKeys({
          seanceKey: cachedSeance,
          itemKey: cachedItem || eKey,
        });
      }
      if (sessionStorage.getItem(storageKey) === '1' && cachedSeance) {
        return;
      }
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
        const itemKey = normalizeDeepLinkId(data.itemKey || '') || eKey;
        try {
          sessionStorage.setItem(storageKey, '1');
          if (seanceKey) sessionStorage.setItem(seanceCache, seanceKey);
          if (itemKey) sessionStorage.setItem(itemCache, itemKey);
        } catch {
          /* ignore */
        }
        setKeys({ seanceKey, itemKey });
      })
      .catch(() => {
        /* never break the fiche */
      });
  }, [status, token]);

  useEffect(() => {
    const key = keys.seanceKey;
    if (!key) {
      setSharedSeanceItem(null);
      setSharedRelatedItems([]);
      return;
    }
    let cancelled = false;
    void fetch(`/api/agenda?id=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { item?: DayItem; relatedItems?: DayItem[] } | null) => {
        if (cancelled || !data?.item) return;
        setSharedSeanceItem(data.item);
        setSharedRelatedItems(data.relatedItems ?? []);
      })
      .catch(() => {
        /* picker still has the opened card */
      });
    return () => {
      cancelled = true;
    };
  }, [keys.seanceKey]);

  const value = useMemo<ShareVisitValue>(
    () => ({
      seanceKey: keys.seanceKey,
      itemKey: keys.itemKey,
      token,
      hasShareToken,
      sharedSeanceItem,
      sharedRelatedItems,
    }),
    [
      keys.seanceKey,
      keys.itemKey,
      token,
      hasShareToken,
      sharedSeanceItem,
      sharedRelatedItems,
    ],
  );

  return (
    <ShareVisitContext.Provider value={value}>{children}</ShareVisitContext.Provider>
  );
}
