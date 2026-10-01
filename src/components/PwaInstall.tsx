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
  A2HS_DAY_KEY,
  CRIOS_COPIED_HINT,
  CRIOS_COPIED_LABEL,
  CRIOS_COPY_FAILED,
  CRIOS_COPY_LINK_LABEL,
  CRIOS_SAFARI_COPY,
  CRIOS_SAFARI_NOTE,
  CRIOS_SAFARI_PATH,
  CRIOS_SAFARI_STEPS,
  a2hsSurface,
  copySafariHandoffUrl,
  detectPwaInstalled,
  isChromeIosClient,
  isHandheldClient,
  isIosClient,
  localDayStamp,
  safariHandoffUrl,
  shouldAwaitInstallPrompt,
  shouldShowDailyA2hs,
  type BeforeInstallPromptEvent,
} from '@/lib/pwaInstall';

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

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 6.5 12 3l3.5 3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 11v8h12v-8" />
    </svg>
  );
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

function AddGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path strokeLinecap="round" d="M12 8v8M8 12h8" />
    </svg>
  );
}

function InstallSheet({
  ios,
  chromeIos,
  promptReady,
  onInstall,
  onClose,
}: {
  ios: boolean;
  chromeIos: boolean;
  promptReady: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  const surface = a2hsSurface({ ios, chromeIos, promptReady });
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-end justify-center sm:items-end" role="presentation">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fermer"
        className="absolute inset-0 bg-culture-ink/15"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="pwa-install-title"
        data-testid="pwa-install-sheet"
        data-pwa-surface={surface}
        className="relative m-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] w-full max-w-sm rounded-2xl border border-culture-line/80 bg-white/80 p-4 shadow-card backdrop-blur-md"
      >
        <h2 id="pwa-install-title" className="font-display text-lg font-semibold text-culture-ink">
          Ajoute Plan C
        </h2>
        {surface === 'android-prompt' ? (
          <>
            <p className="mt-1 text-sm text-culture-muted">Un raccourci sur l’écran d’accueil.</p>
            <button
              type="button"
              data-testid="pwa-install-button"
              onClick={onInstall}
              className="mt-3 min-h-10 w-full rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white hover:bg-culture-clay"
            >
              Installer Plan C
            </button>
          </>
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
        {surface === 'ios-steps' ? (
          <ol data-testid="pwa-install-ios" className="mt-3 space-y-2 text-sm text-culture-ink">
            <li className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-culture-soft text-culture-clay">
                <ShareGlyph />
              </span>
              <span>
                <span className="font-medium">Partager</span>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-culture-soft text-culture-clay">
                <AddGlyph />
              </span>
              <span className="font-medium">Ajouter à l’écran d’accueil</span>
            </li>
          </ol>
        ) : null}
        {surface === 'fallback' ? (
          <p data-testid="pwa-install-fallback" className="mt-2 text-sm text-culture-muted">
            Ouvre le menu du navigateur, puis « Installer l’application ».
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 block w-full py-1 text-center text-sm text-culture-muted hover:text-culture-ink"
        >
          Plus tard
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const [chromeIos, setChromeIos] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

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
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    function onController() {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener('controllerchange', onController);
    let removeVis = () => {};
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const update = () => {
          reg.update().catch(() => {});
        };
        update();
        const onVis = () => {
          if (document.visibilityState === 'visible') update();
        };
        document.addEventListener('visibilitychange', onVis);
        removeVis = () => document.removeEventListener('visibilitychange', onVis);
      })
      .catch(() => {});
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onController);
      removeVis();
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
    const signals = clientSignals();
    setIos(isIosClient(signals));
    setChromeIos(isChromeIosClient(signals));

    const timer = window.setTimeout(() => {
      void (async () => {
        const installedNow = await detectPwaInstalled({
          displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
          navigatorStandalone: navigator.standalone === true,
          getInstalledRelatedApps: navigator.getInstalledRelatedApps,
        });
        if (cancelled) return;
        setInstalled(installedNow);
        const today = localDayStamp(new Date());
        let lastDay: string | null = null;
        try {
          lastDay = localStorage.getItem(A2HS_DAY_KEY);
        } catch {
          lastDay = null;
        }
        if (
          !shouldShowDailyA2hs({
            handheld: isHandheldClient(signals),
            installed: installedNow,
            lastDay,
            today,
          })
        ) {
          return;
        }
        try {
          localStorage.setItem(A2HS_DAY_KEY, today);
        } catch {
          /* private mode: still show this once */
        }
        if (!cancelled) setOpen(true);
      })();
    }, 600);

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
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (installed) setOpen(false);
  }, [installed]);

  const openInstall = useCallback(() => {
    setOpen(true);
  }, []);

  const onInstall = useCallback(() => {
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
  }, [promptEvent]);

  const value = useMemo(
    () => ({ installed, openInstall }),
    [installed, openInstall],
  );

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      {open && installed !== true ? (
        <InstallSheet
          ios={ios}
          chromeIos={chromeIos}
          promptReady={Boolean(promptEvent)}
          onInstall={onInstall}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </PwaInstallContext.Provider>
  );
}
