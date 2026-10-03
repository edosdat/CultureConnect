'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { signIn, useSession } from 'next-auth/react';
import {
  AUTH_GATE_ERROR,
  AUTH_GATE_GOOGLE,
  AUTH_GATE_LATER,
  AUTH_GATE_QUERY,
  AUTH_GATE_QUERY_ERROR,
  AUTH_GATE_TITLE,
  armPendingAuthAction,
  authGateWhy,
  currentAuthGate,
  disarmPendingAuthAction,
  dismissAuthGate,
  readPendingAuthAction,
  reopenAuthGateWithError,
  subscribeAuthGate,
  type AuthGateView,
} from '@/lib/authActionGate';
import { requestCloseMesRecos } from './mesRecosUiEvents';
import { requestCloseTastes } from './tastesUiEvents';

/**
 * One bottom sheet for guest Partager / Envie / J’y vais.
 * Mounted once. Does not open on home load.
 */
export default function AuthActionGate() {
  const { status } = useSession();
  const [view, setView] = useState<AuthGateView | null>(null);
  const [busy, setBusy] = useState(false);
  const googleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setView(currentAuthGate());
    return subscribeAuthGate((next) => {
      if (next) {
        requestCloseTastes();
        requestCloseMesRecos();
      }
      setBusy(false);
      setView(next);
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(AUTH_GATE_QUERY) !== AUTH_GATE_QUERY_ERROR) return;
    params.delete(AUTH_GATE_QUERY);
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', next);
    reopenAuthGateWithError();
  }, []);

  useEffect(() => {
    if (status !== 'unauthenticated') return;
    const pending = readPendingAuthAction();
    if (!pending?.armed) return;
    if (new URLSearchParams(window.location.search).get(AUTH_GATE_QUERY) === AUTH_GATE_QUERY_ERROR) {
      return;
    }
    disarmPendingAuthAction();
  }, [status]);

  useEffect(() => {
    if (!view) {
      delete document.body.dataset.ccAuthGate;
      return;
    }
    document.body.dataset.ccAuthGate = 'open';
    googleRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      dismissAuthGate();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      delete document.body.dataset.ccAuthGate;
      window.removeEventListener('keydown', onKey);
    };
  }, [view]);

  if (!view || typeof document === 'undefined') return null;

  async function onGoogle() {
    if (busy) return;
    const href = view?.href;
    if (!href) return;
    setBusy(true);
    const armed = armPendingAuthAction();
    if (!armed) {
      setBusy(false);
      dismissAuthGate();
      return;
    }
    try {
      const result = (await signIn('google', {
        callbackUrl: href,
        redirect: false,
      })) as { error?: string; ok?: boolean; url?: string } | undefined;
      if (!result || result.error || result.ok === false) {
        disarmPendingAuthAction();
        reopenAuthGateWithError();
        setBusy(false);
        return;
      }
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      disarmPendingAuthAction();
      reopenAuthGateWithError();
      setBusy(false);
    } catch {
      disarmPendingAuthAction();
      reopenAuthGateWithError();
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-end justify-center" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        aria-label={AUTH_GATE_LATER}
        className="absolute inset-0 bg-planc-nuit/40"
        onClick={() => dismissAuthGate()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
        aria-describedby="auth-gate-why"
        data-testid="auth-action-gate"
        data-auth-gate-kind={view.kind}
        className="relative w-full max-w-md rounded-t-2xl bg-culture-cream px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_28px_rgba(28,25,23,0.18)]"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-culture-line" aria-hidden />
        <h2
          id="auth-gate-title"
          className="text-center font-display text-lg text-culture-ink"
        >
          {AUTH_GATE_TITLE}
        </h2>
        <p
          id="auth-gate-why"
          data-testid="auth-gate-why"
          className="mt-2 text-center text-sm leading-snug text-culture-ink"
        >
          {authGateWhy(view.kind)}
        </p>
        {view.error ? (
          <p
            role="alert"
            data-testid="auth-gate-error"
            className="mt-2 text-center text-sm text-culture-ink"
          >
            {AUTH_GATE_ERROR}
          </p>
        ) : null}
        <button
          ref={googleRef}
          type="button"
          data-testid="auth-gate-google"
          disabled={busy}
          onClick={() => void onGoogle()}
          className="mt-4 min-h-11 w-full rounded-full bg-culture-terracotta px-4 py-3 text-sm font-semibold text-white hover:bg-culture-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta disabled:opacity-60"
        >
          {AUTH_GATE_GOOGLE}
        </button>
        <button
          type="button"
          data-testid="auth-gate-later"
          onClick={() => dismissAuthGate()}
          className="mt-1 w-full bg-transparent py-2 text-center text-sm text-culture-muted hover:text-culture-ink"
        >
          {AUTH_GATE_LATER}
        </button>
      </div>
    </div>,
    document.body,
  );
}
