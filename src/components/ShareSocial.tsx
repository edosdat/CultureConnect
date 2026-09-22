'use client';

import { useCallback, useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import type { DayItem } from '@/lib/types';
import {
  circleEnvieLine,
  circleGoingLine,
  DAUGHTER_NOTICE,
  isRsvpKind,
  motherCountersLabel,
  RSVP_LOGIN_ERROR,
  visibleMotherStats,
  type RsvpKind,
  type TokenSocialPayload,
} from '@/lib/shareRsvp';

type Props = {
  item: DayItem;
  /** Present only on daughter (`?t=`). */
  token: string | null;
};

type MotherStats = { envie: number; going: number };

function SocialSkeleton() {
  return (
    <div
      data-testid="share-social-pending"
      aria-busy="true"
      className="soc mt-2 flex gap-2"
    >
      <div className="cc-s1-skbtn" aria-label="Chargement Envie" />
      <div className="cc-s1-skbtn" aria-label="Chargement J’y vais" />
    </div>
  );
}

function rsvpButtonClass(active: boolean): string {
  return (
    'inline-flex min-h-10 flex-1 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium ' +
    (active
      ? 'border-culture-terracotta bg-culture-terracotta text-white'
      : 'border-culture-line bg-white text-culture-ink hover:bg-culture-sand')
  );
}

export default function ShareSocial({ item, token }: Props) {
  if (token) {
    return <DaughterRsvp item={item} token={token} />;
  }
  return <MotherStatsBlock key={item.key} itemKey={item.key} />;
}

function MotherStatsBlock({ itemKey }: { itemKey: string }) {
  const { data: session, status } = useSession();
  const authed = status === 'authenticated' && Boolean(session?.user);
  const [stats, setStats] = useState<MotherStats | null>(null);
  const [mine, setMine] = useState<RsvpKind | null>(null);
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState(false);

  const loadStats = useCallback(async (isCurrent: () => boolean) => {
    try {
      const res = await fetch(`/api/share/event/${encodeURIComponent(itemKey)}/stats`, {
        credentials: 'same-origin',
      });
      if (!isCurrent()) return;
      const data: unknown = res.ok ? await res.json() : null;
      if (!isCurrent()) return;
      setStats(visibleMotherStats(data as MotherStats | null));
      const rawMine =
        data && typeof data === 'object' && 'mine' in data
          ? (data as { mine?: unknown }).mine
          : null;
      setMine(isRsvpKind(rawMine) ? rawMine : null);
    } catch {
      if (isCurrent()) setStats(null);
    } finally {
      if (isCurrent()) setSettled(true);
    }
  }, [itemKey]);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setMine(null);
    setSettled(false);
    setNudge(false);
    void loadStats(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadStats]);

  async function tap(kind: RsvpKind) {
    if (status === 'loading' || busy) return;
    if (!authed) {
      setNudge(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ kind, itemKey }),
      });
      if (res.status === 401) {
        setNudge(true);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { kind?: unknown };
      setMine(isRsvpKind(data.kind) ? data.kind : null);
      await loadStats(() => true);
    } catch {
      /* stay */
    } finally {
      setBusy(false);
    }
  }

  if (!settled) return <SocialSkeleton />;
  const label = stats ? motherCountersLabel(stats.envie, stats.going) : '';

  return (
    <section data-testid="share-rsvp-mother" className="mt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="mother-rsvp-envie"
          disabled={busy}
          aria-pressed={mine === 'envie'}
          onClick={() => void tap('envie')}
          className={rsvpButtonClass(mine === 'envie')}
        >
          Envie
        </button>
        <button
          type="button"
          data-testid="mother-rsvp-going"
          disabled={busy}
          aria-pressed={mine === 'going'}
          onClick={() => void tap('going')}
          className={rsvpButtonClass(mine === 'going')}
        >
          J’y vais
        </button>
      </div>
      {nudge && !authed ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-culture-ink">{RSVP_LOGIN_ERROR}</p>
          <button
            type="button"
            data-testid="mother-rsvp-login"
            onClick={() =>
              signIn('google', { callbackUrl: window.location.href })
            }
            className="inline-flex min-h-10 items-center rounded-full bg-culture-terracotta px-4 py-2 text-sm font-semibold text-white hover:bg-culture-clay"
          >
            Continuer avec Google
          </button>
        </div>
      ) : null}
      {label ? (
        <p className="mt-2 text-sm text-culture-muted">{label}</p>
      ) : null}
    </section>
  );
}

function DaughterRsvp({ item, token }: { item: DayItem; token: string }) {
  const { data: session, status } = useSession();
  const authed = status === 'authenticated' && Boolean(session?.user);
  const [social, setSocial] = useState<TokenSocialPayload | null>(null);
  const [mine, setMine] = useState<RsvpKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [settled, setSettled] = useState(false);

  const loadSocial = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}/social`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setSettled(true);
        return;
      }
      const data = (await res.json()) as TokenSocialPayload;
      setSocial(data);
      setMine(data.inCircle ? data.mine : null);
    } catch {
      /* keep last payload */
    } finally {
      setSettled(true);
    }
  }, [token]);

  useEffect(() => {
    void loadSocial();
  }, [loadSocial]);

  async function tap(kind: RsvpKind) {
    if (status === 'loading' || busy) return;
    if (!authed) {
      setNudge(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ kind, token, itemKey: item.key }),
      });
      if (res.status === 401) {
        setNudge(true);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { kind?: RsvpKind | null };
      setMine(data.kind ?? null);
      await loadSocial();
    } catch {
      /* stay */
    } finally {
      setBusy(false);
    }
  }

  const goingLine =
    social?.inCircle ? circleGoingLine(social.goingNames) : '';
  const envieLine =
    social?.inCircle ? circleEnvieLine(social.envieNames) : '';
  const anon =
    social && !social.inCircle && (social.envie >= 1 || social.going >= 1)
      ? motherCountersLabel(social.envie, social.going)
      : '';

  if (!settled) return <SocialSkeleton />;

  return (
    <section data-testid="share-rsvp-daughter" className="mt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          aria-pressed={mine === 'envie'}
          onClick={() => void tap('envie')}
          className={rsvpButtonClass(mine === 'envie')}
        >
          Envie
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={mine === 'going'}
          onClick={() => void tap('going')}
          className={rsvpButtonClass(mine === 'going')}
        >
          J’y vais
        </button>
      </div>
      {nudge && !authed ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-culture-ink">{RSVP_LOGIN_ERROR}</p>
          <button
            type="button"
            onClick={() =>
              signIn('google', { callbackUrl: window.location.href })
            }
            className="inline-flex min-h-10 items-center rounded-full bg-culture-terracotta px-4 py-2 text-sm font-semibold text-white hover:bg-culture-clay"
          >
            Continuer avec Google
          </button>
        </div>
      ) : null}
      {goingLine || envieLine ? (
        <div data-testid="share-rsvp-names" className="mt-2 space-y-0.5">
          {goingLine ? (
            <p className="text-sm font-semibold text-culture-ink">{goingLine}</p>
          ) : null}
          {envieLine ? (
            <p className="text-sm text-culture-ink">{envieLine}</p>
          ) : null}
        </div>
      ) : anon ? (
        <p data-testid="share-rsvp-anon" className="mt-2 text-sm text-culture-muted">
          {anon}
        </p>
      ) : null}
      <p className="mt-1.5 text-xs text-culture-muted">{DAUGHTER_NOTICE}</p>
    </section>
  );
}
