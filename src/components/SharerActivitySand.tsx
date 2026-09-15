'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  ACTIVITY_NOTICE,
  activitySandLines,
  hasSharerSand,
  parseActivityItemPayload,
  type ActivityItemPayload,
} from '@/lib/shareActivity';

type Props = {
  itemKey: string;
};

/**
 * Mother fiche only — named cercle on *my* tokens + « Depuis ton lien. »
 * Omit when guest, 404, or 0 RSVP. Child fiche must not mount this.
 */
export default function SharerActivitySand({ itemKey }: Props) {
  const { status } = useSession();
  const [payload, setPayload] = useState<ActivityItemPayload | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !itemKey) {
      setPayload(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/share/activity/item/${encodeURIComponent(itemKey)}`, {
      credentials: 'same-origin',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((raw: unknown) => {
        if (cancelled) return;
        const next = parseActivityItemPayload(raw);
        setPayload(next && hasSharerSand(next) ? next : null);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });
    return () => {
      cancelled = true;
    };
  }, [itemKey, status]);

  if (status !== 'authenticated' || !payload || !hasSharerSand(payload)) {
    return null;
  }
  const { going, envie } = activitySandLines(payload);
  if (!going && !envie) return null;

  return (
    <div
      data-testid="share-activity-sand"
      className="mt-3 rounded-[10px] bg-culture-sand px-3 py-3"
    >
      {going ? (
        <p className="text-sm font-semibold text-culture-ink">{going}</p>
      ) : null}
      {envie ? (
        <p className="mt-1 text-sm text-culture-muted">{envie}</p>
      ) : null}
      <p className="mt-1.5 text-[11px] text-culture-muted">{ACTIVITY_NOTICE}</p>
    </div>
  );
}
