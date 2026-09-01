'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { SessionProvider } from 'next-auth/react';
import SignalsProvider from './SignalsProvider';
import FavoritesProvider from './FavoritesProvider';
import TastesSheet from './TastesSheet';
import FirstLoginModal from './FirstLoginModal';

export const OPEN_TASTES_EVENT = 'cc-open-tastes';

export function requestOpenTastes() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_TASTES_EVENT));
}

type TastesUiValue = {
  googleAuthEnabled: boolean;
  tastesOpen: boolean;
  openTastes: () => void;
  closeTastes: () => void;
};

const TastesUiContext = createContext<TastesUiValue>({
  googleAuthEnabled: false,
  tastesOpen: false,
  openTastes: () => {},
  closeTastes: () => {},
});

export function useTastesUi() {
  return useContext(TastesUiContext);
}

type Props = {
  children: ReactNode;
  googleAuthEnabled: boolean;
};

export default function Providers({ children, googleAuthEnabled }: Props) {
  const [tastesOpen, setTastesOpen] = useState(false);
  const openTastes = useCallback(() => setTastesOpen(true), []);
  const closeTastes = useCallback(() => setTastesOpen(false), []);
  useEffect(() => {
    function onOpen() {
      setTastesOpen(true);
    }
    window.addEventListener(OPEN_TASTES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TASTES_EVENT, onOpen);
  }, []);
  const value = useMemo(
    () => ({ googleAuthEnabled, tastesOpen, openTastes, closeTastes }),
    [googleAuthEnabled, tastesOpen, openTastes, closeTastes],
  );

  return (
    <SessionProvider>
      <SignalsProvider>
        <FavoritesProvider>
          <TastesUiContext.Provider value={value}>
            {children}
            <TastesSheet open={tastesOpen} onClose={closeTastes} />
            <FirstLoginModal />
          </TastesUiContext.Provider>
        </FavoritesProvider>
      </SignalsProvider>
    </SessionProvider>
  );
}
