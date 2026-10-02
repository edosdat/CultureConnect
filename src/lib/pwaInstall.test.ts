import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  A2HS_BAR_HEIGHT_PX,
  A2HS_BAR_HINT,
  A2HS_BAR_HINT_MIN_PX,
  A2HS_BAR_ICON_PX,
  A2HS_BAR_ICON_SRC,
  A2HS_BAR_LABEL,
  A2HS_BAR_LABEL_NARROW,
  A2HS_BAR_NARROW_PX,
  A2HS_BAR_OFFSET_VAR,
  CRIOS_COPIED_HINT,
  CRIOS_COPIED_LABEL,
  CRIOS_COPY_LINK_LABEL,
  CRIOS_SAFARI_COPY,
  CRIOS_SAFARI_PATH,
  CRIOS_SAFARI_STEPS,
  INSTALL_PROMPT_CAPTURE_SCRIPT,
  ANDROID_INSTALL_LABEL,
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
  IOS_SAFARI_BAR_MIN_GAP_PX,
  IOS_SAFARI_TOP_MIN_GAP_PX,
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
  isIpadClient,
  isInstalledDisplay,
  isIosClient,
  nativeInstallTap,
  readInstalledRelated,
  sheetSurfaceWhenOpening,
  safariBottomChromePx,
  safariHandoffUrl,
  shouldAwaitInstallPrompt,
  shouldShowA2hsBar,
  a2hsBarLabel,
  a2hsBarShowsHint,
} from './pwaInstall';
import {
  canOpenA2hsSheet,
  feedbackOpenAllowed,
  pushPromptAllowed,
  stickyInstallHidden,
  toastBlockedByModal,
} from './overlayStack';
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

describe('sticky A2HS bar', () => {
  it('shows on every web visit until install, phone and desktop', () => {
    assert.equal(shouldShowA2hsBar({ installed: false }), true);
    assert.equal(shouldShowA2hsBar({ installed: true }), false);
    assert.equal(shouldShowA2hsBar({ installed: null }), false);
  });

  it('keeps a one-line CTA and drops the hint when the strip is narrow', () => {
    assert.equal(A2HS_BAR_LABEL, 'Télécharger l’appli');
    assert.equal(A2HS_BAR_LABEL_NARROW, 'Télécharger');
    assert.equal(A2HS_BAR_HINT, 'Tu peux télécharger l’appli');
    assert.equal(a2hsBarLabel(359), A2HS_BAR_LABEL_NARROW);
    assert.equal(a2hsBarLabel(A2HS_BAR_NARROW_PX), A2HS_BAR_LABEL);
    assert.equal(a2hsBarLabel(1280), A2HS_BAR_LABEL);
    assert.equal(a2hsBarLabel(Number.NaN), A2HS_BAR_LABEL);
    assert.equal(a2hsBarShowsHint(389), false);
    assert.equal(a2hsBarShowsHint(A2HS_BAR_HINT_MIN_PX), true);
    assert.equal(a2hsBarShowsHint(Number.NaN), false);
  });

  it('locks the cream strip height and the violet C', () => {
    assert.equal(A2HS_BAR_HEIGHT_PX, 44);
    assert.ok(A2HS_BAR_HEIGHT_PX >= 40 && A2HS_BAR_HEIGHT_PX <= 44);
    assert.equal(A2HS_BAR_ICON_SRC, '/plan-c-icon-LOCK-v3-violet.jpg');
    assert.ok(A2HS_BAR_ICON_PX >= 20 && A2HS_BAR_ICON_PX <= 24);
    assert.equal(A2HS_BAR_OFFSET_VAR, '--a2hs-bar-h');
  });
});

describe('overlay stack', () => {
  it('keeps a single blocking surface and hides the sticky bar under it', () => {
    assert.equal(stickyInstallHidden({ digestOpen: false, a2hsSheetOpen: false }), false);
    assert.equal(stickyInstallHidden({ digestOpen: true, a2hsSheetOpen: false }), true);
    assert.equal(stickyInstallHidden({ digestOpen: false, a2hsSheetOpen: true }), true);
    assert.equal(canOpenA2hsSheet({ digestOpen: false }), true);
    assert.equal(canOpenA2hsSheet({ digestOpen: true }), false);
    assert.equal(feedbackOpenAllowed({ a2hsSheetOpen: false }), true);
    assert.equal(feedbackOpenAllowed({ a2hsSheetOpen: true }), false);
    assert.equal(pushPromptAllowed({ digestOpen: false, a2hsSheetOpen: false }), true);
    assert.equal(pushPromptAllowed({ digestOpen: true, a2hsSheetOpen: false }), false);
    assert.equal(pushPromptAllowed({ digestOpen: false, a2hsSheetOpen: true }), false);
    assert.equal(toastBlockedByModal({ digestOpen: false, a2hsSheetOpen: false }), false);
    assert.equal(toastBlockedByModal({ digestOpen: true, a2hsSheetOpen: false }), true);
    assert.equal(toastBlockedByModal({ digestOpen: false, a2hsSheetOpen: true }), true);
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
    assert.equal(a2hsSurface({ ios: true, ipad: false, promptReady: true }), 'safari-iphone');
    assert.equal(a2hsSurface({ ios: true, ipad: true, promptReady: true }), 'safari-ipad');
    assert.equal(a2hsSurface({ ios: false, ipad: false, promptReady: true }), 'android-prompt');
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
    assert.equal(
      CRIOS_SAFARI_COPY,
      'Sur iPhone, ouvre Plan C dans Safari, puis Partager → Sur l’écran d’accueil.',
    );
    assert.deepEqual([...CRIOS_SAFARI_STEPS], ['Partager', 'Sur l’écran d’accueil']);
    assert.equal(CRIOS_COPIED_HINT, 'Colle-le dans Safari, puis Partager → Sur l’écran d’accueil.');
    assert.doesNotMatch(`${CRIOS_SAFARI_PATH} ${CRIOS_SAFARI_COPY} ${CRIOS_COPIED_HINT}`, /carré \+ flèche|navigator\.share/);
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

  it('branches Safari iPhone, iPad, CriOS and Android Chrome by UA', () => {
    const iphoneUas = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPod touch; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ];
    for (const userAgent of iphoneUas) {
      for (const promptReady of [false, true]) {
        const surface = a2hsSurfaceForClient({ userAgent, promptReady });
        assert.equal(surface, 'safari-iphone', userAgent);
        assert.equal(isIpadClient({ userAgent }), false, userAgent);
      }
    }

    const ipadUa =
      'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    assert.equal(a2hsSurfaceForClient({ userAgent: ipadUa, promptReady: true }), 'safari-ipad');
    assert.equal(a2hsSurfaceForClient({ userAgent: ipadUa, promptReady: false }), 'safari-ipad');
    assert.equal(isIpadClient({ userAgent: ipadUa }), true);

    const ipadDesktop = a2hsSurfaceForClient({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      promptReady: true,
    });
    assert.equal(ipadDesktop, 'safari-ipad');
    assert.equal(
      isIpadClient({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
      true,
    );
    assert.equal(
      isIpadClient({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
      false,
    );

    const criosIphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
    const criosIpad =
      'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
    assert.equal(a2hsSurfaceForClient({ userAgent: criosIphone, promptReady: false }), 'crios-safari');
    assert.equal(a2hsSurfaceForClient({ userAgent: criosIphone, promptReady: true }), 'crios-safari');
    assert.equal(a2hsSurfaceForClient({ userAgent: criosIpad, promptReady: true }), 'crios-safari');
    assert.equal(isIpadClient({ userAgent: criosIpad }), true);

    const androidChrome =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.73 Mobile Safari/537.36';
    assert.equal(a2hsSurfaceForClient({ userAgent: androidChrome, promptReady: true }), 'android-prompt');
    assert.equal(a2hsSurfaceForClient({ userAgent: androidChrome, promptReady: false }), 'fallback');
    assert.equal(isChromeIosClient({ userAgent: iphoneUas[0] }), false);
    assert.equal(isIosClient({ userAgent: iphoneUas[0] }), true);
    assert.equal(ANDROID_INSTALL_LABEL, 'Installer Plan C');
  });

  it('locks the iPad Safari strings and mirrors them for the iPhone bottom bar', () => {
    assert.equal(IPAD_SAFARI_PATH, 'Barre Safari (en haut) → Partager → Sur l’écran d’accueil');
    assert.equal(
      IPAD_SHARE_UNAVAILABLE,
      'Tape l’icône Partager en haut de Safari, puis Sur l’écran d’accueil.',
    );
    assert.equal(IPAD_DISMISS, 'Fermer pour toucher Partager en haut');
    assert.equal(IPAD_A2HS_HINT, 'Dans le menu Partager de Safari. Pas le bouton de cette fiche.');
    assert.equal(IPAD_A2HS_LABEL, 'Sur l’écran d’accueil');

    assert.equal(IPHONE_SAFARI_PATH, 'Barre Safari (en bas) → Partager → Sur l’écran d’accueil');
    assert.equal(
      IPHONE_SHARE_UNAVAILABLE,
      'Tape l’icône Partager en bas de Safari, puis Sur l’écran d’accueil.',
    );
    assert.equal(IPHONE_DISMISS, 'Fermer pour toucher Partager en bas');
    assert.equal(IPHONE_A2HS_HINT, 'Dans le menu Partager de Safari. Pas le bouton de cette fiche.');
    assert.equal(IPHONE_A2HS_LABEL, 'Sur l’écran d’accueil');
    assert.notEqual(IPHONE_SAFARI_PATH, IPAD_SAFARI_PATH);
    assert.equal(acceptsIosA2hsLabel(IPAD_A2HS_LABEL), true);
    assert.equal(acceptsIosA2hsLabel('Ajouter à l’écran d’accueil'), true);
    assert.equal(acceptsIosA2hsLabel("Sur l'écran d'accueil"), true);
    assert.equal(acceptsIosA2hsLabel('  ajouter à l’écran d’accueil  '), true);
    assert.equal(acceptsIosA2hsLabel('« Sur l’écran d’accueil »'), true);
    assert.equal(acceptsIosA2hsLabel('Copier le lien'), false);
    assert.equal(acceptsIosA2hsLabel('Installer'), false);
    assert.equal(acceptsIosA2hsLabel(''), false);
  });

  it('never offers a dead Installer tap on Safari, and waits for UA flags', () => {
    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    const flags = iosInstallFlags({ userAgent: safari });
    assert.deepEqual(flags, { ios: true, ipad: false, chromeIos: false });
    assert.equal(canShowNativeInstallButton({ ...flags, promptReady: true }), false);
    assert.equal(canShowNativeInstallButton({ ...flags, promptReady: false }), false);
    const ipad = iosInstallFlags({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    });
    assert.equal(ipad.ipad, true);
    assert.equal(canShowNativeInstallButton({ ...ipad, promptReady: true }), false);
    assert.equal(nativeInstallTap({ ...flags, promptReady: true }), 'skip');
    assert.equal(nativeInstallTap({ ...ipad, promptReady: true }), 'skip');
    assert.equal(nativeInstallTap({ ios: false, ipad: false, chromeIos: true, promptReady: true }), 'skip');
    assert.equal(nativeInstallTap({ ios: false, ipad: false, chromeIos: false, promptReady: false }), 'skip');
    assert.equal(nativeInstallTap({ ios: false, ipad: false, chromeIos: false, promptReady: true }), 'prompt');
    assert.equal(sheetSurfaceWhenOpening({ flags: null, promptReady: false }), null);
    assert.equal(sheetSurfaceWhenOpening({ flags: null, promptReady: true }), null);
    assert.equal(sheetSurfaceWhenOpening({ flags, promptReady: true }), 'safari-iphone');
    assert.equal(sheetSurfaceWhenOpening({ flags: ipad, promptReady: true }), 'safari-ipad');
    assert.equal(
      sheetSurfaceWhenOpening({
        flags: { ios: false, ipad: false, chromeIos: false },
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
    assert.equal(iosSheetBottomGapPx(80), IOS_SAFARI_BAR_MIN_GAP_PX);
    assert.equal(iosSheetBottomGapPx(120), 120);
    assert.equal(IOS_SAFARI_TOP_MIN_GAP_PX, 96);
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
    assert.doesNotMatch(menu, /pwa-install-sheet|crios-safari|safari-iphone|safari-ipad/);
    assert.match(ui, /ANDROID_INSTALL_LABEL/);
    assert.match(ui, /data-testid="pwa-android-prompt"/);
    assert.match(ui, /data-testid="pwa-install-button"/);
    assert.match(ui, /IPHONE_SAFARI_PATH/);
    assert.match(ui, /IPAD_SAFARI_PATH/);
    assert.match(ui, /IOS_SAFARI_TOP_MIN_GAP_PX/);
    assert.doesNotMatch(ui, /Ajouter à l’écran d’accueil/);
    assert.match(ui, /safariIpad \? 'top-mid' : safariIphone \? 'above-bottom' : 'bottom'/);
    assert.match(ui, /paddingTop: IOS_SAFARI_TOP_MIN_GAP_PX/);
    assert.doesNotMatch(ui, /shareIosInstallPage|navigator\.share|pwa-ios-share-arrow/);
    const sheetOnly = ui.slice(ui.indexOf('function InstallSheet'), ui.indexOf('export function A2hsDownloadBar'));
    assert.doesNotMatch(sheetOnly, /bg-culture-cream/);
    assert.match(ui, /canShowNativeInstallButton/);
    assert.match(ui, /\{showInstall \?/);
    assert.match(ui, /nativeInstallTap/);
    assert.match(ui, /open && installed !== true && installFlags/);
    assert.doesNotMatch(ui + menu, /vapid|pushManager|Notification/i);

    const androidStart = ui.indexOf('data-testid="pwa-android-prompt"');
    const criosStart = ui.indexOf("{surface === 'crios-safari'");
    const iphoneStart = ui.indexOf("{surface === 'safari-iphone'");
    const ipadStart = ui.indexOf("{surface === 'safari-ipad'");
    const fallbackStart = ui.indexOf("{surface === 'fallback'");
    assert.ok(androidStart > 0 && criosStart > androidStart && iphoneStart > criosStart);
    assert.ok(ipadStart > iphoneStart && fallbackStart > ipadStart);
    const android = ui.slice(androidStart, criosStart);
    const crios = ui.slice(criosStart, iphoneStart);
    const iphone = ui.slice(iphoneStart, ipadStart);
    const ipad = ui.slice(ipadStart, fallbackStart);
    assert.match(android, /ANDROID_INSTALL_LABEL/);
    assert.match(android, /onInstall/);
    assert.doesNotMatch(android, /IPHONE_SAFARI_PATH|IPAD_SAFARI_PATH|CRIOS_COPY_LINK_LABEL/);
    assert.match(crios, /CRIOS_SAFARI_PATH/);
    assert.match(crios, /CRIOS_COPY_LINK_LABEL/);
    assert.match(crios, /data-testid="pwa-copy-link"/);
    assert.match(crios, /data-testid="pwa-safari-url"/);
    assert.match(crios, /data-testid="pwa-crios-safari-steps"/);
    assert.doesNotMatch(crios, /pwa-install-button|onInstall|navigator\.share|IPHONE_SAFARI_PATH|IPAD_SAFARI_PATH/);
    assert.match(iphone, /rootTestId="pwa-iphone-safari"/);
    assert.match(iphone, /pathTestId="pwa-iphone-safari-path"/);
    assert.match(iphone, /unavailableTestId="pwa-iphone-share-unavailable"/);
    assert.match(iphone, /IPHONE_SAFARI_PATH/);
    assert.match(iphone, /IPHONE_SHARE_UNAVAILABLE/);
    assert.match(iphone, /IPHONE_A2HS_HINT/);
    assert.doesNotMatch(iphone, /IPAD_SAFARI_PATH|CRIOS_|pwa-install-button|<button|navigator\.share/);
    assert.match(ipad, /rootTestId="pwa-ipad-safari"/);
    assert.match(ipad, /pathTestId="pwa-ipad-safari-path"/);
    assert.match(ipad, /unavailableTestId="pwa-ipad-share-unavailable"/);
    assert.match(ipad, /IPAD_SAFARI_PATH/);
    assert.match(ipad, /IPAD_SHARE_UNAVAILABLE/);
    assert.match(ipad, /IPAD_A2HS_HINT/);
    assert.doesNotMatch(ipad, /IPHONE_SAFARI_PATH|CRIOS_|pwa-install-button|<button|navigator\.share/);
    assert.match(ui, /data-tap="inert"/);
    assert.match(ui, /IPHONE_DISMISS/);
    assert.match(ui, /IPAD_DISMISS/);
    assert.match(ui, /data-pwa-arrow="up"/);
    assert.match(ui, /data-testid="pwa-ipad-share-arrow"/);
    assert.match(ui, /data-pwa-arrow="down"/);
    assert.match(ui, /data-testid="pwa-iphone-share-arrow"/);
    assert.match(ui, /Plus tard/);
    assert.doesNotMatch(ui, /navigator\.share/);
    const openBody = ui.slice(ui.indexOf('const openInstall = useCallback'), ui.indexOf('const onInstall'));
    assert.ok(openBody.indexOf('iosInstallFlags') >= 0);
    assert.ok(openBody.indexOf('setOpen(true)') > openBody.indexOf('iosInstallFlags'));
    assert.match(ui, /openInstall = useCallback/);
    assert.equal(ui.split('<InstallSheet').length - 1, 1);
    assert.match(ui, /shouldAwaitInstallPrompt/);
    assert.ok(layout.indexOf('INSTALL_PROMPT_CAPTURE_SCRIPT') < layout.indexOf('<Providers'));
  });

  it('sticks a download strip under the header and never auto-opens the sheet', () => {
    const ui = readFileSync(path.join(process.cwd(), 'src/components/PwaInstall.tsx'), 'utf8');
    const nav = readFileSync(path.join(process.cwd(), 'src/components/SiteNav.tsx'), 'utf8');
    const home = readFileSync(path.join(process.cwd(), 'src/components/CultureConnectApp.tsx'), 'utf8');
    const boot = readFileSync(path.join(process.cwd(), 'src/components/HomeBootChrome.tsx'), 'utf8');
    const css = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const menu = readFileSync(path.join(process.cwd(), 'src/components/AuthButtons.tsx'), 'utf8');

    assert.match(nav, /<A2hsDownloadBar \/>/);
    assert.ok(nav.indexOf('<A2hsDownloadBar />') > nav.indexOf('</nav>'));
    assert.match(ui, /data-testid="pwa-download-bar"/);
    assert.match(ui, /data-testid="pwa-download-bar-action"/);
    assert.match(ui, /data-testid="pwa-download-bar-icon"/);
    assert.match(ui, /onClick=\{openInstall\}/);
    assert.match(ui, /shouldShowA2hsBar/);
    assert.match(ui, /sticky top-0 z-\[45\]/);
    assert.match(ui, /stickyInstallHidden/);
    assert.match(ui, /canOpenA2hsSheet/);
    assert.ok(ui.indexOf('canOpenA2hsSheet') < ui.indexOf('setOpen(true)'));
    assert.match(ui, /setA2hsSheetBlocking\(false\)/);
    assert.match(ui, /h-11/);
    assert.match(ui, /min-h-9/);
    assert.match(ui, /px-3/);
    assert.match(ui, /gap-2\.5/);
    assert.match(ui, /bg-culture-cream/);
    assert.match(ui, /bg-culture-terracotta/);
    assert.match(ui, /border-culture-terracotta\/\[0\.12\]/);
    assert.match(ui, /A2HS_BAR_ICON_SRC/);
    assert.match(ui, /min-\[360px\]:hidden/);
    assert.match(ui, /min-\[360px\]:inline/);
    assert.match(ui, /min-\[390px\]:block/);
    assert.equal(ui.split('setOpen(true)').length - 1, 1);
    const openAt = ui.indexOf('const openInstall = useCallback');
    assert.ok(openAt >= 0);
    assert.ok(ui.indexOf('setOpen(true)') > openAt);
    assert.doesNotMatch(ui, /planc_a2hs_day|shouldShowDailyA2hs|A2HS_DAY_KEY|localStorage|sessionStorage/);
    assert.doesNotMatch(ui, /data-testid="pwa-download-bar"[\s\S]*aria-label="Fermer"/);

    const barStart = ui.indexOf('export function A2hsDownloadBar');
    const barEnd = ui.indexOf('function ShellRefreshTip');
    const bar = ui.slice(barStart, barEnd);
    assert.doesNotMatch(bar, /Plus tard|Fermer|sessionStorage|localStorage/);
    assert.match(bar, /A2HS_BAR_LABEL/);
    const iconClass = bar.match(/data-testid="pwa-download-bar-icon"[\s\S]*?className="([^"]+)"/);
    assert.ok(iconClass);
    assert.doesNotMatch(iconClass[1], /terracotta/);

    assert.match(css, /--a2hs-bar-h:\s*0px/);
    assert.match(home, /top-\[var\(--a2hs-bar-h\)\]/);
    assert.match(boot, /top-\[var\(--a2hs-bar-h\)\]/);
    assert.doesNotMatch(home, /data-testid="pwa-download-bar"/);
    assert.match(menu, /Télécharger l’appli/);
    assert.match(menu, /openInstall\(\)/);

    const digest = readFileSync(path.join(process.cwd(), 'src/components/DigestTestIntro.tsx'), 'utf8');
    const feedback = readFileSync(path.join(process.cwd(), 'src/components/FeedbackChat.tsx'), 'utf8');
    const share = readFileSync(path.join(process.cwd(), 'src/components/ShareButton.tsx'), 'utf8');
    assert.match(digest, /dismissA2hsSheetForDigest/);
    assert.match(digest, /setDigestBlocking\(true\)/);
    assert.match(digest, /z-\[70\]/);
    assert.match(feedback, /feedbackOpenAllowed/);
    assert.match(feedback, /z-40/);
    assert.match(ui, /z-\[160\]/);
    assert.match(share, /toastBlockedByModal/);
    assert.match(share, /z-50/);
    assert.doesNotMatch(share, /z-\[200\]/);
  });
});
