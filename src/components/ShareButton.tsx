'use client';

import { useState } from 'react';
import type { DayItem } from '@/lib/types';
import { deepLinkUrl, isLikelyMobile, sharePrefill } from '@/lib/displayHome';
import { useSignals } from './SignalsProvider';

type Props = {
  item: DayItem;
  className?: string;
};

export default function ShareButton({ item, className = '' }: Props) {
  const [copied, setCopied] = useState(false);
  const { trackItem } = useSignals();

  async function handleShare() {
    const origin = window.location.origin;
    const url = deepLinkUrl(origin, item.key);
    const prefill = sharePrefill(item, url);
    if (isLikelyMobile() && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: prefill.title,
          text: prefill.text,
          url: prefill.url,
        });
        trackItem(item, 'share');
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
      trackItem(item, 'share');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } else {
      window.prompt('Copier le lien', payload);
      trackItem(item, 'share');
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={
        'inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand ' +
        className
      }
    >
      {copied ? 'Lien copié' : 'Partager'}
    </button>
  );
}
