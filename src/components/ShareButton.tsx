'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import type { DayItem } from '@/lib/types';
import { deepLinkUrl, isLikelyMobile, sharePrefill } from '@/lib/displayHome';
import {
  normalizeSeanceKey,
  shareCreateItemKey,
  shouldClientTrackShare,
} from '@/lib/shareToken';
import { useSignals } from './SignalsProvider';

type Props = {
  item: DayItem;
  /** Current cine horaire `DayItem.key` matching the selected `<select>`. */
  seanceKey?: string | null;
  className?: string;
};

const TOAST_MS = 4000;

function ShareCopiedToast({ show }: { show: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || !show) return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-testid="share-copied-toast"
      className="pointer-events-none fixed bottom-5 left-1/2 z-[200] w-[min(92vw,20rem)] -translate-x-1/2 rounded-full bg-culture-ink px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg"
    >
      Lien copié
    </div>,
    document.body,
  );
}

export default function ShareButton({
  item,
  seanceKey = null,
  className = '',
}: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const { trackItem } = useSignals();
  const { status } = useSession();

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function flashCopied() {
    setCopied(true);
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setCopied(false);
      toastTimer.current = null;
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
      const data = (await res.json()) as { url?: string };
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
      // Let the viewport toast paint before navigator.share steals the frame (380).
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 80);
      });
    }
    if (isLikelyMobile() && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: prefill.title,
          text: prefill.text,
          url: prefill.url,
        });
      } catch {
        /* cancelled — toast already shown if copy worked */
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
    <>
      <button
        type="button"
        onClick={handleShare}
        disabled={busy}
        className={
          'inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand disabled:opacity-60 ' +
          className
        }
      >
        {copied ? 'Lien copié' : busy ? 'Partage…' : 'Partager'}
      </button>
      <ShareCopiedToast show={copied} />
    </>
  );
}
