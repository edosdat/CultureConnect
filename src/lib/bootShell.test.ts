import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BOOT_CATALOGUE_URL,
  BOOT_SHELL_CREAM,
  BOOT_SHELL_HINT,
  BOOT_SHELL_ID,
  BOOT_SHELL_MAX_MS,
  bootShellHideDelayMs,
  bootShellMotion,
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
  it('hides as soon as the app is ready', () => {
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 420 }), 420);
  });

  it('forces hide at 3.5s when home is still partial or never ready', () => {
    assert.equal(BOOT_SHELL_MAX_MS, 3500);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 9000 }), 3500);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: null }), 3500);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: Number.NaN }), 3500);
  });

  it('clamps an already-late or negative ready time to the cap', () => {
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 3500 }), 3500);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: 0 }), 0);
    assert.equal(bootShellHideDelayMs({ appReadyAtMs: -20 }), 0);
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
      900,
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

describe('boot shell markup', () => {
  it('stays a small inline shell on the night ground', () => {
    assert.equal(BOOT_SHELL_CREAM, '#1A0B1E');
    assert.equal(PWA_BACKGROUND_COLOR, '#1A0B1E');
    assert.equal(BOOT_SHELL_HINT, 'On prépare ton agenda…');
    const bytes = Buffer.byteLength(BOOT_SHELL_CSS + BOOT_SHELL_MARKUP, 'utf8');
    assert.ok(bytes <= 3072, `critical shell is ${bytes} bytes`);
    assert.equal(BOOT_SHELL_MARKUP.includes('http'), false);
    assert.equal(BOOT_SHELL_MARKUP.includes('Chargement'), false);
    assert.match(BOOT_SHELL_MARKUP, new RegExp(`id="${BOOT_SHELL_ID}"`));
    assert.match(BOOT_SHELL_MARKUP, /aria-busy="true"/);
    assert.match(BOOT_SHELL_MARKUP, /aria-labelledby="cc-boot-hint"/);
    assert.match(BOOT_SHELL_SCRIPT, /MAX=3500/);
    assert.match(BOOT_SHELL_SCRIPT, /data-app-ready/);
    assert.match(BOOT_SHELL_SCRIPT, /display-mode: standalone/);
    assert.equal(BOOT_SHELL_SCRIPT.includes('</'), false);
    assert.equal(BOOT_CATALOGUE_URL, '/api/agenda?window=home');
    const fetchAt = BOOT_SHELL_SCRIPT.indexOf(`fetch(URL)`);
    const capAt = BOOT_SHELL_SCRIPT.indexOf('setTimeout(hide,MAX)');
    assert.ok(fetchAt > 0 && capAt > fetchAt);
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
