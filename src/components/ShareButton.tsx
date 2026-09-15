'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { DayItem } from '@/lib/types';
import { deepLinkUrl, isLikelyMobile, sharePrefill } from '@/lib/displayHome';
import {
  normalizeSeanceKey,
  shareCreateItemKey,
  shouldClientTrackShare,
} from '@/lib/shareToken';
import { rememberGuestCreatedToken } from '@/lib/guestShareTeaser';
import { useSignals } from './SignalsProvider';

type Props = {
  item: DayItem;
  /** Current cine horaire `DayItem.key` matching the selected `<select>`. */
  seanceKey?: string | null;
  className?: string;
};

const TOAST_MS = 5000;
const TOAST_TESTID = 'share-copied-toast';

let toastNode: HTMLDivElement | null = null;
let toastHideTimer: number | null = null;
let toastUntil = 0;
let toastResumeBound = false;

function toastElement(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (toastNode && toastNode.isConnected) return toastNode;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('data-testid', TOAST_TESTID);
  el.className =
    'pointer-events-none fixed bottom-5 left-1/2 z-[200] w-[min(92vw,20rem)] -translate-x-1/2 rounded-full bg-culture-ink px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg';
  el.textContent = 'Lien copié';
  document.body.appendChild(el);
  toastNode = el;
  return el;
}

function hideShareCopiedToast() {
  if (toastHideTimer != null) {
    window.clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  if (toastNode) toastNode.style.display = 'none';
}

function showShareCopiedToast() {
  const el = toastElement();
  if (!el) return;
  el.style.display = 'block';
  toastUntil = Date.now() + TOAST_MS;
  if (toastHideTimer != null) window.clearTimeout(toastHideTimer);
  toastHideTimer = window.setTimeout(() => {
    hideShareCopiedToast();
  }, TOAST_MS);
}

function resumeShareCopiedToast() {
  if (Date.now() < toastUntil) showShareCopiedToast();
}

function bindShareToastResume() {
  if (toastResumeBound || typeof window === 'undefined') return;
  toastResumeBound = true;
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeShareCopiedToast();
  });
  window.addEventListener('pageshow', resumeShareCopiedToast);
}

async function waitForToastPaint() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 120);
      });
    });
  });
}

export default function ShareButton({
  item,
  seanceKey = null,
  className = '',
}: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const { trackItem } = useSignals();
  const { status } = useSession();

  useEffect(() => {
    bindShareToastResume();
    return () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  function flashCopied() {
    setCopied(true);
    showShareCopiedToast();
    if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimer.current = null;
    }, TOAST_MS);
  }

  async function createShareUrl(): Promise<{ url: string; created: boolean }> {
    const origin = window.location.origin;
    const shareItemKey = shareCreateItemKey(item.key, seanceKey) || item.key;
    const fallback = deepLinkUrl(origin, shareItemKey);
    try {
      const body: { kind: 'created'; itemKey: string; seanceKey?: string } = {
        kind: 'created',
        itemKey: shareItemKey,
      };
      const seance = normalizeSeanceKey(seanceKey);
      if (seance) body.seanceKey = seance;
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (!res.ok) return { url: fallback, created: false };
      const data = (await res.json()) as { url?: string; token?: string };
      if (data.token) rememberGuestCreatedToken(data.token);
      return { url: data.url || fallback, created: Boolean(data.url) };
    } catch {
      return { url: fallback, created: false };
    }
  }

  async function copyText(payload: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(payload);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = payload;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    let created = false;
    const shareItemKey = shareCreateItemKey(item.key, seanceKey) || item.key;
    let url = deepLinkUrl(window.location.origin, shareItemKey);
    try {
      const result = await createShareUrl();
      created = result.created;
      url = result.url;
    } finally {
      setBusy(false);
    }
    const prefill = sharePrefill(item, url);
    const authed = status === 'authenticated';
    const trackShare = () => {
      if (shouldClientTrackShare({ created, authed })) {
        trackItem(item, 'share');
      }
    };
    const payload = `${prefill.text}\n${prefill.url}`;
    const copiedOk = await copyText(payload);
    if (copiedOk) {
      trackShare();
      flashCopied();
      await waitForToastPaint();
    }
    if (isLikelyMobile() && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: prefill.title,
          text: prefill.text,
          url: prefill.url,
        });
      } catch {
        /* cancelled — toast lives on document.body */
      }
      if (copiedOk) flashCopied();
      else {
        trackShare();
        flashCopied();
      }
      return;
    }
    if (!copiedOk) {
      window.prompt('Copier le lien', payload);
      trackShare();
      flashCopied();
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      aria-label={copied ? 'Lien copié' : busy ? 'Partage…' : 'Partager'}
      data-testid="share-icon"
      className={
        'grid h-10 w-10 shrink-0 place-items-center rounded-lg border-[1.5px] border-culture-ink bg-white text-culture-ink hover:bg-culture-sand disabled:opacity-60 ' +
        className
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="currentColor"
        aria-hidden
      >
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
      </svg>
    </button>
  );
}
