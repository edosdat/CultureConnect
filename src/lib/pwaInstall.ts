/**
 * Add-to-home-screen decisions (pure).
 * iOS cannot report a reliable install outside Safari standalone — the account
 * menu stays available whenever display-mode is not standalone.
 * Product cookies (cc_vid, session) are untouched here.
 */

export const A2HS_DAY_KEY = 'planc_a2hs_day';

/**
 * Captures Chromium's install event before hydration. No permission request.
 * Chrome on iOS never fires `beforeinstallprompt` — do not listen or wait.
 */
export const INSTALL_PROMPT_CAPTURE_SCRIPT =
  "(function(){if(/CriOS/i.test(navigator.userAgent||''))return;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__plancInstallPrompt=e;window.dispatchEvent(new Event('planc-bip'));});})();";

/**
 * LOCK. Install happens in Safari’s own chrome, not via `navigator.share`
 * and not via a button on this sheet. On iPad the share icon is in the top bar.
 */
export const SAFARI_TOP_A2HS_PATH =
  'Barre Safari en haut → icône Partager (carré + flèche) → Sur l’écran d’accueil';

/** Visible path on the Chrome-iOS sheet. Safari is the only install that works. */
export const CRIOS_SAFARI_PATH = `Ouvre dans Safari. ${SAFARI_TOP_A2HS_PATH}`;

/** Same path in a full sentence, for the sheet body. */
export const CRIOS_SAFARI_COPY = `Ouvre Plan C dans Safari. ${SAFARI_TOP_A2HS_PATH}.`;

/** Why tapping Share inside Chrome is not enough. */
export const CRIOS_SAFARI_NOTE =
  'Le menu Partager de Chrome ne le propose pas toujours.';

export const CRIOS_COPY_LINK_LABEL = 'Copier le lien';
export const CRIOS_COPIED_LABEL = 'Lien copié';
export const CRIOS_COPIED_HINT = `Colle-le dans Safari. ${SAFARI_TOP_A2HS_PATH}.`;
export const CRIOS_COPY_FAILED =
  'Le lien n’a pas été copié. Sélectionne l’adresse, puis colle-la dans Safari.';

/** Gestures in Safari’s top bar, after the link is pasted. Not page buttons. */
export const CRIOS_SAFARI_STEPS = [
  'Barre Safari en haut : icône Partager (carré + flèche)',
  'Sur l’écran d’accueil',
] as const;

/**
 * French Safari chrome. The share control is the square-and-arrow in the top bar.
 * « Sur l’écran d’accueil » is the row inside that menu. The older « Ajouter… »
 * wording is still recognized, never shown. Neither step is a button here.
 */
export const IOS_SHARE_LABEL = 'Icône Partager (carré + flèche)';
export const IOS_SHARE_DETAIL = 'Barre Safari, en haut.';
export const IOS_A2HS_LABEL = 'Sur l’écran d’accueil';
/** Same LOCK path, already inside Safari. */
export const IOS_SAFARI_PATH = SAFARI_TOP_A2HS_PATH;
/** Step 2 is a row in Safari’s share menu, not a control on this page. */
export const IOS_A2HS_HINT = 'Dans le menu Partager. Pas un bouton ici.';

/** Steps for real Safari (not CriOS). Text only — not tappable. */
export const IOS_SAFARI_STEPS = [
  { id: 'share', label: IOS_SHARE_LABEL, detail: IOS_SHARE_DETAIL },
  { id: 'a2hs', label: IOS_A2HS_LABEL, detail: IOS_A2HS_HINT },
] as const;

/** Scrim stays off the bottom browser chrome. */
export const IOS_SAFARI_BAR_MIN_GAP_PX = 96;
/** Card starts below the iPad Safari top bar, where the share icon sits. */
export const IOS_SAFARI_TOP_MIN_GAP_PX = 96;

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type A2hsSurface = 'android-prompt' | 'ios-steps' | 'crios-safari' | 'fallback';

export type AccountInstallItem = 'pending' | 'download' | 'installed';

export function localDayStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isInstalledDisplay(input: {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
}): boolean {
  return input.displayModeStandalone || input.navigatorStandalone === true;
}

/** Phone / tablet, including iPadOS desktop UA. Desktop browsers stay out. */
export function isHandheldClient(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): boolean {
  const ua = input.userAgent || '';
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  if ((input.platform || '') === 'MacIntel' && (input.maxTouchPoints || 0) > 1) {
    return true;
  }
  return false;
}

export function isIosClient(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): boolean {
  const ua = input.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if ((input.platform || '') === 'MacIntel' && (input.maxTouchPoints || 0) > 1) {
    return true;
  }
  return false;
}

/** Chrome on iPhone/iPad. The UA token is `CriOS`, including iPad desktop mode. */
export function isChromeIosClient(input: { userAgent: string }): boolean {
  return /CriOS/i.test(input.userAgent || '');
}

export type IosInstallFlags = {
  ios: boolean;
  chromeIos: boolean;
};

/** Read before opening the sheet. Defaults of `false` would paint the wrong surface. */
export function iosInstallFlags(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): IosInstallFlags {
  return {
    ios: isIosClient(input),
    chromeIos: isChromeIosClient({ userAgent: input.userAgent }),
  };
}

/**
 * « Installer Plan C » only when Chromium stored `beforeinstallprompt`.
 * Safari and Chrome iOS never get that button — a tap there would return early.
 */
export function canShowNativeInstallButton(input: {
  ios: boolean;
  chromeIos?: boolean;
  promptReady: boolean;
}): boolean {
  return a2hsSurface(input) === 'android-prompt';
}

/** `skip` is the dead click: no prompt, or the surface is not the Android one. */
export function nativeInstallTap(input: {
  ios: boolean;
  chromeIos?: boolean;
  promptReady: boolean;
}): 'prompt' | 'skip' {
  return canShowNativeInstallButton(input) ? 'prompt' : 'skip';
}

/** `null` means the UA flags are not ready — do not paint fallback or Installer. */
export function sheetSurfaceWhenOpening(input: {
  flags: IosInstallFlags | null;
  promptReady: boolean;
}): A2hsSurface | null {
  if (!input.flags) return null;
  return a2hsSurface({
    ios: input.flags.ios,
    chromeIos: input.flags.chromeIos,
    promptReady: input.promptReady,
  });
}

/** Chrome iOS never emits beforeinstallprompt. Do not wait for it. */
export function shouldAwaitInstallPrompt(input: { chromeIos: boolean }): boolean {
  return !input.chromeIos;
}

const A2HS_APOSTROPHE = /[\u2019\u2018\u02BC\u2032]/g;

/** Both French share-sheet wordings name the same Add to Home Screen row. */
export function acceptsIosA2hsLabel(label: string): boolean {
  const folded = (label || '')
    .normalize('NFKC')
    .replace(A2HS_APOSTROPHE, "'")
    .replace(/[«»"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return folded === "sur l'écran d'accueil" || folded === "ajouter à l'écran d'accueil";
}

/**
 * Pixels of browser chrome sitting under the visual viewport.
 * Kept clear so the sheet does not cover a bottom toolbar.
 * On iPad, Partager is in the top bar — see `IOS_SAFARI_TOP_MIN_GAP_PX`.
 */
export function safariBottomChromePx(input: {
  innerHeight: number;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
}): number {
  const { innerHeight, visualViewportHeight, visualViewportOffsetTop } = input;
  if (![innerHeight, visualViewportHeight, visualViewportOffsetTop].every((n) => Number.isFinite(n))) {
    return 0;
  }
  const raw = innerHeight - visualViewportHeight - visualViewportOffsetTop;
  if (raw <= 0) return 0;
  return Math.round(raw);
}

/** Bottom inset so the scrim stays off the lower browser chrome. */
export function iosSheetBottomGapPx(chromePx: number): number {
  const chrome = Number.isFinite(chromePx) && chromePx > 0 ? Math.round(chromePx) : 0;
  return Math.max(IOS_SAFARI_BAR_MIN_GAP_PX, chrome);
}

/** Page address to paste into Safari. Rejects non-http(s) URLs. */
export function safariHandoffUrl(href: string): string {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

/** Copies the Safari handoff URL. A thrown clipboard error is a failed copy. */
export async function copySafariHandoffUrl(
  href: string,
  writeText: (value: string) => Promise<void>,
): Promise<boolean> {
  const url = safariHandoffUrl(href);
  if (!url) return false;
  try {
    await writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Once per local calendar day, handheld only, and only while not installed.
 * Dismissing still counts as today's offer — the account menu remains.
 */
export function shouldShowDailyA2hs(input: {
  handheld: boolean;
  installed: boolean;
  lastDay: string | null;
  today: string;
}): boolean {
  if (!input.handheld || input.installed) return false;
  if (!input.today) return false;
  return input.lastDay !== input.today;
}

/**
 * iOS never gets a fake install button. Chrome iOS is its own surface:
 * no `beforeinstallprompt`, and Add to Home Screen usually needs Safari.
 * Other Chromium gets the native prompt only when the event was stored.
 */
export function a2hsSurface(input: {
  ios: boolean;
  chromeIos?: boolean;
  promptReady: boolean;
}): A2hsSurface {
  if (input.chromeIos) return 'crios-safari';
  if (input.ios) return 'ios-steps';
  if (input.promptReady) return 'android-prompt';
  return 'fallback';
}

/**
 * Daily sheet and the account menu (`openInstall`) share this decision.
 * A Safari iPhone UA is never `crios-safari`: that token is `CriOS` only.
 */
export function a2hsSurfaceForClient(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  promptReady: boolean;
}): A2hsSurface {
  return a2hsSurface({
    ios: isIosClient(input),
    chromeIos: isChromeIosClient({ userAgent: input.userAgent }),
    promptReady: input.promptReady,
  });
}

export function accountInstallItem(installed: boolean | null): AccountInstallItem {
  if (installed === null) return 'pending';
  return installed ? 'installed' : 'download';
}

export async function readInstalledRelated(
  getInstalled: () => Promise<unknown>,
): Promise<boolean> {
  try {
    const apps = await getInstalled();
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return false;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function detectPwaInstalled(input: {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
  getInstalledRelatedApps?: () => Promise<unknown>;
}): Promise<boolean> {
  if (
    isInstalledDisplay({
      displayModeStandalone: input.displayModeStandalone,
      navigatorStandalone: input.navigatorStandalone,
    })
  ) {
    return true;
  }
  if (!input.getInstalledRelatedApps) return false;
  return withTimeout(readInstalledRelated(input.getInstalledRelatedApps), 500, false);
}
