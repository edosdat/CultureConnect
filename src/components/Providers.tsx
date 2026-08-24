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
import TastesModal from './TastesModal';

type TastesUiValue = {
  openTastes: () => void;
  googleAuthEnabled: boolean;
};

const TastesUiContext = createContext<TastesUiValue>({
  openTastes: () => {},
  googleAuthEnabled: false,
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
  const [forceOpen, setForceOpen] = useState(false);

  const openTastes = useCallback(() => {
    setForceOpen(true);
    setTastesOpen(true);
  }, []);

  const closeTastes = useCallback(() => {
    setTastesOpen(false);
    setForceOpen(false);
  }, []);

  const value = useMemo(
    () => ({ openTastes, googleAuthEnabled }),
    [openTastes, googleAuthEnabled],
  );

  return (
    <SessionProvider>
      <TastesUiContext.Provider value={value}>
        {children}
        <TastesModal
          open={tastesOpen}
          forceOpen={forceOpen}
          onRequestOpen={() => setTastesOpen(true)}
          onClose={closeTastes}
        />
      </TastesUiContext.Provider>
    </SessionProvider>
  );
}
