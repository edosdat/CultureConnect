'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** /mix is a full-screen page. Other routes keep the site chrome. */
export default function HideOnMix({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  if (path === '/mix' || path.startsWith('/mix/')) return null;
  return <>{children}</>;
}
