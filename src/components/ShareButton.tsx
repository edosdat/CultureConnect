'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import type { DayItem } from '@/lib/types';
import { deepLinkUrl, isLikelyMobile, sharePrefill } from '@/lib/displayHome';
import { normalizeSeanceKey, shouldClientTrackShare } from '@/lib/shareToken';
import { useSignals } from './SignalsProvider';

type Props = {
  item: DayItem;
  /** Current cine horaire `DayItem.key` when the picker has a séance. */
  seanceKey?: string | null;
  className?: string;
};

export default function ShareButton({
  item,
  seanceKey = null,
  className = '',
}: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const { trackItem } = useSignals();
  const { status } = useSession();

  async function createShareUrl(): Promise<{ url: string; created: boolean }> {
    const origin = window.location.origin;
    const fallback = deepLinkUrl(origin, item.key);
    try {
      const body: { kind: 'created'; itemKey: string; seanceKey?: string } = {
        kind: 'created',
        itemKey: item.key,
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

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    let created = false;
    let url = deepLinkUrl(window.location.origin, item.key);
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
    if (isLikelyMobile() && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: prefill.title,
          text: prefill.text,
          url: prefill.url,
        });
        trackShare();
        return;
      } catch {
        /* cancelled or unsupported — fall through */
      }
    }
    const payload = `${prefill.text}\n${prefill.url}`;
    let copiedOk = false;
    try {
      await navigator.clipboard.writeText(payload);
      copiedOk = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = payload;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        copiedOk = document.execCommand('copy');
        ta.remove();
      } catch {
        copiedOk = false;
      }
    }
    if (copiedOk) {
      trackShare();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } else {
      window.prompt('Copier le lien', payload);
      trackShare();
    }
  }

  return (
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
  );
}
