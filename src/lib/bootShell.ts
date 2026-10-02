/**
 * Cold-open PWA shell (Soft LOCK A+B).
 * Pure decisions live here so hide timing, reduced motion, and the
 * standalone gate can be tested without a document.
 * The inline markup is in bootShellMarkup.ts (server layout only).
 */

import { PWA_BACKGROUND_COLOR } from './pwaManifest';

/** Cream ground. Same token as the manifest `background_color`. */
export const BOOT_SHELL_CREAM = PWA_BACKGROUND_COLOR;

/** Force-hide even when home is still partial. */
export const BOOT_SHELL_MAX_MS = 3500;

/** Opacity crossfade. Short so a ready home is not held for the morph. */
export const BOOT_SHELL_FADE_MS = 180;

export const BOOT_SHELL_ID = 'cc-boot-shell';

/** Exact hint. Soft LOCK copy. */
export const BOOT_SHELL_HINT = 'On prépare ton agenda…';

/**
 * Upcoming catalogue the home rail already fills from (`loadHomeWindow`).
 * Started during the cold-open splash. Not a service-worker cache.
 */
export const BOOT_CATALOGUE_URL = '/api/agenda?window=home';

export type BootShellMotion = 'static' | 'morph';

/**
 * Standalone cold document only.
 * A client navigation is not a new document and must not show the theater.
 * `dismissed` is a document-lifetime flag (not sessionStorage): a cold reload
 * starts over and may show the shell again.
 */
export function shouldShowBootTheater(input: {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
  coldDocument: boolean;
  dismissed: boolean;
}): boolean {
  if (!input.coldDocument || input.dismissed) return false;
  return input.displayModeStandalone || input.navigatorStandalone === true;
}

/** Reduced motion keeps the C and the hint, and drops the agenda morph. */
export function bootShellMotion(prefersReducedMotion: boolean): BootShellMotion {
  return prefersReducedMotion ? 'static' : 'morph';
}

/**
 * Hide once the app can paint and the splash catalogue fetch has settled,
 * and never later than `maxMs`.
 *
 * `catalogueSettledAtMs`:
 * - omit it when there is nothing to wait for (hide with the app)
 * - `null` while `/api/agenda?window=home` is still in flight (hold until the cap)
 * - a timestamp once that response has arrived (or failed)
 *
 * `appReadyAtMs` null means the home has not signalled yet: keep the cap.
 */
export function bootShellHideDelayMs(input: {
  appReadyAtMs: number | null;
  catalogueSettledAtMs?: number | null;
  maxMs?: number;
}): number {
  const max = input.maxMs ?? BOOT_SHELL_MAX_MS;
  if (input.appReadyAtMs == null || !Number.isFinite(input.appReadyAtMs)) {
    return max;
  }
  const appAt = Math.max(0, input.appReadyAtMs);
  if (input.catalogueSettledAtMs === null) return max;
  const catAt =
    input.catalogueSettledAtMs == null
      ? 0
      : Math.max(0, input.catalogueSettledAtMs);
  return Math.min(Math.max(appAt, catAt), max);
}

type BootWindow = Window & {
  __ccHideBootShell?: () => void;
  __ccBootHydrated?: number;
  __ccHomeWindowPrefetch?: Promise<unknown>;
  __ccHomeWindowData?: unknown;
};

/**
 * In-flight `window=home` body started by the splash script, if this
 * document already kicked it. Null when the shell script did not run.
 */
export function bootCataloguePrefetch(): Promise<unknown> | null {
  if (typeof window === 'undefined') return null;
  return (window as BootWindow).__ccHomeWindowPrefetch ?? null;
}

/**
 * Resolved catalogue body, once the splash prefetch has settled.
 * `undefined` means still in flight or never started.
 */
export function bootCatalogueData(): unknown | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as BootWindow;
  if (!('__ccHomeWindowData' in w)) return undefined;
  return w.__ccHomeWindowData;
}

/**
 * Same GET the home rail uses after mount. Reuses the splash prefetch so
 * the fill does not start a second request.
 */
export async function readBootCatalogue(): Promise<unknown | null> {
  const pending = bootCataloguePrefetch();
  if (pending) {
    try {
      const data = await pending;
      return data ?? null;
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(BOOT_CATALOGUE_URL);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Home (or any other route) has painted. On a standalone cold open the
 * inline script waits for the catalogue prefetch as well, and always
 * force-hides at 3.5s. Idempotent.
 */
export function signalBootShellReady(): void {
  if (typeof window === 'undefined') return;
  const w = window as BootWindow;
  w.__ccBootHydrated = 1;
  if (typeof w.__ccHideBootShell === 'function') {
    w.__ccHideBootShell();
    return;
  }
  document.documentElement.setAttribute('data-app-ready', '1');
  document.body?.setAttribute('data-app-ready', '1');
  document.getElementById(BOOT_SHELL_ID)?.remove();
}
