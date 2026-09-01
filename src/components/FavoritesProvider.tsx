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
import { readFavoriteKeys, writeFavoriteKeys } from '@/lib/favorites';

type FavoritesValue = {
  has: (key: string) => boolean;
  toggle: (key: string) => void;
};

const FavoritesContext = createContext<FavoritesValue>({
  has: () => false,
  toggle: () => {},
});

export function useFavorites() {
  return useContext(FavoritesContext);
}

export default function FavoritesProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    setKeys(readFavoriteKeys());
  }, []);

  const has = useCallback((key: string) => keys.includes(key), [keys]);

  const toggle = useCallback((key: string) => {
    setKeys((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      writeFavoriteKeys(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ has, toggle }), [has, toggle]);
  return (
    <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
  );
}
