'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GUEST_STORAGE_KEY } from '@/lib/signals';

export const TASTE_COOKIE_NOTICE_KEY = 'cc_taste_cookie_notice';
export const TASTE_COOKIE_NOTICE_EVENT = 'cc-taste-cookie-notice';
export const VID_POSED_KEY = 'cc_vid_posed';
export const VID_POSED_EVENT = 'cc-vid-posed';
const SIGNALS_CHANGED_EVENT = 'cc-signals-changed';

function hasTasteCookie(): boolean {
  if (typeof document === 'undefined') return false;
  const prefix = `${GUEST_STORAGE_KEY}=`;
  return document.cookie.split(';').some((part) => part.trim().startsWith(prefix));
}

function hasVidPosedFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(VID_POSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Show the goûts line once per tab when `cc_signals_v1` is first set. */
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

/** Footer `cc_vid` line when the HttpOnly cookie is posed (flag only — never the id). */
export function notifyVidCookiePosed() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VID_POSED_KEY, '1');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(VID_POSED_EVENT));
}

function ConfidentialiteLink() {
  return (
    <Link
      href="/confidentialite"
      className="underline-offset-2 hover:text-culture-ink hover:underline"
    >
      Confidentialité
    </Link>
  );
}

/** Bas de page when cookies are posed. Not a banner / CMP. */
export default function TasteCookieNotice() {
  const [showTastes, setShowTastes] = useState(false);
  const [showVid, setShowVid] = useState(false);

  useEffect(() => {
    function onTasteNotice() {
      setShowTastes(true);
    }
    function onVidPosed() {
      setShowVid(true);
    }
    function maybeFromTasteCookie() {
      if (!hasTasteCookie()) return;
      notifyTasteCookieOnce();
    }
    if (hasVidPosedFlag()) setShowVid(true);
    window.addEventListener(TASTE_COOKIE_NOTICE_EVENT, onTasteNotice);
    window.addEventListener(VID_POSED_EVENT, onVidPosed);
    window.addEventListener(SIGNALS_CHANGED_EVENT, maybeFromTasteCookie);
    return () => {
      window.removeEventListener(TASTE_COOKIE_NOTICE_EVENT, onTasteNotice);
      window.removeEventListener(VID_POSED_EVENT, onVidPosed);
      window.removeEventListener(SIGNALS_CHANGED_EVENT, maybeFromTasteCookie);
    };
  }, []);

  if (!showTastes && !showVid) return null;

  return (
    <>
      {showTastes ? (
        <p>
          cc_signals_v1 : 14 j, goûts sur cet appareil.{' '}
          <ConfidentialiteLink />
        </p>
      ) : null}
      {showVid ? (
        <p>
          cc_vid : 14 j, id anonyme visiteurs/retours. Pas goûts, pas email.
          First-party, on ne revend pas.{' '}
          <ConfidentialiteLink />
        </p>
      ) : null}
    </>
  );
}
