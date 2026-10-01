/**
 * Add-to-home-screen decisions (pure).
 * iOS cannot report a reliable install outside Safari standalone — the account
 * menu stays available whenever display-mode is not standalone.
 * Product cookies (cc_vid, session) are untouched here.
 */

/** Sticky strip under the header. Same words as the account menu. */
export const A2HS_BAR_LABEL = 'Télécharger l’appli';
/** Viewports under 360px keep the strip on one line. */
export const A2HS_BAR_LABEL_NARROW = 'Télécharger';
export const A2HS_BAR_NARROW_PX = 360;
/** Optional left hint. Hidden below this width so the strip does not wrap. */
export const A2HS_BAR_HINT = 'Tu peux télécharger l’appli';
export const A2HS_BAR_HINT_MIN_PX = 390;
/** LOCK lettermark « C » v3 violet — not a terracotta glyph. */
export const A2HS_BAR_ICON_SRC = '/plan-c-icon-LOCK-v3-violet.jpg';
export const A2HS_BAR_ICON_PX = 22;
/** Strip content height. Search stick offset uses the same pixel value. */
export const A2HS_BAR_HEIGHT_PX = 44;
export const A2HS_BAR_OFFSET_VAR = '--a2hs-bar-h';

/**
 * Captures Chromium's install event before hydration. No permission request.
 * Chrome on iOS never fires `beforeinstallprompt` — do not listen or wait.
 */
export const INSTALL_PROMPT_CAPTURE_SCRIPT =
  "(function(){if(/CriOS/i.test(navigator.userAgent||''))return;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__plancInstallPrompt=e;window.dispatchEvent(new Event('planc-bip'));});})();";

/**
 * Chrome on iOS cannot install. Handoff is « Copier le lien », then Safari.
 * Wording kept from #210 / #212. Not the in-Safari iPhone or iPad sheet.
 */
export const CRIOS_SAFARI_PATH =
  'Ouvre dans Safari → Partager → Sur l’écran d’accueil';

/** Same path in a full sentence, for the sheet body. */
export const CRIOS_SAFARI_COPY =
  'Sur iPhone, ouvre Plan C dans Safari, puis Partager → Sur l’écran d’accueil.';

/** Why tapping Share inside Chrome is not enough. */
export const CRIOS_SAFARI_NOTE =
  'Le menu Partager de Chrome ne le propose pas toujours.';

export const CRIOS_COPY_LINK_LABEL = 'Copier le lien';
export const CRIOS_COPIED_LABEL = 'Lien copié';
export const CRIOS_COPIED_HINT =
  'Colle-le dans Safari, puis Partager → Sur l’écran d’accueil.';
export const CRIOS_COPY_FAILED =
  'Le lien n’a pas été copié. Sélectionne l’adresse, puis colle-la dans Safari.';

/** Gestures that happen in Safari, after the link is pasted. Not page buttons. */
export const CRIOS_SAFARI_STEPS = ['Partager', 'Sur l’écran d’accueil'] as const;

/**
 * Safari iPhone. Mirror of the iPad LOCK, with the share icon in the bottom bar.
 * Text only — the beige in-sheet Partager button is not the path.
 */
export const IPHONE_SAFARI_PATH = 'Barre Safari (en bas) → Partager → Sur l’écran d’accueil';
export const IPHONE_SHARE_UNAVAILABLE =
  'Tape l’icône Partager en bas de Safari, puis Sur l’écran d’accueil.';
export const IPHONE_DISMISS = 'Fermer pour toucher Partager en bas';
export const IPHONE_A2HS_LABEL = 'Sur l’écran d’accueil';
export const IPHONE_A2HS_HINT = 'Dans le menu Partager de Safari. Pas le bouton de cette fiche.';

/**
 * Safari iPad LOCK. Exact strings. The path is Safari’s top share icon,
 * never the beige Partager button on this sheet and never `navigator.share`.
 */
export const IPAD_SAFARI_PATH = 'Barre Safari (en haut) → Partager → Sur l’écran d’accueil';
export const IPAD_SHARE_UNAVAILABLE =
  'Tape l’icône Partager en haut de Safari, puis Sur l’écran d’accueil.';
export const IPAD_DISMISS = 'Fermer pour toucher Partager en haut';
export const IPAD_A2HS_LABEL = 'Sur l’écran d’accueil';
export const IPAD_A2HS_HINT = 'Dans le menu Partager de Safari. Pas le bouton de cette fiche.';

/** Android Chromium, only when `beforeinstallprompt` was stored. */
export const ANDROID_INSTALL_LABEL = 'Installer Plan C';
export const ANDROID_INSTALL_HINT = 'Un raccourci sur l’écran d’accueil.';

/** Scrim stays off the bottom browser chrome. */
export const IOS_SAFARI_BAR_MIN_GAP_PX = 96;
/** Card starts below the iPad Safari top bar, where the share icon sits. */
export const IOS_SAFARI_TOP_MIN_GAP_PX = 96;

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type A2hsSurface =
  | 'android-prompt'
  | 'safari-iphone'
  | 'safari-ipad'
  | 'crios-safari'
  | 'fallback';

export type AccountInstallItem = 'pending' | 'download' | 'installed';

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

/**
 * iPad, including iPadOS desktop mode (Macintosh UA, MacIntel, touch).
 * An iPhone or iPod token wins, so a phone is never classed as a tablet.
 */
export function isIpadClient(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): boolean {
  const ua = input.userAgent || '';
  if (/iPhone|iPod/i.test(ua)) return false;
  if (/iPad/i.test(ua)) return true;
  if ((input.platform || '') === 'MacIntel' && (input.maxTouchPoints || 0) > 1) return true;
  return false;
}

export type IosInstallFlags = {
  ios: boolean;
  ipad: boolean;
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
    ipad: isIpadClient(input),
    chromeIos: isChromeIosClient({ userAgent: input.userAgent }),
  };
}

/**
 * « Installer Plan C » only when Chromium stored `beforeinstallprompt`.
 * Safari and Chrome iOS never get that button — a tap there would return early.
 */
export function canShowNativeInstallButton(input: {
  ios: boolean;
  ipad?: boolean;
  chromeIos?: boolean;
  promptReady: boolean;
}): boolean {
  return a2hsSurface(input) === 'android-prompt';
}

/** `skip` is the dead click: no prompt, or the surface is not the Android one. */
export function nativeInstallTap(input: {
  ios: boolean;
  ipad?: boolean;
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
    ipad: input.flags.ipad,
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
 * Full label at 360px and up. Below that, the short CTA keeps one line.
 * A non-finite width keeps the full label (desktop default).
 */
export function a2hsBarLabel(viewportWidth: number): string {
  if (!Number.isFinite(viewportWidth)) return A2HS_BAR_LABEL;
  return viewportWidth < A2HS_BAR_NARROW_PX ? A2HS_BAR_LABEL_NARROW : A2HS_BAR_LABEL;
}

/** Left hint only when the strip has room. Under 390px the CTA stands alone. */
export function a2hsBarShowsHint(viewportWidth: number): boolean {
  return Number.isFinite(viewportWidth) && viewportWidth >= A2HS_BAR_HINT_MIN_PX;
}

/**
 * Sticky strip under the header on every web visit, phone and desktop.
 * Standalone / related-app install stays quiet. `null` means detection
 * is still in flight — do not paint, then hide, for an installed app.
 * Closing the sheet does not hide the strip. No day stamp, no session hide.
 */
export function shouldShowA2hsBar(input: { installed: boolean | null }): boolean {
  return input.installed === false;
}

/**
 * One surface per client. CriOS wins over Safari, iPad over iPhone.
 * Android gets the native prompt only when the event was stored.
 * Nobody on iOS gets a fake Installer or a `navigator.share` button.
 */
export function a2hsSurface(input: {
  ios: boolean;
  ipad?: boolean;
  chromeIos?: boolean;
  promptReady: boolean;
}): A2hsSurface {
  if (input.chromeIos) return 'crios-safari';
  if (input.ipad) return 'safari-ipad';
  if (input.ios) return 'safari-iphone';
  if (input.promptReady) return 'android-prompt';
  return 'fallback';
}

/**
 * Sticky bar and the account menu (`openInstall`) share this decision.
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
    ipad: isIpadClient(input),
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
