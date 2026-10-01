import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  A2HS_DAY_KEY,
  CRIOS_COPIED_HINT,
  CRIOS_COPIED_LABEL,
  CRIOS_COPY_LINK_LABEL,
  CRIOS_SAFARI_COPY,
  CRIOS_SAFARI_PATH,
  CRIOS_SAFARI_STEPS,
  INSTALL_PROMPT_CAPTURE_SCRIPT,
  a2hsSurface,
  accountInstallItem,
  copySafariHandoffUrl,
  detectPwaInstalled,
  isChromeIosClient,
  isHandheldClient,
  isInstalledDisplay,
  isIosClient,
  localDayStamp,
  readInstalledRelated,
  safariHandoffUrl,
  shouldAwaitInstallPrompt,
  shouldShowDailyA2hs,
} from './pwaInstall';
import {
  PWA_BACKGROUND_COLOR,
  PWA_ICONS,
  PWA_ID,
  PWA_NAME,
  PWA_THEME_COLOR,
  relatedWebApp,
} from './pwaManifest';

describe('pwa manifest lock', () => {
  it('names Plan C and keeps terracotta chrome on the cream ground', () => {
    assert.equal(PWA_NAME, 'Plan C');
    assert.equal(PWA_ID, '/');
    assert.equal(PWA_THEME_COLOR, '#e85d3b');
    assert.equal(PWA_BACKGROUND_COLOR, '#F7F0E8');
  });

  it('points related_applications at this manifest without preferring a store app', () => {
    assert.deepEqual(relatedWebApp('https://culture-connect-2q8c-three.vercel.app'), {
      platform: 'webapp',
      url: '/manifest.webmanifest',
      id: 'https://culture-connect-2q8c-three.vercel.app/',
    });
    assert.equal(relatedWebApp('https://example.com/').id, 'https://example.com/');
  });

  it('lists any + maskable 192 and 512', () => {
    const purposes = PWA_ICONS.map((icon) => `${icon.sizes}:${icon.purpose}`);
    assert.deepEqual(purposes, [
      '192x192:any',
      '512x512:any',
      '192x192:maskable',
      '512x512:maskable',
    ]);
  });
});

describe('daily A2HS', () => {
  it('stamps a local calendar day', () => {
    assert.equal(localDayStamp(new Date(2026, 9, 1)), '2026-10-01');
  });

  it('offers a handheld visitor at most once per day, until install', () => {
    assert.equal(A2HS_DAY_KEY, 'planc_a2hs_day');
    assert.equal(
      shouldShowDailyA2hs({
        handheld: true,
        installed: false,
        lastDay: null,
        today: '2026-10-01',
      }),
      true,
    );
    assert.equal(
      shouldShowDailyA2hs({
        handheld: true,
        installed: false,
        lastDay: '2026-10-01',
        today: '2026-10-01',
      }),
      false,
    );
    assert.equal(
      shouldShowDailyA2hs({
        handheld: true,
        installed: false,
        lastDay: '2026-09-30',
        today: '2026-10-01',
      }),
      true,
    );
    assert.equal(
      shouldShowDailyA2hs({
        handheld: false,
        installed: false,
        lastDay: null,
        today: '2026-10-01',
      }),
      false,
    );
    assert.equal(
      shouldShowDailyA2hs({
        handheld: true,
        installed: true,
        lastDay: null,
        today: '2026-10-01',
      }),
      false,
    );
  });
});

describe('install detection', () => {
  it('treats standalone and iOS navigator.standalone as installed', () => {
    assert.equal(isInstalledDisplay({ displayModeStandalone: true }), true);
    assert.equal(
      isInstalledDisplay({ displayModeStandalone: false, navigatorStandalone: true }),
      true,
    );
    assert.equal(
      isInstalledDisplay({ displayModeStandalone: false, navigatorStandalone: false }),
      false,
    );
  });

  it('keeps desktop out and treats iPadOS as iOS handheld', () => {
    assert.equal(
      isHandheldClient({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' }),
      false,
    );
    assert.equal(isHandheldClient({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }), true);
    assert.equal(
      isIosClient({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
      true,
    );
    assert.equal(
      isIosClient({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l' }),
      false,
    );
  });

  it('uses related apps when display-mode is still a browser tab', async () => {
    assert.equal(
      await detectPwaInstalled({
        displayModeStandalone: false,
        getInstalledRelatedApps: async () => [{ platform: 'webapp' }],
      }),
      true,
    );
    assert.equal(
      await detectPwaInstalled({
        displayModeStandalone: false,
        getInstalledRelatedApps: async () => [],
      }),
      false,
    );
    assert.equal(await readInstalledRelated(async () => { throw new Error('nope'); }), false);
  });

  it('never fakes an install button on iOS', () => {
    assert.equal(a2hsSurface({ ios: true, promptReady: true }), 'ios-steps');
    assert.equal(a2hsSurface({ ios: false, promptReady: true }), 'android-prompt');
    assert.equal(a2hsSurface({ ios: false, promptReady: false }), 'fallback');
  });

  it('gives Chrome iOS its own Safari handoff, and does not wait for beforeinstallprompt', async () => {
    const crios =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
    const safariIphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    const androidChrome =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.73 Mobile Safari/537.36';

    assert.equal(isChromeIosClient({ userAgent: crios }), true);
    assert.equal(isChromeIosClient({ userAgent: safariIphone }), false);
    assert.equal(isChromeIosClient({ userAgent: androidChrome }), false);
    assert.equal(a2hsSurface({ ios: true, chromeIos: true, promptReady: true }), 'crios-safari');
    assert.equal(a2hsSurface({ ios: true, chromeIos: true, promptReady: false }), 'crios-safari');
    assert.equal(a2hsSurface({ ios: false, chromeIos: true, promptReady: true }), 'crios-safari');
    assert.equal(shouldAwaitInstallPrompt({ chromeIos: true }), false);
    assert.equal(shouldAwaitInstallPrompt({ chromeIos: false }), true);
    assert.ok(INSTALL_PROMPT_CAPTURE_SCRIPT.indexOf('CriOS') < INSTALL_PROMPT_CAPTURE_SCRIPT.indexOf('beforeinstallprompt'));

    assert.equal(CRIOS_SAFARI_PATH, 'Ouvre dans Safari → Partager → Ajouter à l’écran d’accueil');
    assert.match(CRIOS_SAFARI_COPY, /Safari/);
    assert.deepEqual([...CRIOS_SAFARI_STEPS], ['Partager', 'Ajouter à l’écran d’accueil']);
    assert.equal(CRIOS_COPY_LINK_LABEL, 'Copier le lien');
    assert.equal(CRIOS_COPIED_LABEL, 'Lien copié');
    assert.match(CRIOS_COPIED_HINT, /Safari/);

    const page = 'https://culture-connect.example/soiree?q=1#haut';
    assert.equal(safariHandoffUrl(page), page);
    assert.equal(safariHandoffUrl('javascript:alert(1)'), '');
    assert.equal(safariHandoffUrl('not a url'), '');
    let written = '';
    assert.equal(
      await copySafariHandoffUrl(page, async (value) => {
        written = value;
      }),
      true,
    );
    assert.equal(written, page);
    assert.equal(
      await copySafariHandoffUrl(page, async () => {
        throw new Error('denied');
      }),
      false,
    );
    assert.equal(await copySafariHandoffUrl('blob:https://x/1', async () => {}), false);
  });

  it('hides the account item until detection, then disables it once installed', () => {
    assert.equal(accountInstallItem(null), 'pending');
    assert.equal(accountInstallItem(false), 'download');
    assert.equal(accountInstallItem(true), 'installed');
  });
});

describe('service worker freshness only', () => {
  it('claims clients, skips waiting, and does not store an HTML shell', () => {
    const sw = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
    assert.match(sw, /skipWaiting\(/);
    assert.match(sw, /clients\.claim\(/);
    assert.match(sw, /cache:\s*'no-store'/);
    assert.match(sw, /text\/html/);
    assert.doesNotMatch(sw, /caches\.open|cache\.put|caches\.put/);
    assert.doesNotMatch(sw, /addEventListener\(\s*['"]push['"]/);
    assert.doesNotMatch(sw, /vapid/i);
    assert.doesNotMatch(sw, /pushManager/);
    assert.doesNotMatch(sw, /Notification/);
    assert.doesNotMatch(sw, /requestPermission/);
    assert.doesNotMatch(sw, /sync\.register/);
    assert.match(sw, /cc_vid/);
  });

  it('account menu and sheet stay free of push subscriptions', () => {
    const ui = readFileSync(path.join(process.cwd(), 'src/components/PwaInstall.tsx'), 'utf8');
    const menu = readFileSync(path.join(process.cwd(), 'src/components/AuthButtons.tsx'), 'utf8');
    const layout = readFileSync(path.join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    assert.match(menu, /Télécharger l’appli/);
    assert.match(menu, /Déjà installée/);
    assert.match(ui, /Installer Plan C/);
    assert.match(ui, /Ajouter à l’écran d’accueil/);
    assert.doesNotMatch(ui + menu, /vapid|pushManager|Notification/i);

    const criosStart = ui.indexOf("surface === 'crios-safari'");
    const iosStart = ui.indexOf("surface === 'ios-steps'");
    assert.ok(criosStart > 0 && iosStart > criosStart);
    const crios = ui.slice(criosStart, iosStart);
    assert.match(crios, /CRIOS_SAFARI_PATH/);
    assert.match(crios, /CRIOS_COPY_LINK_LABEL/);
    assert.match(crios, /data-testid="pwa-copy-link"/);
    assert.match(crios, /data-testid="pwa-safari-url"/);
    assert.doesNotMatch(crios, /Installer Plan C|pwa-install-button|onInstall/);
    assert.match(ui, /shouldAwaitInstallPrompt/);
    assert.ok(layout.indexOf('INSTALL_PROMPT_CAPTURE_SCRIPT') < layout.indexOf('<Providers'));
  });
});
