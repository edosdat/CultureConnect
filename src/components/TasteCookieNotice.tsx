'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GUEST_STORAGE_KEY } from '@/lib/signals';

export const TASTE_COOKIE_NOTICE_KEY = 'cc_taste_cookie_notice';
export const TASTE_COOKIE_NOTICE_EVENT = 'cc-taste-cookie-notice';
const SIGNALS_CHANGED_EVENT = 'cc-signals-changed';

function hasTasteCookie(): boolean {
  if (typeof document === 'undefined') return false;
  const prefix = `${GUEST_STORAGE_KEY}=`;
  return document.cookie.split(';').some((part) => part.trim().startsWith(prefix));
}

/** Show the one-liner once per tab when a tastes cookie is first set. */
export function notifyTasteCookieOnce() {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(TASTE_COOKIE_NOTICE_KEY) === '1') return;
    sessionStorage.setItem(TASTE_COOKIE_NOTICE_KEY, '1');
    window.dispatchEvent(new Event(TASTE_COOKIE_NOTICE_EVENT));
  } catch {
    /* ignore */
  }
}

/** One line the first time the tastes cookie is set. Not a banner / CMP. */
export default function TasteCookieNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    function onNotice() {
      setShow(true);
    }
    function maybeFromCookie() {
      if (!hasTasteCookie()) return;
      notifyTasteCookieOnce();
    }
    window.addEventListener(TASTE_COOKIE_NOTICE_EVENT, onNotice);
    window.addEventListener(SIGNALS_CHANGED_EVENT, maybeFromCookie);
    return () => {
      window.removeEventListener(TASTE_COOKIE_NOTICE_EVENT, onNotice);
      window.removeEventListener(SIGNALS_CHANGED_EVENT, maybeFromCookie);
    };
  }, []);

  if (!show) return null;

  return (
    <p>
      On enregistre tes goûts dans un cookie pour «&nbsp;Pour toi&nbsp;».{' '}
      <Link
        href="/confidentialite"
        className="underline-offset-2 hover:text-culture-ink hover:underline"
      >
        Confidentialité
      </Link>
    </p>
  );
}
