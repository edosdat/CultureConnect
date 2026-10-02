'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { DayItem } from '@/lib/types';
import {
  claimArmedAuthAction,
  requestAuthGate,
  shouldDeferAuthResume,
  showAuthResumeRetry,
} from '@/lib/authActionGate';
import {
  applyRsvpToggle,
  circleEnvieLine,
  circleGoingLine,
  DAUGHTER_NOTICE,
  motherCountersLabel,
  visibleMotherStats,
  type RsvpKind,
  type TokenSocialPayload,
} from '@/lib/shareRsvp';
import {
  fetchMotherStats,
  parseMotherStatsPayload,
  rememberMotherStats,
} from '@/lib/motherStatsClient';
import {
  SOCIAL_TIP_B1_COPY,
  SOCIAL_TIP_EVENT,
  claimSocialTipBeat1,
  claimSocialTipPreview,
  dismissSocialTip,
  releaseSocialTipPreview,
  shareActionOwnsSocialTip,
  socialTipPreviewRequested,
} from '@/lib/socialTipBeat1';

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

function SocialTipLine({ onDismiss }: { onDismiss: () => void }) {
  return (
    <p
      data-testid="social-tip-b1"
      className="mt-2 flex items-baseline justify-between gap-2 text-sm leading-snug text-culture-muted"
    >
      <span>{SOCIAL_TIP_B1_COPY}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer"
        data-testid="social-tip-b1-dismiss"
        className="shrink-0 rounded-full px-1 text-xs text-culture-muted underline-offset-2 hover:text-culture-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
      >
        ×
      </button>
    </p>
  );
}

/**
 * One line under this Envie / J’y vais row.
 * Guests stay quiet. Preview (`?apercu=social`) does not write the flag.
 */
function useSocialTipBeat1(
  ownerRef: { readonly current: HTMLElement | null },
  authed: boolean,
) {
  const [open, setOpen] = useState(false);
  const previewRef = useRef(false);

  useEffect(() => {
    if (!socialTipPreviewRequested(window.location.search)) return;
    if (!claimSocialTipPreview()) return;
    previewRef.current = true;
    setOpen(true);
    return () => {
      if (!previewRef.current) return;
      previewRef.current = false;
      releaseSocialTipPreview();
    };
  }, []);

  useEffect(() => {
    function onShare(event: Event) {
      if (!authed) return;
      if (previewRef.current) return;
      const root = ownerRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node)) return;
      if (!shareActionOwnsSocialTip(root, target)) return;
      if (!claimSocialTipBeat1()) return;
      setOpen(true);
    }
    document.addEventListener(SOCIAL_TIP_EVENT, onShare);
    return () => document.removeEventListener(SOCIAL_TIP_EVENT, onShare);
  }, [authed, ownerRef]);

  const noteConnectedEnvie = useCallback(() => {
    if (!authed) return;
    if (previewRef.current) return;
    if (!claimSocialTipBeat1()) return;
    setOpen(true);
  }, [authed]);

  const dismissSocialTipLine = useCallback(() => {
    setOpen(false);
    if (previewRef.current) {
      previewRef.current = false;
      return;
    }
    dismissSocialTip();
  }, []);

  return { socialTipOpen: open, noteConnectedEnvie, dismissSocialTipLine };
}

export default function ShareSocial({ item, token }: Props) {
  if (token) {
    return <DaughterRsvp item={item} token={token} />;
  }
  return <MotherStatsBlock key={item.key} itemKey={item.key} />;
}

/**
 * Mother (home heroes + fiche sans ?t=).
 * Paint Envie / J’y vais immediately — no skeleton cascade across carousels.
 * mine/stats hydrate via batched POST /api/share/event/stats.
 */
function MotherStatsBlock({ itemKey }: { itemKey: string }) {
  const { data: session, status } = useSession();
  const authed = status === 'authenticated' && Boolean(session?.user);
  const [stats, setStats] = useState<MotherStats | null>(null);
  const [mine, setMine] = useState<RsvpKind | null>(null);
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState(false);
  const ownerRef = useRef<HTMLElement>(null);
  const flight = useRef(0);
  const { socialTipOpen, noteConnectedEnvie, dismissSocialTipLine } =
    useSocialTipBeat1(ownerRef, authed);

  const applyPayload = useCallback(
    (payload: { envie: number; going: number; mine: RsvpKind | null }) => {
      setStats(visibleMotherStats(payload));
      setMine(payload.mine);
      rememberMotherStats(itemKey, payload);
    },
    [itemKey],
  );

  useEffect(() => {
    let cancelled = false;
    const seen = flight.current;
    setSettled(false);
    void (async () => {
      try {
        const payload = await fetchMotherStats(itemKey);
        if (cancelled || flight.current !== seen) return;
        applyPayload(payload);
      } catch {
        if (!cancelled && flight.current === seen) setStats(null);
      } finally {
        if (!cancelled && flight.current === seen) setSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemKey, applyPayload]);

  async function tap(kind: RsvpKind, resume = false) {
    if (status === 'loading' || busy) return;
    if (!authed) {
      requestAuthGate({ kind, itemKey, token: null });
      return;
    }
    const id = ++flight.current;
    const prevMine = mine;
    const prevStats = stats;
    const nextMine = applyRsvpToggle(mine, kind);
    // Optimistic fill — disable only while the network confirms.
    setMine(nextMine);
    setBusy(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ kind, itemKey }),
      });
      if (flight.current !== id) return;
      if (res.status === 401) {
        setMine(prevMine);
        setStats(prevStats);
        if (resume) showAuthResumeRetry();
        else requestAuthGate({ kind, itemKey, token: null });
        return;
      }
      if (!res.ok) {
        setMine(prevMine);
        setStats(prevStats);
        if (resume) showAuthResumeRetry();
        return;
      }
      const data: unknown = await res.json();
      const raw =
        data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      // POST returns kind + counters — no second stats round-trip.
      const payload = parseMotherStatsPayload({
        envie: raw.envie,
        going: raw.going,
        mine: raw.kind,
      });
      applyPayload(payload);
      if (payload.mine === 'envie') noteConnectedEnvie();
    } catch {
      if (flight.current !== id) return;
      setMine(prevMine);
      setStats(prevStats);
      if (resume) showAuthResumeRetry();
    } finally {
      if (flight.current === id) setBusy(false);
    }
  }

  const tapRef = useRef(tap);
  tapRef.current = tap;

  useEffect(() => {
    if (!authed) return;
    if (shouldDeferAuthResume(ownerRef.current)) return;
    const pending = claimArmedAuthAction({
      kind: ['envie', 'going'],
      itemKey,
      token: null,
    });
    if (!pending || (pending.kind !== 'envie' && pending.kind !== 'going')) return;
    void tapRef.current(pending.kind, true);
  }, [authed, itemKey]);

  const label = stats ? motherCountersLabel(stats.envie, stats.going) : '';

  return (
    <section
      ref={ownerRef}
      data-testid="share-rsvp-mother"
      data-rsvp-pending={settled ? undefined : ''}
      aria-busy={settled ? undefined : true}
      className="mt-2"
    >
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
      {socialTipOpen ? <SocialTipLine onDismiss={dismissSocialTipLine} /> : null}
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
  const [settled, setSettled] = useState(false);
  const ownerRef = useRef<HTMLElement>(null);
  const flight = useRef(0);
  const { socialTipOpen, noteConnectedEnvie, dismissSocialTipLine } =
    useSocialTipBeat1(ownerRef, authed);

  const loadSocial = useCallback(async () => {
    const seen = flight.current;
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}/social`, {
        credentials: 'same-origin',
      });
      if (flight.current !== seen) return;
      if (!res.ok) {
        setSettled(true);
        return;
      }
      const data = (await res.json()) as TokenSocialPayload;
      if (flight.current !== seen) return;
      setSocial(data);
      setMine(data.inCircle ? data.mine : null);
    } catch {
      /* keep last payload */
    } finally {
      if (flight.current === seen) setSettled(true);
    }
  }, [token]);

  useEffect(() => {
    void loadSocial();
  }, [loadSocial]);

  async function tap(kind: RsvpKind, resume = false) {
    if (status === 'loading' || busy) return;
    if (!authed) {
      requestAuthGate({ kind, itemKey: item.key, token });
      return;
    }
    const id = ++flight.current;
    const prevMine = mine;
    const nextMine = applyRsvpToggle(mine, kind);
    setMine(nextMine);
    setBusy(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ kind, token, itemKey: item.key }),
      });
      if (flight.current !== id) return;
      if (res.status === 401) {
        setMine(prevMine);
        if (resume) showAuthResumeRetry();
        else requestAuthGate({ kind, itemKey: item.key, token });
        return;
      }
      if (!res.ok) {
        setMine(prevMine);
        if (resume) showAuthResumeRetry();
        return;
      }
      const data = (await res.json()) as { kind?: RsvpKind | null };
      setMine(data.kind ?? null);
      if (data.kind === 'envie') noteConnectedEnvie();
      await loadSocial();
    } catch {
      if (flight.current !== id) return;
      setMine(prevMine);
      if (resume) showAuthResumeRetry();
    } finally {
      if (flight.current === id) setBusy(false);
    }
  }

  const tapRef = useRef(tap);
  tapRef.current = tap;

  useEffect(() => {
    if (!authed || !settled) return;
    if (shouldDeferAuthResume(ownerRef.current)) return;
    const pending = claimArmedAuthAction({
      kind: ['envie', 'going'],
      itemKey: item.key,
      token,
    });
    if (!pending || (pending.kind !== 'envie' && pending.kind !== 'going')) return;
    void tapRef.current(pending.kind, true);
  }, [authed, item.key, settled, token]);

  const goingLine =
    social?.inCircle ? circleGoingLine(social.goingNames) : '';
  const envieLine =
    social?.inCircle ? circleEnvieLine(social.envieNames) : '';
  const anon =
    social && !social.inCircle && (social.envie >= 1 || social.going >= 1)
      ? motherCountersLabel(social.envie, social.going)
      : '';

  // Daughter deep-link: keep S1 skeleton until social settles (single instance).
  if (!settled) return <SocialSkeleton />;

  return (
    <section ref={ownerRef} data-testid="share-rsvp-daughter" className="mt-2">
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
      {socialTipOpen ? <SocialTipLine onDismiss={dismissSocialTipLine} /> : null}
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
