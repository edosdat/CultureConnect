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
  IOS_A2HS_HINT,
  IOS_A2HS_LABEL,
  IOS_DISMISS_TO_SHARE,
  IOS_SAFARI_ARROW_PX,
  IOS_SAFARI_BAR_MIN_GAP_PX,
  IOS_SAFARI_PATH,
  IOS_SAFARI_STEPS,
  IOS_SHARE_LABEL,
  IOS_SHARE_TITLE,
  IOS_SHARE_UNAVAILABLE,
  a2hsSurface,
  a2hsSurfaceForClient,
  acceptsIosA2hsLabel,
  accountInstallItem,
  canShowNativeInstallButton,
  copySafariHandoffUrl,
  detectPwaInstalled,
  iosInstallFlags,
  iosSheetBottomGapPx,
  isChromeIosClient,
  isHandheldClient,
  isInstalledDisplay,
  isIosClient,
  localDayStamp,
  nativeInstallTap,
  readInstalledRelated,
  sheetSurfaceWhenOpening,
  safariBottomChromePx,
  safariHandoffUrl,
  shareIosInstallPage,
  iosSharePayload,
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

    assert.equal(CRIOS_SAFARI_PATH, 'Ouvre dans Safari → Partager → Sur l’écran d’accueil');
    assert.match(CRIOS_SAFARI_COPY, /Partager → Sur l’écran d’accueil/);
    assert.deepEqual([...CRIOS_SAFARI_STEPS], ['Partager', 'Sur l’écran d’accueil']);
    assert.match(CRIOS_COPIED_HINT, /Partager → Sur l’écran d’accueil/);
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

  it('keeps a Safari iPhone on ios-steps, never crios-safari or Installer', () => {
    const safariUas = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPod touch; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ];
    for (const userAgent of safariUas) {
      for (const promptReady of [false, true]) {
        const surface = a2hsSurfaceForClient({ userAgent, promptReady });
        assert.equal(surface, 'ios-steps', userAgent);
        assert.notEqual(surface, 'crios-safari');
        assert.notEqual(surface, 'android-prompt');
      }
    }

    const ipadDesktop = a2hsSurfaceForClient({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      promptReady: true,
    });
    assert.equal(ipadDesktop, 'ios-steps');

    const crios =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
    assert.equal(a2hsSurfaceForClient({ userAgent: crios, promptReady: false }), 'crios-safari');
    assert.equal(a2hsSurfaceForClient({ userAgent: crios, promptReady: true }), 'crios-safari');

    const androidChrome =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.73 Mobile Safari/537.36';
    assert.equal(a2hsSurfaceForClient({ userAgent: androidChrome, promptReady: true }), 'android-prompt');
    assert.equal(a2hsSurfaceForClient({ userAgent: androidChrome, promptReady: false }), 'fallback');
    assert.equal(isChromeIosClient({ userAgent: safariUas[0] }), false);
    assert.equal(isIosClient({ userAgent: safariUas[0] }), true);
  });

  it('names the French Safari row Sur l’écran d’accueil and still accepts Ajouter', () => {
    assert.equal(IOS_SHARE_LABEL, 'Partager');
    assert.equal(IOS_A2HS_LABEL, 'Sur l’écran d’accueil');
    assert.equal(IOS_A2HS_HINT, 'Dans le menu Partager. Pas un bouton ici.');
    assert.equal(IOS_SAFARI_PATH, 'Barre Safari → Partager → Sur l’écran d’accueil');
    assert.equal(IOS_SHARE_UNAVAILABLE, 'Tape Partager en bas de Safari, puis Sur l’écran d’accueil.');
    assert.equal(IOS_SHARE_TITLE, 'Plan C');
    assert.equal(IOS_DISMISS_TO_SHARE, 'Fermer pour toucher Partager');
    assert.deepEqual(
      IOS_SAFARI_STEPS.map((step) => step.label),
      ['Partager', 'Sur l’écran d’accueil'],
    );
    assert.equal(acceptsIosA2hsLabel(IOS_A2HS_LABEL), true);
    assert.equal(acceptsIosA2hsLabel('Ajouter à l’écran d’accueil'), true);
    assert.equal(acceptsIosA2hsLabel("Sur l'écran d'accueil"), true);
    assert.equal(acceptsIosA2hsLabel('  ajouter à l’écran d’accueil  '), true);
    assert.equal(acceptsIosA2hsLabel('« Sur l’écran d’accueil »'), true);
    assert.equal(acceptsIosA2hsLabel('Copier le lien'), false);
    assert.equal(acceptsIosA2hsLabel('Installer'), false);
    assert.equal(acceptsIosA2hsLabel(''), false);
  });

  it('shares url and title, and falls back when share is unavailable', async () => {
    const page = 'https://culture-connect.example/soiree?q=1#haut';
    assert.deepEqual(iosSharePayload(page), { url: page, title: 'Plan C' });
    assert.equal(iosSharePayload('javascript:alert(1)'), null);
    let shared: { url: string; title: string } | null = null;
    assert.equal(
      await shareIosInstallPage(page, async (data) => {
        shared = data;
      }),
      'shared',
    );
    assert.deepEqual(shared, { url: page, title: 'Plan C' });
    assert.equal(
      await shareIosInstallPage(page, async () => {
        const cancel = new Error('cancel');
        cancel.name = 'AbortError';
        throw cancel;
      }),
      'dismissed',
    );
    assert.equal(
      await shareIosInstallPage(page, async () => {
        throw new Error('blocked');
      }),
      'unavailable',
    );
    assert.equal(await shareIosInstallPage('blob:https://x/1', async () => {}), 'unavailable');
  });

  it('never offers a dead Installer tap on Safari, and waits for UA flags', () => {
    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    const flags = iosInstallFlags({ userAgent: safari });
    assert.deepEqual(flags, { ios: true, chromeIos: false });
    assert.equal(canShowNativeInstallButton({ ...flags, promptReady: true }), false);
    assert.equal(canShowNativeInstallButton({ ...flags, promptReady: false }), false);
    assert.equal(nativeInstallTap({ ...flags, promptReady: true }), 'skip');
    assert.equal(nativeInstallTap({ ios: false, chromeIos: true, promptReady: true }), 'skip');
    assert.equal(nativeInstallTap({ ios: false, chromeIos: false, promptReady: false }), 'skip');
    assert.equal(nativeInstallTap({ ios: false, chromeIos: false, promptReady: true }), 'prompt');
    assert.equal(sheetSurfaceWhenOpening({ flags: null, promptReady: false }), null);
    assert.equal(sheetSurfaceWhenOpening({ flags: null, promptReady: true }), null);
    assert.equal(sheetSurfaceWhenOpening({ flags, promptReady: true }), 'ios-steps');
    assert.equal(
      sheetSurfaceWhenOpening({
        flags: { ios: false, chromeIos: false },
        promptReady: false,
      }),
      'fallback',
    );
  });

  it('lifts the Safari sheet above the bottom bar', () => {
    assert.equal(
      safariBottomChromePx({
        innerHeight: 800,
        visualViewportHeight: 720,
        visualViewportOffsetTop: 0,
      }),
      80,
    );
    assert.equal(
      safariBottomChromePx({
        innerHeight: 700,
        visualViewportHeight: 700,
        visualViewportOffsetTop: 0,
      }),
      0,
    );
    assert.equal(
      safariBottomChromePx({
        innerHeight: Number.NaN,
        visualViewportHeight: 700,
        visualViewportOffsetTop: 0,
      }),
      0,
    );
    assert.equal(iosSheetBottomGapPx(0), IOS_SAFARI_BAR_MIN_GAP_PX);
    assert.equal(iosSheetBottomGapPx(80), 80 + IOS_SAFARI_ARROW_PX);
    assert.ok(iosSheetBottomGapPx(0) >= IOS_SAFARI_ARROW_PX);
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
    assert.match(menu, /openInstall\(\)/);
    assert.doesNotMatch(menu, /pwa-install-sheet|crios-safari|ios-steps/);
    assert.match(ui, /Installer Plan C/);
    assert.match(ui, /IOS_A2HS_LABEL/);
    assert.doesNotMatch(ui, /Ajouter à l’écran d’accueil/);
    assert.match(ui, /data-pwa-anchor=\{clearSafariBar \? 'top' : 'bottom'\}/);
    assert.match(ui, /IOS_SHARE_UNAVAILABLE/);
    assert.match(ui, /shareIosInstallPage/);
    assert.match(ui, /IOS_SAFARI_PATH/);
    assert.match(ui, /canShowNativeInstallButton/);
    assert.match(ui, /\{showInstall \?/);
    assert.match(ui, /nativeInstallTap/);
    assert.match(ui, /open && installed !== true && installFlags/);
    assert.doesNotMatch(ui + menu, /vapid|pushManager|Notification/i);

    const criosStart = ui.indexOf("{surface === 'crios-safari'");
    const iosStart = ui.indexOf("{surface === 'ios-steps'");
    const fallbackStart = ui.indexOf("{surface === 'fallback'");
    assert.ok(criosStart > 0 && iosStart > criosStart && fallbackStart > iosStart);
    const crios = ui.slice(criosStart, iosStart);
    const ios = ui.slice(iosStart, fallbackStart);
    assert.match(crios, /CRIOS_SAFARI_PATH/);
    assert.match(crios, /CRIOS_COPY_LINK_LABEL/);
    assert.match(crios, /data-testid="pwa-copy-link"/);
    assert.match(crios, /data-testid="pwa-safari-url"/);
    assert.doesNotMatch(crios, /Installer Plan C|pwa-install-button|onInstall/);
    assert.match(ios, /data-testid="pwa-install-ios"/);
    assert.match(ios, /data-testid="pwa-ios-share"/);
    assert.match(ios, /data-testid="pwa-ios-share-fallback"/);
    assert.match(ios, /data-testid="pwa-ios-step-a2hs"/);
    assert.match(ios, /IOS_SHARE_LABEL/);
    assert.match(ios, /IOS_SHARE_UNAVAILABLE/);
    assert.match(ios, /IOS_A2HS_LABEL/);
    assert.match(ios, /IOS_A2HS_HINT/);
    assert.match(ios, /IOS_SAFARI_PATH/);
    assert.match(ios, /onIosShare/);
    assert.doesNotMatch(ios, /<li|pwa-ios-a2hs-alt|Ajouter à l’écran d’accueil/);
    const a2hs = ios.slice(ios.indexOf('data-testid="pwa-ios-step-a2hs"'));
    assert.match(a2hs, /data-tap="inert"/);
    assert.doesNotMatch(a2hs, /<button|onClick/);
    assert.doesNotMatch(ios, /bg-culture-terracotta|pwa-install-button|Installer Plan C/);
    assert.doesNotMatch(ios, /CRIOS_COPY_LINK_LABEL|pwa-copy-link/);
    assert.match(ui, /data-testid="pwa-ios-share-arrow"/);
    assert.match(ui, /data-testid=\{clearSafariBar \? 'pwa-ios-dismiss-share'/);
    assert.doesNotMatch(
      ui.slice(ui.indexOf("data-testid={clearSafariBar ? 'pwa-ios-dismiss-share'"), ui.indexOf('Plus tard')),
      /bg-culture-terracotta/,
    );
    const openBody = ui.slice(ui.indexOf('const openInstall = useCallback'), ui.indexOf('const onInstall'));
    assert.ok(openBody.indexOf('iosInstallFlags') >= 0);
    assert.ok(openBody.indexOf('setOpen(true)') > openBody.indexOf('iosInstallFlags'));
    assert.match(ui, /openInstall = useCallback/);
    assert.equal(ui.split('<InstallSheet').length - 1, 1);
    assert.match(ui, /shouldAwaitInstallPrompt/);
    assert.ok(layout.indexOf('INSTALL_PROMPT_CAPTURE_SCRIPT') < layout.indexOf('<Providers'));
  });
});
