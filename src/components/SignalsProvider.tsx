'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import type { DayItem } from '@/lib/types';
import { phraseToTrackPayload } from '@/lib/pourToi';
import {
  LOGIN_NUDGE_DISMISS_KEY,
  emptyGuestStore,
  hasScorableState,
  makeSignal,
  payloadFromDayItem,
  profileHasZeroWeights,
  shouldPromptLogin,
  wipeProfileKey,
  type AccountTasteState,
  type GuestSignalsStore,
  type ProfileBucket,
  type SignalKind,
  type TrackPayload,
} from '@/lib/signals';
import {
  SIGNALS_CHANGED_EVENT,
  addGuestPhraseSignal,
  appendGuestSignal,
  clearGuestStore,
  notifySignalsChanged,
  readGuestStore,
  wipeGuestProfileKey,
} from '@/lib/signalsStore';

type SignalsValue = {
  track: (payload: TrackPayload) => void;
  trackItem: (
    item: DayItem,
    kind: Extract<SignalKind, 'open_card' | 'agenda_add' | 'ics' | 'reserve'>,
  ) => void;
  wipeKey: (bucket: ProfileBucket, key: string) => void;
  addPhrase: (text: string) => void;
  guestStore: GuestSignalsStore;
  tasteState: AccountTasteState | null;
  loginNudgeReady: boolean;
  loginNudgeDismissed: boolean;
  dismissLoginNudge: () => void;
};

const SignalsContext = createContext<SignalsValue>({
  track: () => {},
  trackItem: () => {},
  wipeKey: () => {},
  addPhrase: () => {},
  guestStore: emptyGuestStore(),
  tasteState: null,
  loginNudgeReady: false,
  loginNudgeDismissed: true,
  dismissLoginNudge: () => {},
});

export function useSignals() {
  return useContext(SignalsContext);
}

async function postSignals(body: unknown): Promise<{
  tasteState?: AccountTasteState;
  tastes?: string;
  tastesSetAt?: string;
} | null> {
  const res = await fetch('/api/signals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    tasteState?: AccountTasteState;
    tastes?: string;
    tastesSetAt?: string;
  };
}

export default function SignalsProvider({ children }: { children: ReactNode }) {
  const { data: session, status, update } = useSession();
  const [guestStore, setGuestStore] = useState<GuestSignalsStore>(emptyGuestStore);
  const [dismissed, setDismissed] = useState(true);
  const mergedRef = useRef(false);

  useEffect(() => {
    setGuestStore(readGuestStore());
    try {
      setDismissed(sessionStorage.getItem(LOGIN_NUDGE_DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    function onChange() {
      setGuestStore(readGuestStore());
    }
    window.addEventListener(SIGNALS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(SIGNALS_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      mergedRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;
    if (mergedRef.current) return;
    const guest = readGuestStore();
    const hasZeros = profileHasZeroWeights(guest.profile);
    if (guest.events.length === 0 && !hasZeros) {
      mergedRef.current = true;
      return;
    }
    mergedRef.current = true;
    let cancelled = false;
    (async () => {
      const data = await postSignals({
        signals: guest.events,
        merge: true,
        guestProfile: guest.profile,
      });
      if (cancelled) return;
      if (!data?.tasteState) {
        mergedRef.current = false;
        return;
      }
      clearGuestStore();
      setGuestStore(emptyGuestStore());
      notifySignalsChanged();
      await update({
        tasteState: data.tasteState,
        tastes: data.tastes ?? data.tasteState.tastesText ?? '',
        tastesSetAt: data.tastesSetAt ?? data.tasteState.tastesSetAt,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [status, session?.user, update]);

  const applyAccountTaste = useCallback(
    async (data: {
      tasteState?: AccountTasteState;
      tastes?: string;
      tastesSetAt?: string;
    } | null) => {
      if (!data?.tasteState) return;
      await update({
        tasteState: data.tasteState,
        tastes: data.tastes ?? data.tasteState.tastesText ?? '',
        tastesSetAt: data.tastesSetAt ?? data.tasteState.tastesSetAt,
      });
    },
    [update],
  );

  const track = useCallback(
    (payload: TrackPayload) => {
      const signal = makeSignal(payload);
      if (status === 'authenticated' && session?.user) {
        void (async () => {
          const data = await postSignals({ signal });
          await applyAccountTaste(data);
        })();
        return;
      }
      const next = appendGuestSignal(signal);
      setGuestStore(next);
      notifySignalsChanged();
    },
    [applyAccountTaste, session?.user, status],
  );

  const trackItem = useCallback(
    (
      item: DayItem,
      kind: Extract<SignalKind, 'open_card' | 'agenda_add' | 'ics' | 'reserve'>,
    ) => {
      track(payloadFromDayItem(item, kind));
    },
    [track],
  );

  const wipeKey = useCallback(
    (bucket: ProfileBucket, key: string) => {
      if (status === 'authenticated' && session?.user) {
        const current = session.user.tasteState;
        if (current) {
          const patched = {
            ...current,
            profile: wipeProfileKey(current.profile, bucket, key),
          };
          void update({
            tasteState: patched,
            tastes: patched.tastesText ?? session.user.tastes ?? '',
            tastesSetAt: patched.tastesSetAt ?? session.user.tastesSetAt,
          });
        }
        void (async () => {
          const data = await postSignals({ wipe: { bucket, key } });
          await applyAccountTaste(data);
        })();
        return;
      }
      const next = wipeGuestProfileKey(bucket, key);
      setGuestStore(next);
      notifySignalsChanged();
    },
    [applyAccountTaste, session?.user, status, update],
  );

  const addPhrase = useCallback(
    (text: string) => {
      const payload = phraseToTrackPayload(text);
      if (!payload) return;
      if (status === 'authenticated' && session?.user) {
        void (async () => {
          const data = await postSignals({ signal: payload });
          await applyAccountTaste(data);
        })();
        return;
      }
      const next = addGuestPhraseSignal(makeSignal(payload));
      setGuestStore(next);
      notifySignalsChanged();
    },
    [applyAccountTaste, session?.user, status],
  );

  const dismissLoginNudge = useCallback(() => {
    try {
      sessionStorage.setItem(LOGIN_NUDGE_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const tasteState = useMemo<AccountTasteState | null>(() => {
    if (status === 'authenticated') {
      return session?.user?.tasteState ?? null;
    }
    if (guestStore.events.length > 0 || profileHasZeroWeights(guestStore.profile)) {
      return { signalsRecent: guestStore.events, profile: guestStore.profile };
    }
    return null;
  }, [status, session?.user?.tasteState, guestStore]);
  const loginNudgeReady =
    status !== 'authenticated' && shouldPromptLogin(guestStore.events);

  const value = useMemo(
    () => ({
      track,
      trackItem,
      wipeKey,
      addPhrase,
      guestStore,
      tasteState,
      loginNudgeReady,
      loginNudgeDismissed: dismissed,
      dismissLoginNudge,
    }),
    [
      track,
      trackItem,
      wipeKey,
      addPhrase,
      guestStore,
      tasteState,
      loginNudgeReady,
      dismissed,
      dismissLoginNudge,
    ],
  );

  return (
    <SignalsContext.Provider value={value}>{children}</SignalsContext.Provider>
  );
}

export { hasScorableState };
