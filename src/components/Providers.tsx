'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { SessionProvider } from 'next-auth/react';
import SignalsProvider from './SignalsProvider';

type TastesUiValue = {
  googleAuthEnabled: boolean;
};

const TastesUiContext = createContext<TastesUiValue>({
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
  const value = useMemo(
    () => ({ googleAuthEnabled }),
    [googleAuthEnabled],
  );

  return (
    <SessionProvider>
      <SignalsProvider>
        <TastesUiContext.Provider value={value}>
          {children}
        </TastesUiContext.Provider>
      </SignalsProvider>
    </SessionProvider>
  );
}
