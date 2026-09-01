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
  guestHasMergeableTastes,
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
import { notifyTasteCookieOnce } from './TasteCookieNotice';

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
  /** next-auth session status — paint must not assume guest while this is loading. */
  sessionStatus: 'loading' | 'authenticated' | 'unauthenticated';
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
  sessionStatus: 'loading',
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
    const jwtTaste = session.user.tasteState ?? null;
    const guest = readGuestStore();
    const guestMergeable = guestHasMergeableTastes(guest.events, guest.profile);
    // zv(JWT) → show JWT. Empty / cinema-only guest never passes zv — no POST, no wipe.
    if (hasScorableState(jwtTaste) || !guestMergeable) {
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
      await update({
        tasteState: data.tasteState,
        tastes: data.tastes ?? data.tasteState.tastesText ?? '',
        tastesSetAt: data.tastesSetAt ?? data.tasteState.tastesSetAt,
      });
      // Wipe cc_signals_v1 only if zv(response). Cinema-only never passes.
      if (hasScorableState(data.tasteState)) {
        clearGuestStore();
        setGuestStore(emptyGuestStore());
        notifySignalsChanged();
      } else {
        mergedRef.current = false;
      }
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
      notifyTasteCookieOnce();
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
      notifyTasteCookieOnce();
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
      notifyTasteCookieOnce();
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
      notifyTasteCookieOnce();
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
    const fromGuest =
      guestStore.events.length > 0 || profileHasZeroWeights(guestStore.profile)
        ? { signalsRecent: guestStore.events, profile: guestStore.profile }
        : null;
    if (status === 'authenticated') {
      const account = session?.user?.tasteState ?? null;
      // Account not scorable (empty JWT / first login): keep guest events
      // or zeros as fallback so « Ton top 3 du moment » does not vanish.
      if (hasScorableState(account)) {
        return account;
      }
      return fromGuest ?? account;
    }
    return fromGuest;
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
      sessionStatus: status,
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
      status,
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
