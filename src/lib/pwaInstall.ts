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

/** Visible path on the Chrome-iOS sheet. Safari is the only install that works. */
export const CRIOS_SAFARI_PATH =
  'Ouvre dans Safari → Partager → Ajouter à l’écran d’accueil';

/** Same path in a full sentence, for the sheet body. */
export const CRIOS_SAFARI_COPY =
  'Sur iPhone, ouvre Plan C dans Safari, puis Partager → Ajouter à l’écran d’accueil.';

/** Why tapping Share inside Chrome is not enough. */
export const CRIOS_SAFARI_NOTE =
  'Le menu Partager de Chrome ne le propose pas toujours.';

export const CRIOS_COPY_LINK_LABEL = 'Copier le lien';
export const CRIOS_COPIED_LABEL = 'Lien copié';
export const CRIOS_COPIED_HINT =
  'Colle-le dans Safari, puis Partager → Ajouter à l’écran d’accueil.';
export const CRIOS_COPY_FAILED =
  'Le lien n’a pas été copié. Sélectionne l’adresse, puis colle-la dans Safari.';

/** Gestures that happen in Safari, after the link is pasted. Not page buttons. */
export const CRIOS_SAFARI_STEPS = ['Partager', 'Ajouter à l’écran d’accueil'] as const;

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

/** Chrome iOS never emits beforeinstallprompt. Do not wait for it. */
export function shouldAwaitInstallPrompt(input: { chromeIos: boolean }): boolean {
  return !input.chromeIos;
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
