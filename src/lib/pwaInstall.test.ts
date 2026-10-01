import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  A2HS_DAY_KEY,
  a2hsSurface,
  accountInstallItem,
  detectPwaInstalled,
  isHandheldClient,
  isInstalledDisplay,
  isIosClient,
  localDayStamp,
  readInstalledRelated,
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
    assert.match(menu, /Télécharger l’appli/);
    assert.match(menu, /Déjà installée/);
    assert.match(ui, /Installer Plan C/);
    assert.match(ui, /Ajouter à l’écran d’accueil/);
    assert.doesNotMatch(ui + menu, /vapid|pushManager|Notification/i);
  });
});
