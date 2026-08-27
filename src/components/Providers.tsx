'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { SessionProvider } from 'next-auth/react';
import SignalsProvider from './SignalsProvider';
import TastesSheet from './TastesSheet';
import FirstLoginModal from './FirstLoginModal';

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
  const value = useMemo(
    () => ({ googleAuthEnabled, tastesOpen, openTastes, closeTastes }),
    [googleAuthEnabled, tastesOpen, openTastes, closeTastes],
  );

  return (
    <SessionProvider>
      <SignalsProvider>
        <TastesUiContext.Provider value={value}>
          {children}
          <TastesSheet open={tastesOpen} onClose={closeTastes} />
          <FirstLoginModal />
        </TastesUiContext.Provider>
      </SignalsProvider>
    </SessionProvider>
  );
}
