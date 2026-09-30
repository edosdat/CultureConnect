'use client';

/**
 * P2 — One impression line per list render (not per card).
 * Consent gate = P8 (`hasAcceptedSignalsConsent`). Refuse / undecided → no POST.
 * Optional cheap viewport flag via IntersectionObserver on the list root.
 */
import { useEffect, useRef } from 'react';
import {
  hasAcceptedSignalsConsent,
  SIGNALS_CONSENT_EVENT,
  type SignalsConsent,
} from '@/lib/signalsConsent';
import {
  impressionFingerprint,
  positionsForKeys,
  type ImpressionSurface,
} from '@/lib/impressions';

const VIEWPORT_TIMEOUT_MS = 3000;

/** Session dedupe so React re-renders with the same keys do not spam KV. */
const flushed = new Set<string>();

function postImpression(body: {
  surface: ImpressionSurface;
  scope: string;
  itemKeys: string[];
  positions: number[];
  enteredViewport?: boolean;
}): void {
  if (!hasAcceptedSignalsConsent()) return;
  void fetch('/api/impressions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

type Props = {
  surface: ImpressionSurface;
  scope: string;
  /** Stable keys already aligned with open_card itemKey when possible. */
  itemKeys: string[];
  /** Optional explicit 1-based positions; defaults to 1..n. */
  positions?: number[];
};

/**
 * Invisible probe: mount next to a list. Logs once when the list enters
 * the viewport (or after a short timeout with enteredViewport=false).
 */
export default function ListImpressionProbe({
  surface,
  scope,
  itemKeys,
  positions,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef(itemKeys);
  keysRef.current = itemKeys;
  const posRef = useRef(positions);
  posRef.current = positions;
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    const keys = keysRef.current.map((k) => (k || '').trim()).filter(Boolean);
    if (keys.length === 0) return;

    const fp = impressionFingerprint(surfaceRef.current, scopeRef.current, keys);
    if (flushed.has(fp)) return;

    let done = false;
    let observer: IntersectionObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = (enteredViewport: boolean) => {
      if (done) return;
      if (flushed.has(fp)) return;
      if (!hasAcceptedSignalsConsent()) return;
      done = true;
      flushed.add(fp);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      const pos =
        posRef.current && posRef.current.length === keys.length
          ? posRef.current
          : positionsForKeys(keys);
      postImpression({
        surface: surfaceRef.current,
        scope: scopeRef.current,
        itemKeys: keys,
        positions: pos,
        enteredViewport,
      });
    };

    const arm = () => {
      if (done || flushed.has(fp)) return;
      if (!hasAcceptedSignalsConsent()) return;
      const el = rootRef.current?.parentElement ?? rootRef.current;
      if (
        typeof IntersectionObserver === 'function' &&
        el &&
        typeof el.getBoundingClientRect === 'function'
      ) {
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((e) => e.isIntersecting)) flush(true);
          },
          { root: null, threshold: 0.05 },
        );
        observer.observe(el);
      }
      timer = setTimeout(() => flush(false), VIEWPORT_TIMEOUT_MS);
    };

    arm();

    function onConsent(ev: Event) {
      const detail = (ev as CustomEvent<SignalsConsent | null>).detail;
      if (detail === 'accepted') arm();
    }
    window.addEventListener(SIGNALS_CONSENT_EVENT, onConsent);

    return () => {
      window.removeEventListener(SIGNALS_CONSENT_EVENT, onConsent);
      if (timer) clearTimeout(timer);
      if (observer) observer.disconnect();
    };
    // Re-arm when the list identity changes.
  }, [surface, scope, itemKeys.join('|')]);

  return (
    <div
      ref={rootRef}
      data-impression-probe={surface}
      data-impression-scope={scope}
      data-impression-count={itemKeys.length}
      aria-hidden
      className="pointer-events-none absolute h-0 w-0 overflow-hidden"
    />
  );
}

/** Test helper — clears session dedupe. */
export function resetImpressionProbeDedupeForTests(): void {
  flushed.clear();
}
