import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  BOOT_CATALOGUE_URL,
  BOOT_SHELL_CREAM,
  BOOT_SHELL_HINT,
  BOOT_SHELL_ID,
  BOOT_SHELL_MAX_MS,
  BOOT_SHELL_MIN_MS,
  BOOT_SHELL_STANDALONE_RECHECK_MS,
  bootShellHideDelayMs,
  bootShellMotion,
  bootShellPageShowAction,
  shouldShowBootTheater,
} from './bootShell';
import {
  BOOT_SHELL_CSS,
  BOOT_SHELL_MARKUP,
  BOOT_SHELL_SCRIPT,
} from './bootShellMarkup';
import {
  APPLE_SPLASH_SCREENS,
  appleSplashHref,
  appleSplashMedia,
  appleSplashPixels,
} from './appleSplash';
import { PWA_BACKGROUND_COLOR } from './pwaManifest';

function pngSize(buf: Buffer): { width: number; height: number } {
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('boot shell hide timing', () => {
  it('holds a ready splash for the minimum dwell so the morph is visible', () => {
    assert.equal(BOOT_SHELL_MIN_MS, 1200);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 420 }), 1200);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 0 }), 1200);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: -20 }), 1200);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 1200 }), 1200);
  });

  it('hides after the minimum once the app and the catalogue are later', () => {
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 1800 }), 1800);
    assert.equal(
      bootShellHideDelayMs({
        appReadyAtMs: 1400,
        catalogueSettledAtMs: 1600,
      }),
      1600,
    );
  });

  it('forces hide at 3.5s when home is still partial or never ready', () => {
    assert.equal(BOOT_SHELL_MAX_MS, 3500);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 9000 }), 3500);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 3500 }), 3500);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: null }), 3500);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: Number.NaN }), 3500);
  });

  it('holds the splash for the catalogue prefetch and still force-hides at 3.5s', () => {
    assert.equal(
      bootShellHideDelayMs({
        appReadyAtMs: 400,
        catalogueSettledAtMs: null,
      }),
      3500,
    );
    assert.equal(
      bootShellHideDelayMs({
        appReadyAtMs: 400,
        catalogueSettledAtMs: 900,
      }),
      1200,
    );
    assert.equal(
      bootShellHideDelayMs({
        appReadyAtMs: 200,
        catalogueSettledAtMs: 8000,
      }),
      3500,
    );
    assert.equal(
      bootShellHideDelayMs({
        appReadyAtMs: null,
        catalogueSettledAtMs: 200,
      }),
      3500,
    );
  });
});

describe('boot shell pageshow', () => {
  it('does not hide a live theater on a persisted pageshow', () => {
    assert.equal(
      bootShellPageShowAction({ persisted: true, theaterStillUp: true }),
      'restart-dwell',
    );
    assert.equal(
      bootShellPageShowAction({ persisted: true, theaterStillUp: false }),
      'keep-hidden',
    );
    assert.equal(
      bootShellPageShowAction({ persisted: false, theaterStillUp: true }),
      'ignore',
    );
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Runs the inline splash script against a tiny document. */
function bootDocument(standalone: () => boolean) {
  const attrs: Record<string, string> = {};
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const listeners: Record<string, Array<(event: { persisted?: boolean }) => void>> = {};
  const shell = {
    removed: false,
    setAttribute() {},
    addEventListener() {},
    remove() {
      this.removed = true;
    },
  };
  const sandbox: Record<string, unknown> = {
    document: {
      documentElement: {
        setAttribute(key: string, value: string) {
          attrs[key] = value;
        },
        getAttribute(key: string) {
          return attrs[key];
        },
      },
      body: {
        setAttribute(key: string, value: string) {
          attrs[`body:${key}`] = value;
        },
      },
      head: { appendChild() {} },
      getElementById(id: string) {
        if (id === BOOT_SHELL_ID && !shell.removed) return shell;
        return null;
      },
      createElement() {
        return { textContent: '' };
      },
    },
    location: { pathname: '/' },
    navigator: { standalone: false },
    matchMedia() {
      return { matches: standalone() };
    },
    fetch() {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    },
    setTimeout(fn: () => void, ms?: number) {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    },
    clearTimeout(id: ReturnType<typeof setTimeout>) {
      timers.delete(id);
      clearTimeout(id);
    },
    Date,
    addEventListener(type: string, fn: (event: { persisted?: boolean }) => void) {
      (listeners[type] ||= []).push(fn);
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(BOOT_SHELL_SCRIPT, sandbox);
  return {
    attrs,
    sandbox,
    pageshow(persisted: boolean) {
      for (const fn of listeners.pageshow || []) fn({ persisted });
    },
    dispose() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    },
  };
}

describe('boot shell gate', () => {
  it('shows the theater on a standalone cold document, including iOS navigator.standalone', () => {
    assert.equal(
      shouldShowBootTheater({
        displayModeStandalone: true,
        coldDocument: true,
        dismissed: false,
      }),
      true,
    );
    assert.equal(
      shouldShowBootTheater({
        displayModeStandalone: false,
        navigatorStandalone: true,
        coldDocument: true,
        dismissed: false,
      }),
      true,
    );
  });

  it('skips desktop browsers, soft navigations, and a shell already dismissed', () => {
    assert.equal(
      shouldShowBootTheater({
        displayModeStandalone: false,
        coldDocument: true,
        dismissed: false,
      }),
      false,
    );
    assert.equal(
      shouldShowBootTheater({
        displayModeStandalone: true,
        coldDocument: false,
        dismissed: false,
      }),
      false,
    );
    assert.equal(
      shouldShowBootTheater({
        displayModeStandalone: true,
        coldDocument: true,
        dismissed: true,
      }),
      false,
    );
  });

  it('keeps a static C and the hint when motion is reduced', () => {
    assert.equal(bootShellMotion(true), 'static');
    assert.equal(bootShellMotion(false), 'morph');
    assert.match(BOOT_SHELL_CSS, /prefers-reduced-motion:\s*reduce/);
    assert.match(BOOT_SHELL_CSS, /\.cc-boot-agenda,\.cc-boot-rails\{display:none\}/);
    assert.equal(BOOT_SHELL_MARKUP.includes(BOOT_SHELL_HINT), true);
    assert.match(BOOT_SHELL_MARKUP, /class="cc-boot-c"/);
  });
});

describe('boot shell inline script', () => {
  it('keeps the theater up for the minimum dwell after an early ready', async () => {
    const boot = bootDocument(() => true);
    try {
      assert.equal(boot.attrs['data-cc-boot'], 'on');
      await delay(20);
      (boot.sandbox.__ccHideBootShell as () => void)();
      await delay(400);
      assert.equal(boot.attrs['data-app-ready'], undefined);
      await delay(1000);
      assert.equal(boot.attrs['data-app-ready'], '1');
    } finally {
      boot.dispose();
    }
  });

  it('rechecks standalone once before killing the shell', async () => {
    let stand = false;
    const boot = bootDocument(() => stand);
    try {
      await delay(30);
      assert.equal(boot.attrs['data-cc-boot'], undefined);
      assert.equal(boot.attrs['data-app-ready'], undefined);
      (boot.sandbox.__ccHideBootShell as () => void)();
      assert.equal(boot.attrs['data-app-ready'], undefined);
      stand = true;
      await delay(90);
      assert.equal(boot.attrs['data-cc-boot'], 'on');
      assert.equal(boot.attrs['data-app-ready'], undefined);
    } finally {
      boot.dispose();
    }
  });

  it('kills the shell after the recheck when it stays in a browser tab', async () => {
    const boot = bootDocument(() => false);
    try {
      await delay(30);
      assert.equal(boot.attrs['data-app-ready'], undefined);
      await delay(90);
      assert.equal(boot.attrs['data-cc-boot'], undefined);
      assert.equal(boot.attrs['data-app-ready'], '1');
    } finally {
      boot.dispose();
    }
  });

  it('restarts the dwell on a persisted pageshow instead of hiding', async () => {
    const boot = bootDocument(() => true);
    try {
      await delay(20);
      (boot.sandbox.__ccHideBootShell as () => void)();
      await delay(400);
      assert.equal(boot.attrs['data-app-ready'], undefined);
      boot.pageshow(true);
      assert.equal(boot.attrs['data-app-ready'], undefined);
      await delay(900);
      assert.equal(boot.attrs['data-app-ready'], undefined);
      await delay(450);
      assert.equal(boot.attrs['data-app-ready'], '1');
    } finally {
      boot.dispose();
    }
  });
});

describe('boot shell markup', () => {
  it('stays a small inline shell on the cream ground', () => {
    assert.equal(BOOT_SHELL_CREAM, '#F7F0E8');
    assert.equal(PWA_BACKGROUND_COLOR, '#F7F0E8');
    assert.equal(BOOT_SHELL_HINT, 'On prépare ton agenda…');
    const bytes = Buffer.byteLength(BOOT_SHELL_CSS + BOOT_SHELL_MARKUP, 'utf8');
    assert.ok(bytes <= 3072, `critical shell is ${bytes} bytes`);
    assert.equal(BOOT_SHELL_MARKUP.includes('http'), false);
    assert.equal(BOOT_SHELL_MARKUP.includes('Chargement'), false);
    assert.match(BOOT_SHELL_MARKUP, new RegExp(`id="${BOOT_SHELL_ID}"`));
    assert.match(BOOT_SHELL_MARKUP, /aria-busy="true"/);
    assert.match(BOOT_SHELL_MARKUP, /aria-labelledby="cc-boot-hint"/);
    assert.match(BOOT_SHELL_SCRIPT, /MAX=3500/);
    assert.match(BOOT_SHELL_SCRIPT, /MIN=1200/);
    assert.match(BOOT_SHELL_SCRIPT, /elapsed<MIN/);
    assert.equal(BOOT_SHELL_STANDALONE_RECHECK_MS, 80);
    assert.match(BOOT_SHELL_SCRIPT, /RECHECK=80/);
    assert.match(BOOT_SHELL_SCRIPT, /data-app-ready/);
    assert.match(BOOT_SHELL_SCRIPT, /data-cc-boot/);
    assert.match(BOOT_SHELL_SCRIPT, /display-mode: standalone/);
    assert.equal(BOOT_SHELL_SCRIPT.includes('</'), false);
    assert.equal(BOOT_CATALOGUE_URL, '/api/agenda?window=home');
    const fetchAt = BOOT_SHELL_SCRIPT.indexOf('fetch(URL)');
    const capAt = BOOT_SHELL_SCRIPT.indexOf('hide();},MAX)');
    assert.ok(fetchAt > 0 && capAt > fetchAt);
    assert.doesNotMatch(BOOT_SHELL_SCRIPT, /if\(e\.persisted\)hide\(\)/);
    assert.doesNotMatch(
      BOOT_SHELL_SCRIPT,
      /if\(!standalone\(\)\)\{window\.__ccBootDismissed=1;mark\(\);finish\(\);return;\}/,
    );
    const show = BOOT_SHELL_SCRIPT.match(
      /addEventListener\("pageshow",function\(e\)\{(.*?)\}\);/,
    );
    assert.ok(show, 'pageshow handler missing');
    const showHandler = show[1];
    assert.match(showHandler, /if\(!e\.persisted\)return/);
    assert.match(showHandler, /if\(state!==0\)\{finish\(\);return;\}/);
    assert.match(showHandler, /started=Date\.now\(\)/);
    assert.equal(showHandler.includes('hide()'), false);
    assert.match(BOOT_SHELL_SCRIPT, /scheduleRecheck\(\)/);
    assert.doesNotThrow(() => new Function(BOOT_SHELL_SCRIPT));
    assert.match(BOOT_SHELL_SCRIPT, /__ccHomeWindowPrefetch/);
    assert.equal(BOOT_SHELL_SCRIPT.includes('caches.'), false);
  });

  it('is wired before Providers and does not replace the home skeletons', () => {
    const layout = readFileSync(
      path.join(process.cwd(), 'src/app/layout.tsx'),
      'utf8',
    );
    const shellAt = layout.indexOf('BOOT_SHELL_MARKUP');
    const providersAt = layout.indexOf('<Providers');
    assert.ok(shellAt > 0 && providersAt > shellAt);
    assert.match(layout, /rel="apple-touch-startup-image"/);
    const home = readFileSync(
      path.join(process.cwd(), 'src/components/HomeTop3BootFallback.tsx'),
      'utf8',
    );
    assert.match(home, /HomeBootChrome/);
    const app = readFileSync(
      path.join(process.cwd(), 'src/components/CultureConnectApp.tsx'),
      'utf8',
    );
    assert.match(app, /signalBootShellReady\(\)/);
    assert.match(app, /readBootCatalogue\(\)/);
    const sw = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
    assert.doesNotMatch(sw, /caches\.open|cache\.put/);
  });
});

describe('apple startup images', () => {
  it('matches common iPhone and iPad media queries with lean cream PNGs', () => {
    assert.ok(APPLE_SPLASH_SCREENS.length >= 20);
    const phones = APPLE_SPLASH_SCREENS.filter((spec) => spec.deviceWidth < 700);
    const ipads = APPLE_SPLASH_SCREENS.filter((spec) => spec.deviceWidth >= 700);
    assert.ok(phones.every((spec) => spec.orientation === 'portrait'));
    assert.ok(ipads.some((spec) => spec.orientation === 'landscape'));
    const hrefs = new Set<string>();
    let total = 0;
    for (const spec of APPLE_SPLASH_SCREENS) {
      const media = appleSplashMedia(spec);
      assert.match(media, /device-width: \d+px/);
      assert.match(media, /orientation: (portrait|landscape)/);
      assert.match(media, /-webkit-device-pixel-ratio: [23]/);
      const { width, height } = appleSplashPixels(spec);
      const href = appleSplashHref(spec);
      const buf = readFileSync(path.join(process.cwd(), 'public', href));
      const size = pngSize(buf);
      assert.equal(size.width, width, href);
      assert.equal(size.height, height, href);
      assert.ok(buf.length < 40_000, `${href} is ${buf.length} bytes`);
      if (!hrefs.has(href)) {
        hrefs.add(href);
        total += buf.length;
      }
    }
    assert.ok(total < 500_000, `startup images total ${total} bytes`);
  });
});
