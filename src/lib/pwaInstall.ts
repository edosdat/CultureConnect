/**
 * Add-to-home-screen decisions (pure).
 * iOS cannot report a reliable install outside Safari standalone — the account
 * menu stays available whenever display-mode is not standalone.
 * Product cookies (cc_vid, session) are untouched here.
 */

export const A2HS_DAY_KEY = 'planc_a2hs_day';

/** Captures Chromium's install event before hydration. No permission request. */
export const INSTALL_PROMPT_CAPTURE_SCRIPT =
  "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__plancInstallPrompt=e;window.dispatchEvent(new Event('planc-bip'));});";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type A2hsSurface = 'android-prompt' | 'ios-steps' | 'fallback';

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

/** iOS never gets a fake install button. Chromium does when the event exists. */
export function a2hsSurface(input: {
  ios: boolean;
  promptReady: boolean;
}): A2hsSurface {
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
