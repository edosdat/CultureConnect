'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { DayItem } from '@/lib/types';
import { deepLinkUrl, isLikelyMobile, sharePrefill } from '@/lib/displayHome';
import {
  normalizeSeanceKey,
  shareCreateItemKey,
  shareMintCacheKey,
  shareUrlForTap,
  shouldClientTrackShare,
  shouldRefreshShareClipboard,
} from '@/lib/shareToken';
import { rememberGuestCreatedToken } from '@/lib/guestShareTeaser';
import {
  claimArmedAuthAction,
  requestAuthGate,
  shouldDeferAuthResume,
} from '@/lib/authActionGate';
import { useSignals } from './SignalsProvider';
import {
  getOverlayStack,
  subscribeOverlayStack,
  toastBlockedByModal,
} from '@/lib/overlayStack';
import { notifySocialTip } from '@/lib/socialTipBeat1';

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
let toastWaitingForModal = false;

function toastElement(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (toastNode && toastNode.isConnected) return toastNode;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('data-testid', TOAST_TESTID);
  el.className =
    'pointer-events-none fixed bottom-5 left-1/2 z-50 w-[min(92vw,20rem)] -translate-x-1/2 rounded-full bg-planc-nuit px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg';
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
  if (toastBlockedByModal(getOverlayStack())) {
    toastWaitingForModal = true;
    hideShareCopiedToast();
    return;
  }
  toastWaitingForModal = false;
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
  subscribeOverlayStack(() => {
    if (toastWaitingForModal) showShareCopiedToast();
  });
}

type MintedShare = { url: string; token?: string; created: boolean };

const mintedByKey = new Map<string, MintedShare>();
const mintingByKey = new Map<string, Promise<MintedShare | null>>();

async function requestShareMint(
  shareItemKey: string,
  seanceKey: string | null,
): Promise<MintedShare | null> {
  const origin = window.location.origin;
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
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string; token?: string };
    if (data.token) rememberGuestCreatedToken(data.token);
    return {
      url: data.url || fallback,
      token: data.token,
      created: Boolean(data.url),
    };
  } catch {
    return null;
  }
}

/** Deduped mint. Safe to call on mount, pointer-down, and tap. */
function prefetchShareMint(
  itemKey: string,
  seanceKey: string | null,
): Promise<MintedShare | null> {
  const key = shareMintCacheKey(itemKey, seanceKey);
  const cached = mintedByKey.get(key);
  if (cached) return Promise.resolve(cached);
  const inflight = mintingByKey.get(key);
  if (inflight) return inflight;
  const shareItemKey = shareCreateItemKey(itemKey, seanceKey) || itemKey;
  const pending = requestShareMint(shareItemKey, seanceKey).then((minted) => {
    mintingByKey.delete(key);
    if (minted) mintedByKey.set(key, minted);
    return minted;
  });
  mintingByKey.set(key, pending);
  return pending;
}

export default function ShareButton({
  item,
  seanceKey = null,
  className = '',
}: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const sharing = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { trackItem } = useSignals();
  const { status } = useSession();
  const itemKey = shareCreateItemKey(item.key, seanceKey) || item.key;

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

  function handleShare() {
    if (sharing.current) return;
    sharing.current = true;
    setBusy(true);

    const shareItemKey = shareCreateItemKey(item.key, seanceKey) || item.key;
    const fallback = deepLinkUrl(window.location.origin, shareItemKey);
    const cached = mintedByKey.get(shareMintCacheKey(item.key, seanceKey));
    const url = shareUrlForTap({ cachedUrl: cached?.url, fallbackUrl: fallback });
    const prefill = sharePrefill(item, url);
    const payload = `${prefill.text}\n${prefill.url}`;
    const authed = status === 'authenticated';
    let tracked = false;
    const trackShare = (created: boolean) => {
      if (tracked) return;
      if (!shouldClientTrackShare({ created, authed })) return;
      tracked = true;
      trackItem(item, 'share');
    };

    // Toast and the share sheet in this turn. Do not wait on POST.
    flashCopied();
    if (status === 'authenticated') notifySocialTip(buttonRef.current);

    const mobile = isLikelyMobile() && typeof navigator.share === 'function';
    const sharePromise = mobile
      ? navigator
          .share({
            title: prefill.title,
            text: prefill.text,
            url: prefill.url,
          })
          .then(
            () => undefined,
            () => undefined,
          )
      : Promise.resolve();
    const copyPromise = copyText(payload);
    const mintPromise = prefetchShareMint(item.key, seanceKey);

    if (cached) trackShare(cached.created);
    else if (!authed) trackShare(false);

    void (async () => {
      let copiedOk = false;
      try {
        copiedOk = await copyPromise;
        await sharePromise;
        if (mobile) flashCopied();
        if (!copiedOk && !mobile) {
          window.prompt('Copier le lien', payload);
          flashCopied();
        }
      } finally {
        sharing.current = false;
        setBusy(false);
      }
      try {
        const minted = await mintPromise;
        const mintedUrl = minted?.url;
        if (
          copiedOk &&
          mintedUrl &&
          shouldRefreshShareClipboard({ copiedUrl: url, mintedUrl })
        ) {
          const next = sharePrefill(item, mintedUrl);
          await copyText(`${next.text}\n${next.url}`);
        }
        if (!cached) trackShare(Boolean(minted?.created));
      } catch {
        if (!cached) trackShare(false);
      }
    })();
  }

  function onShareClick() {
    if (sharing.current || status === 'loading') return;
    if (status !== 'authenticated') {
      requestAuthGate({
        kind: 'share',
        itemKey,
        seanceKey,
      });
      return;
    }
    claimArmedAuthAction({ kind: 'share', itemKey });
    handleShare();
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (shouldDeferAuthResume(buttonRef.current)) return;
    const pending = claimArmedAuthAction({ kind: 'share', itemKey });
    if (!pending) return;
    handleShare();
  }, [status, itemKey]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onPointerDown={() => {
        if (status !== 'authenticated') return;
        prefetchShareMint(item.key, seanceKey);
      }}
      onClick={onShareClick}
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
