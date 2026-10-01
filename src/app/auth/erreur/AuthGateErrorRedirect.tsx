'use client';

import { useEffect } from 'react';
import {
  AUTH_GATE_QUERY,
  AUTH_GATE_QUERY_ERROR,
  disarmPendingAuthAction,
  readPendingAuthAction,
} from '@/lib/authActionGate';

/** OAuth error page → back to the fiche sheet, action not completed. */
export default function AuthGateErrorRedirect() {
  useEffect(() => {
    const pending = readPendingAuthAction();
    if (!pending) return;
    disarmPendingAuthAction();
    const url = new URL(pending.href, window.location.origin);
    url.searchParams.set(AUTH_GATE_QUERY, AUTH_GATE_QUERY_ERROR);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.location.replace(next);
  }, []);

  return null;
}
