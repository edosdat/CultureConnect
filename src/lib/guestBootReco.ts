/**
 * Guest boot Top 3 (scope `tous`, Toulouse, no taste profile).
 * Client-safe predicates. The server cache lives in `agendaQuery.ts`.
 */
import { normalizeCommune } from './commune';

/**
 * Cap for attaching guest Top 3 onto homepage SSR.
 * A warm `unstable_cache` hit returns inside this window. A cold
 * `recommendForProfile` (about 0.5–1.3s) must not stall HTML — the caller
 * keeps the in-flight fill alive and the next request reads the cache.
 */
export const GUEST_BOOT_RECO_SSR_BUDGET_MS = 200;

/**
 * Cold fill waits this long before `recommendForProfile`.
 * That work is synchronous, so a timer cannot preempt it. Yielding past the
 * SSR budget lets homepage HTML return; the guest POST writes the cache.
 * Cache hits do not run the fill.
 */
export function guestBootRecoFillDelayMs(eager: boolean): number {
  return eager ? 0 : GUEST_BOOT_RECO_SSR_BUDGET_MS + 50;
}

/** Boot scope whose guest populaire Top 3 is cached. Profile reco stays live. */
export const GUEST_BOOT_RECO_SCOPE = 'tous' as const;

/** Browser hard reload (`Cache-Control: no-cache`) makes Next recompute `unstable_cache` and hold the document. */
export function requestBypassesDataCache(header: {
  cacheControl?: string | null;
  pragma?: string | null;
}): boolean {
  const cacheControl = (header.cacheControl || '').toLowerCase();
  const pragma = (header.pragma || '').toLowerCase();
  return cacheControl.includes('no-cache') || pragma.includes('no-cache');
}

export function isGuestBootRecoRequest(input: {
  recoUpcoming?: boolean;
  hasProfile: boolean;
  scope: string;
  commune: string | null | undefined;
  selectedDate?: string | null;
}): boolean {
  if (!input.recoUpcoming) return false;
  if (input.hasProfile) return false;
  if (input.scope !== GUEST_BOOT_RECO_SCOPE) return false;
  if ((input.selectedDate || '').trim()) return false;
  return normalizeCommune(input.commune) === 'toulouse';
}

/**
 * Guest boot already has cards (SSR payload or a previous fill) and they are
 * not the stale short profile cache. Skip `POST /api/agenda?reco=1`.
 */
export function shouldSkipGuestBootRecoPost(opts: {
  kind: string;
  cached: boolean;
  stale: boolean;
}): boolean {
  return opts.kind === 'guest' && opts.cached && !opts.stale;
}

/**
 * Resolve `work` if it settles first. Otherwise return `fallback` and leave
 * `work` running so a cache fill can finish.
 *
 * The fallback is deferred to `setImmediate`. Node runs expired timers before
 * I/O, so a cache read that finished during a busy event loop must still beat
 * a deadline that already expired.
 */
export function withDeadline<T>(
  work: Promise<T>,
  budgetMs: number,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      setImmediate(() => {
        if (!settled) finish(fallback);
      });
    }, budgetMs);
    work.then(
      (value) => finish(value),
      () => finish(fallback),
    );
  });
}
