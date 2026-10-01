'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTastesUi } from './Providers';
import {
  DIGEST_TEST_INTRO_COPY as COPY,
  DIGEST_TEST_INTRO_PREVIEW,
  DIGEST_TEST_INTRO_SYNC_KEY,
  digestTestWindowOpen,
  normalizeIntroEmail,
  readDigestIntroSeen,
  writeDigestIntroSeen,
} from '@/lib/digestTestIntro';

/**
 * Soft card after a Google session, once per account, during the Thursday
 * digest test. No scrim: the agenda stays clickable. Dismiss writes
 * `mail_consent.seen` only — the mail checkbox stays untouched.
 */
export default function DigestTestIntro() {
  const { data: session, status } = useSession();
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const previewQuery = searchParams.get('apercu') === DIGEST_TEST_INTRO_PREVIEW;
  const { tastesOpen } = useTastesUi();
  const email = normalizeIntroEmail(session?.user?.email || '');
  const [open, setOpen] = useState(false);
  const previewDismissed = useRef(false);

  const dismiss = useCallback(() => {
    if (previewQuery) {
      previewDismissed.current = true;
    } else if (email) {
      writeDigestIntroSeen(email);
      void postSeen();
    }
    setOpen(false);
  }, [email, previewQuery]);

  useEffect(() => {
    if (!digestTestWindowOpen()) {
      setOpen(false);
      return;
    }
    if (previewQuery) {
      if (!previewDismissed.current) setOpen(true);
      return;
    }
    previewDismissed.current = false;
    const quiet =
      pathname.startsWith('/admin') || pathname.startsWith('/mail/unsub');
    if (quiet || status !== 'authenticated' || !email) {
      setOpen(false);
      return;
    }
    if (readDigestIntroSeen(email)) {
      setOpen(false);
      void syncSeenOnce(email);
      return;
    }

    let cancelled = false;
    fetch('/api/mail-consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { seen?: unknown } | null) => {
        if (cancelled) return;
        if (data?.seen === true) {
          writeDigestIntroSeen(email);
          setOpen(false);
          return;
        }
        setOpen(true);
      })
      .catch(() => {
        if (!cancelled) setOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, [email, pathname, previewQuery, status]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || tastesOpen) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      dismiss();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss, open, tastesOpen]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[70] flex justify-center px-3 sm:top-16">
      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby="digest-test-intro-title"
        data-testid="digest-test-intro"
        data-digest-intro={previewQuery ? 'preview' : 'account'}
        className="pointer-events-auto w-full max-w-sm rounded-2xl border border-culture-line bg-culture-surface p-4 shadow-card"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-culture-terracotta">
            {COPY.kicker}
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label={COPY.close}
            className="shrink-0 rounded-full px-2 py-1 text-xs text-culture-muted underline-offset-2 hover:text-culture-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
          >
            {COPY.close}
          </button>
        </div>
        <h2
          id="digest-test-intro-title"
          className="mt-1 font-display text-lg text-culture-ink"
        >
          {COPY.title}
        </h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-culture-ink">
          <p>{COPY.lead}</p>
          <p>{COPY.natural}</p>
          <p className="text-culture-muted">
            {COPY.unsub} {COPY.gate}{' '}
            <Link
              href="/confidentialite"
              className="text-culture-terracotta underline-offset-2 hover:underline"
            >
              Confidentialité
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-culture-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
        >
          {COPY.dismiss}
        </button>
      </aside>
    </div>,
    document.body,
  );
}

/** Account flag only. The body is `seen`, nothing else. */
function postSeen(): Promise<void> {
  return fetch('/api/mail-consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seen: true }),
  }).then(() => undefined);
}

function syncSeenOnce(email: string): Promise<void> {
  try {
    if (sessionStorage.getItem(DIGEST_TEST_INTRO_SYNC_KEY) === email) {
      return Promise.resolve();
    }
  } catch {
    /* still try the POST */
  }
  return postSeen()
    .then(() => {
      try {
        sessionStorage.setItem(DIGEST_TEST_INTRO_SYNC_KEY, email);
      } catch {
        /* ignore */
      }
    })
    .catch(() => undefined);
}
