'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  SIGNALS_CONSENT_EVENT,
  readSignalsConsent,
  type SignalsConsent,
} from '@/lib/signalsConsent';
import { useSignals } from './SignalsProvider';

/**
 * P8 architecture #1 — bandeau with « Refuser tout » and « Accepter tout »
 * at the same visual level. Shown only while consent is undecided.
 */
export default function SignalsConsentBanner() {
  const { acceptSignalsConsent, refuseSignalsConsent } = useSignals();
  const [choice, setChoice] = useState<SignalsConsent | null | 'loading'>(
    'loading',
  );

  useEffect(() => {
    setChoice(readSignalsConsent());
    function onConsent(ev: Event) {
      const detail = (ev as CustomEvent<SignalsConsent | null>).detail;
      setChoice(detail ?? readSignalsConsent());
    }
    window.addEventListener(SIGNALS_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(SIGNALS_CONSENT_EVENT, onConsent);
  }, []);

  if (choice === 'loading' || choice !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentement aux goûts sur cet appareil"
      data-consent-banner=""
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-culture-line bg-culture-surface/95 p-4 shadow-[0_-8px_24px_rgba(28,25,23,0.08)] backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="min-w-0 flex-1 text-sm leading-snug text-culture-ink">
          <p className="font-medium">On peut retenir tes goûts sur cet appareil</p>
          <p className="mt-1 text-culture-muted">
            Cookie <span className="font-medium text-culture-ink">cc_signals_v1</span>{' '}
            (14&nbsp;j) : phrase, chips et clics pour «&nbsp;Pour toi&nbsp;». Pas de
            pub, on ne revend rien.{' '}
            <Link
              href="/confidentialite"
              className="underline-offset-2 hover:text-culture-ink hover:underline"
            >
              Confidentialité
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2 sm:pb-0.5">
          <button
            type="button"
            onClick={() => {
              refuseSignalsConsent();
              setChoice('refused');
            }}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-culture-ink bg-culture-surface px-4 text-sm font-semibold text-culture-ink hover:bg-culture-sand sm:flex-none sm:min-w-[9.5rem]"
          >
            Refuser tout
          </button>
          <button
            type="button"
            onClick={() => {
              acceptSignalsConsent();
              setChoice('accepted');
            }}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-culture-ink bg-culture-surface px-4 text-sm font-semibold text-culture-ink hover:bg-culture-sand sm:flex-none sm:min-w-[9.5rem]"
          >
            Accepter tout
          </button>
        </div>
      </div>
    </div>
  );
}
