'use client';

import { useState } from 'react';
import type { DayItem } from '@/lib/types';
import { deepLinkUrl, isLikelyMobile, sharePrefill } from '@/lib/displayHome';

type Props = {
  item: DayItem;
  className?: string;
};

export default function ShareButton({ item, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

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
        return;
      } catch {
        /* cancelled or unsupported — fall through */
      }
    }
    try {
      await navigator.clipboard.writeText(`${prefill.text}\n${prefill.url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copier le lien', `${prefill.text}\n${prefill.url}`);
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
