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
import FirstLoginModal from './FirstLoginModal';
import {
  CLOSE_TASTES_EVENT,
  OPEN_TASTES_EVENT,
  requestCloseTastes,
  requestOpenTastes,
} from './tastesUiEvents';

export {
  CLOSE_TASTES_EVENT,
  OPEN_TASTES_EVENT,
  requestCloseTastes,
  requestOpenTastes,
} from './tastesUiEvents';

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
  // Overlay visibility is owned by TastesOverlayHost (CultureConnectApp /
  // SiteNav), not by this tree and never by the avatar menu.
  const [tastesOpen, setTastesOpen] = useState(false);
  const openTastes = useCallback(() => {
    setTastesOpen(true);
    requestOpenTastes();
  }, []);
  const closeTastes = useCallback(() => {
    setTastesOpen(false);
    requestCloseTastes();
  }, []);
  useEffect(() => {
    function onOpen() {
      setTastesOpen(true);
    }
    function onClose() {
      setTastesOpen(false);
    }
    window.addEventListener(OPEN_TASTES_EVENT, onOpen);
    window.addEventListener(CLOSE_TASTES_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_TASTES_EVENT, onOpen);
      window.removeEventListener(CLOSE_TASTES_EVENT, onClose);
    };
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
            <FirstLoginModal />
          </TastesUiContext.Provider>
        </FavoritesProvider>
      </SignalsProvider>
    </SessionProvider>
  );
}
