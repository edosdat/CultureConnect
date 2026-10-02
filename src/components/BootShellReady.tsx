'use client';

import { useEffect } from 'react';
import { signalBootShellReady } from '@/lib/bootShell';

/**
 * Hides the cold-open shell after the first client paint on routes that
 * are not the home rail. Home waits until its `window=home` fill has been
 * applied (or the 3.5s cap in the splash script). The layout stays mounted
 * across soft navigations, so this does not re-show the shell.
 */
export default function BootShellReady() {
  useEffect(() => {
    const path = window.location.pathname || '/';
    if (path === '/' || path === '') return;
    signalBootShellReady();
  }, []);
  return null;
}
