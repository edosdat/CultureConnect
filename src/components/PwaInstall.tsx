'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  A2HS_BAR_HEIGHT_PX,
  A2HS_BAR_HINT,
  A2HS_BAR_ICON_PX,
  A2HS_BAR_ICON_SRC,
  A2HS_BAR_LABEL,
  A2HS_BAR_LABEL_NARROW,
  A2HS_BAR_OFFSET_VAR,
  CRIOS_COPIED_HINT,
  CRIOS_COPIED_LABEL,
  CRIOS_COPY_FAILED,
  CRIOS_COPY_LINK_LABEL,
  CRIOS_SAFARI_COPY,
  CRIOS_SAFARI_NOTE,
  CRIOS_SAFARI_PATH,
  CRIOS_SAFARI_STEPS,
  ANDROID_INSTALL_HINT,
  ANDROID_INSTALL_LABEL,
  IOS_SAFARI_TOP_MIN_GAP_PX,
  IPAD_A2HS_HINT,
  IPAD_A2HS_LABEL,
  IPAD_DISMISS,
  IPAD_SAFARI_PATH,
  IPAD_SHARE_UNAVAILABLE,
  IPHONE_A2HS_HINT,
  IPHONE_A2HS_LABEL,
  IPHONE_DISMISS,
  IPHONE_SAFARI_PATH,
  IPHONE_SHARE_UNAVAILABLE,
  a2hsSurface,
  canShowNativeInstallButton,
  copySafariHandoffUrl,
  detectPwaInstalled,
  iosInstallFlags,
  iosSheetBottomGapPx,
  isChromeIosClient,
  nativeInstallTap,
  safariBottomChromePx,
  safariHandoffUrl,
  shouldAwaitInstallPrompt,
  shouldShowA2hsBar,
  type BeforeInstallPromptEvent,
  type IosInstallFlags,
} from '@/lib/pwaInstall';
import {
  AGENDA_REFRESH_EVENT,
  SHELL_UPDATE_ACTION,
  SHELL_UPDATE_TIP,
  SW_UPDATE_INTERVAL_MS,
  agendaRefreshDue,
  readShellReloadSignals,
  shellReloadIsSafe,
} from '@/lib/pwaRefresh';

type PwaInstallValue = {
  /** `null` until the client has checked standalone / related apps. */
  installed: boolean | null;
  openInstall: () => void;
};

const PwaInstallContext = createContext<PwaInstallValue>({
  installed: null,
  openInstall: () => {},
});

export function usePwaInstall(): PwaInstallValue {
  return useContext(PwaInstallContext);
}

declare global {
  interface Window {
    __plancInstallPrompt?: BeforeInstallPromptEvent;
  }
  interface Navigator {
    standalone?: boolean;
    getInstalledRelatedApps?: () => Promise<unknown>;
  }
}

function clientSignals() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints || 0,
  };
}

function copyViaTextarea(url: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = url;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

async function copyPageForSafari(): Promise<boolean> {
  const href = window.location.href;
  const url = safariHandoffUrl(href);
  if (!url) return false;
  const clipboard = navigator.clipboard;
  if (clipboard?.writeText) {
    const wrote = await copySafariHandoffUrl(href, (value) => clipboard.writeText(value));
    if (wrote) return true;
  }
  return copyViaTextarea(url);
}

function UpArrow() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-6 5 6" />
    </svg>
  );
}

function DownArrow() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v13" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 13l5 6 5-6" />
    </svg>
  );
}

function SafariGuide({
  rootTestId,
  pathTestId,
  unavailableTestId,
  hintTestId,
  path,
  unavailable,
  a2hsLabel,
  hint,
}: {
  rootTestId: string;
  pathTestId: string;
  unavailableTestId: string;
  hintTestId: string;
  path: string;
  unavailable: string;
  a2hsLabel: string;
  hint: string;
}) {
  return (
    <div data-testid={rootTestId}>
      <p data-testid={pathTestId} className="mt-2 text-sm font-medium text-culture-ink">
        {path}
      </p>
      <p data-testid={unavailableTestId} data-tap="inert" className="mt-2 text-sm text-culture-ink">
        {unavailable}
      </p>
      <p data-testid={hintTestId} data-tap="inert" className="mt-3 text-sm text-culture-ink">
        <span className="font-medium">{a2hsLabel}</span>
        <span className="mt-0.5 block text-culture-muted">{hint}</span>
      </p>
    </div>
  );
}

function InstallSheet({
  flags,
  promptReady,
  onInstall,
  onClose,
}: {
  flags: IosInstallFlags;
  promptReady: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  const surface = a2hsSurface({ ...flags, promptReady });
  const showInstall = canShowNativeInstallButton({ ...flags, promptReady });
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [bottomGap, setBottomGap] = useState(() => iosSheetBottomGapPx(0));
  const pageUrl = typeof window === 'undefined' ? '' : safariHandoffUrl(window.location.href);

  async function onCopyLink() {
    const ok = await copyPageForSafari();
    setCopyState(ok ? 'copied' : 'failed');
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (surface !== 'safari-iphone' && surface !== 'safari-ipad') return;
    function measure() {
      const vv = window.visualViewport;
      const chrome = safariBottomChromePx({
        innerHeight: window.innerHeight,
        visualViewportHeight: vv?.height ?? window.innerHeight,
        visualViewportOffsetTop: vv?.offsetTop ?? 0,
      });
      setBottomGap(iosSheetBottomGapPx(chrome));
    }
    measure();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [surface]);

  if (typeof document === 'undefined') return null;

  const safariIphone = surface === 'safari-iphone';
  const safariIpad = surface === 'safari-ipad';
  const anchor = safariIpad ? 'top-mid' : safariIphone ? 'above-bottom' : 'bottom';

  return createPortal(
    <div
      className={
        safariIphone || safariIpad
          ? 'fixed inset-0 z-[160] flex items-start justify-center'
          : 'fixed inset-0 z-[160] flex items-end justify-center'
      }
      data-pwa-anchor={anchor}
      style={safariIpad ? { paddingTop: IOS_SAFARI_TOP_MIN_GAP_PX } : undefined}
      role="presentation"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer"
        className="absolute inset-x-0 bg-culture-ink/15"
        style={
          safariIpad
            ? { top: IOS_SAFARI_TOP_MIN_GAP_PX, bottom: bottomGap }
            : safariIphone
              ? { top: 0, bottom: bottomGap }
              : { top: 0, bottom: 0 }
        }
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="pwa-install-title"
        data-testid="pwa-install-sheet"
        data-pwa-surface={surface}
        className={
          safariIphone || safariIpad
            ? 'relative mx-3 mt-[max(0.75rem,env(safe-area-inset-top))] w-full max-w-sm rounded-2xl border border-culture-line/80 bg-white/80 p-4 shadow-card backdrop-blur-md'
            : 'relative m-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] w-full max-w-sm rounded-2xl border border-culture-line/80 bg-white/80 p-4 shadow-card backdrop-blur-md'
        }
      >
        <h2 id="pwa-install-title" className="font-display text-lg font-semibold text-culture-ink">
          Ajoute Plan C
        </h2>
        {showInstall ? (
          <div data-testid="pwa-android-prompt">
            <p className="mt-1 text-sm text-culture-muted">{ANDROID_INSTALL_HINT}</p>
            <button
              type="button"
              data-testid="pwa-install-button"
              onClick={onInstall}
              className="mt-3 min-h-10 w-full rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white hover:bg-culture-clay"
            >
              {ANDROID_INSTALL_LABEL}
            </button>
          </div>
        ) : null}
        {surface === 'crios-safari' ? (
          <div data-testid="pwa-install-crios">
            <p className="mt-1 text-sm font-medium text-culture-ink">{CRIOS_SAFARI_PATH}</p>
            <p className="mt-1 text-sm text-culture-ink">{CRIOS_SAFARI_COPY}</p>
            <p className="mt-1 text-sm text-culture-muted">{CRIOS_SAFARI_NOTE}</p>
            {pageUrl ? (
              <input
                readOnly
                value={pageUrl}
                aria-label="Lien à coller dans Safari"
                data-testid="pwa-safari-url"
                onFocus={(e) => e.currentTarget.select()}
                className="mt-3 w-full rounded-lg border border-culture-line bg-white px-3 py-2 text-sm text-culture-ink"
              />
            ) : null}
            <button
              type="button"
              data-testid="pwa-copy-link"
              onClick={() => {
                void onCopyLink();
              }}
              className="mt-3 min-h-10 w-full rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white hover:bg-culture-clay"
            >
              {copyState === 'copied' ? CRIOS_COPIED_LABEL : CRIOS_COPY_LINK_LABEL}
            </button>
            <p className="mt-2 text-sm text-culture-ink" aria-live="polite" data-testid="pwa-copy-status">
              {copyState === 'copied' ? CRIOS_COPIED_HINT : null}
              {copyState === 'failed' ? CRIOS_COPY_FAILED : null}
            </p>
            <p className="mt-1 text-sm text-culture-muted">Ensuite, dans Safari :</p>
            <ol
              data-testid="pwa-crios-safari-steps"
              className="mt-1 list-decimal space-y-1 pl-5 text-sm text-culture-ink"
            >
              {CRIOS_SAFARI_STEPS.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {surface === 'safari-iphone' ? (
          <SafariGuide
            rootTestId="pwa-iphone-safari"
            pathTestId="pwa-iphone-safari-path"
            unavailableTestId="pwa-iphone-share-unavailable"
            hintTestId="pwa-iphone-a2hs-hint"
            path={IPHONE_SAFARI_PATH}
            unavailable={IPHONE_SHARE_UNAVAILABLE}
            a2hsLabel={IPHONE_A2HS_LABEL}
            hint={IPHONE_A2HS_HINT}
          />
        ) : null}
        {surface === 'safari-ipad' ? (
          <SafariGuide
            rootTestId="pwa-ipad-safari"
            pathTestId="pwa-ipad-safari-path"
            unavailableTestId="pwa-ipad-share-unavailable"
            hintTestId="pwa-ipad-a2hs-hint"
            path={IPAD_SAFARI_PATH}
            unavailable={IPAD_SHARE_UNAVAILABLE}
            a2hsLabel={IPAD_A2HS_LABEL}
            hint={IPAD_A2HS_HINT}
          />
        ) : null}
        {surface === 'fallback' ? (
          <p data-testid="pwa-install-fallback" className="mt-2 text-sm text-culture-muted">
            Ouvre le menu du navigateur, puis « Installer l’application ».
          </p>
        ) : null}
        <button
          type="button"
          data-testid={
            safariIpad ? 'pwa-ipad-dismiss' : safariIphone ? 'pwa-iphone-dismiss' : undefined
          }
          onClick={onClose}
          className="mt-3 block w-full py-1 text-center text-sm text-culture-muted hover:text-culture-ink"
        >
          {safariIpad ? IPAD_DISMISS : safariIphone ? IPHONE_DISMISS : 'Plus tard'}
        </button>
      </div>
      {safariIpad ? (
        <div
          data-testid="pwa-ipad-share-arrow"
          data-pwa-arrow="up"
          className="pointer-events-none absolute left-1/2 z-10 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full bg-white text-culture-ink shadow-card"
          style={{ top: 12 }}
          aria-hidden
        >
          <UpArrow />
        </div>
      ) : null}
      {safariIphone ? (
        <div
          data-testid="pwa-iphone-share-arrow"
          data-pwa-arrow="down"
          className="pointer-events-none absolute left-1/2 z-10 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full bg-white text-culture-ink shadow-card"
          style={{ bottom: Math.max(12, bottomGap - 44) }}
          aria-hidden
        >
          <DownArrow />
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/**
 * Sticky strip directly under the site header. Always on while the app
 * is not installed — phone and desktop. Tap opens the install sheet.
 * No dismiss control: « Plus tard » only closes that sheet.
 */
export function A2hsDownloadBar() {
  const { installed, openInstall } = usePwaInstall();
  const show = shouldShowA2hsBar({ installed });

  useEffect(() => {
    const root = document.documentElement;
    if (!show) {
      root.style.removeProperty(A2HS_BAR_OFFSET_VAR);
      return;
    }
    root.style.setProperty(A2HS_BAR_OFFSET_VAR, `${A2HS_BAR_HEIGHT_PX}px`);
    return () => {
      root.style.removeProperty(A2HS_BAR_OFFSET_VAR);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      data-testid="pwa-download-bar"
      className="sticky top-0 z-[35] flex h-11 items-center gap-2.5 border-b border-culture-terracotta/[0.12] bg-culture-cream px-3"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={A2HS_BAR_ICON_SRC}
        alt=""
        width={A2HS_BAR_ICON_PX}
        height={A2HS_BAR_ICON_PX}
        draggable={false}
        data-testid="pwa-download-bar-icon"
        className="h-[22px] w-[22px] shrink-0 rounded-[4px] object-cover"
      />
      <p className="hidden min-w-0 flex-1 truncate text-[13px] leading-none text-culture-muted min-[390px]:block">
        {A2HS_BAR_HINT}
      </p>
      <button
        type="button"
        data-testid="pwa-download-bar-action"
        onClick={openInstall}
        className="ml-auto min-h-9 shrink-0 rounded-full bg-culture-terracotta px-3 py-0 text-sm font-semibold leading-none text-white hover:bg-culture-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
      >
        <span className="min-[360px]:hidden">{A2HS_BAR_LABEL_NARROW}</span>
        <span className="hidden min-[360px]:inline">{A2HS_BAR_LABEL}</span>
      </button>
    </div>
  );
}

function ShellRefreshTip({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pwa-shell-refresh"
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[170] mx-auto flex w-auto max-w-sm items-center justify-between gap-3 rounded-2xl border border-culture-line/80 bg-white/90 px-4 py-3 shadow-card backdrop-blur-md"
    >
      <p className="text-sm text-culture-ink">{SHELL_UPDATE_TIP}</p>
      <button
        type="button"
        data-testid="pwa-shell-refresh-action"
        onClick={onRefresh}
        className="min-h-10 shrink-0 rounded-full bg-culture-terracotta px-4 py-2 text-sm font-semibold text-white hover:bg-culture-clay"
      >
        {SHELL_UPDATE_ACTION}
      </button>
    </div>
  );
}

export default function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [installFlags, setInstallFlags] = useState<IosInstallFlags | null>(null);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [shellUpdateReady, setShellUpdateReady] = useState(false);

  const rememberPrompt = useCallback((event?: Event) => {
    const next =
      (event && 'prompt' in event ? (event as BeforeInstallPromptEvent) : null) ||
      window.__plancInstallPrompt ||
      null;
    if (!next || typeof next.prompt !== 'function') return;
    next.preventDefault();
    window.__plancInstallPrompt = next;
    setPromptEvent(next);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let sawController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    let pendingReload = false;
    let registration: ServiceWorkerRegistration | null = null;
    let lastAgendaAt: number | null = Date.now();

    function trySoftReload() {
      if (!pendingReload || reloading) return;
      if (!shellReloadIsSafe(readShellReloadSignals(document))) {
        setShellUpdateReady(true);
        return;
      }
      reloading = true;
      window.location.reload();
    }

    function onController() {
      if (!sawController || reloading) {
        sawController = true;
        return;
      }
      pendingReload = true;
      trySoftReload();
    }

    function maybeAgenda(now = Date.now()) {
      if (document.visibilityState !== 'visible') return;
      if (!agendaRefreshDue(lastAgendaAt, now)) return;
      lastAgendaAt = now;
      window.dispatchEvent(new Event(AGENDA_REFRESH_EVENT));
    }

    function tick() {
      registration?.update().catch(() => {});
      maybeAgenda();
      trySoftReload();
    }

    navigator.serviceWorker.addEventListener('controllerchange', onController);
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      registration?.update().catch(() => {});
      maybeAgenda();
      trySoftReload();
    };
    document.addEventListener('visibilitychange', onVis);
    const timer = window.setInterval(tick, SW_UPDATE_INTERVAL_MS);
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        registration = reg;
        reg.update().catch(() => {});
      })
      .catch(() => {});
    return () => {
      window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onController);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    if (!shouldAwaitInstallPrompt({ chromeIos: isChromeIosClient(clientSignals()) })) {
      return;
    }
    window.addEventListener('beforeinstallprompt', rememberPrompt);
    window.addEventListener('planc-bip', rememberPrompt);
    rememberPrompt();
    return () => {
      window.removeEventListener('beforeinstallprompt', rememberPrompt);
      window.removeEventListener('planc-bip', rememberPrompt);
    };
  }, [rememberPrompt]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const installedNow = await detectPwaInstalled({
        displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
        navigatorStandalone: navigator.standalone === true,
        getInstalledRelatedApps: navigator.getInstalledRelatedApps,
      });
      if (!cancelled) setInstalled(installedNow);
    })();

    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      void detectPwaInstalled({
        displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
        navigatorStandalone: navigator.standalone === true,
        getInstalledRelatedApps: navigator.getInstalledRelatedApps,
      }).then((now) => {
        if (!cancelled && now) setInstalled(true);
      });
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (installed) setOpen(false);
  }, [installed]);

  /** Account menu. Flags are set in this turn, before the sheet paints. */
  const openInstall = useCallback(() => {
    setInstallFlags(iosInstallFlags(clientSignals()));
    setOpen(true);
  }, []);

  const onInstall = useCallback(() => {
    if (!installFlags) return;
    if (nativeInstallTap({ ...installFlags, promptReady: Boolean(promptEvent) }) !== 'prompt') return;
    const event = promptEvent;
    if (!event) return;
    void event
      .prompt()
      .then(() => event.userChoice)
      .then((choice) => {
        window.__plancInstallPrompt = undefined;
        setPromptEvent(null);
        if (choice.outcome === 'accepted') setInstalled(true);
      })
      .catch(() => {
        window.__plancInstallPrompt = undefined;
        setPromptEvent(null);
      });
  }, [installFlags, promptEvent]);

  const value = useMemo(
    () => ({ installed, openInstall }),
    [installed, openInstall],
  );

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      {open && installed !== true && installFlags ? (
        <InstallSheet
          flags={installFlags}
          promptReady={Boolean(promptEvent)}
          onInstall={onInstall}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {shellUpdateReady ? (
        <ShellRefreshTip
          onRefresh={() => {
            window.location.reload();
          }}
        />
      ) : null}
    </PwaInstallContext.Provider>
  );
}
