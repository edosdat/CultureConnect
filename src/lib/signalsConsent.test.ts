import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SIGNALS_CONSENT_COOKIE,
  SIGNALS_CONSENT_MAX_AGE_SEC,
  parseSignalsConsent,
  readSignalsConsent,
  writeSignalsConsent,
  clearSignalsConsent,
  hasAcceptedSignalsConsent,
} from './signalsConsent';
import { COOKIE_MAX_AGE_SEC, GUEST_STORAGE_KEY } from './signals';
import { VID_TTL_SEC } from './guestId';
import { DIGEST_OPT_IN_GATE_AT, digestTestWindowOpen } from './digestTestWindow';

type CookieJar = Map<string, string>;

function installCookieMock(jar: CookieJar) {
  const doc = {
    get cookie() {
      return [...jar.entries()]
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('; ');
    },
    set cookie(raw: string) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) return;
      const name = pair.slice(0, eq).trim();
      const value = decodeURIComponent(pair.slice(eq + 1).trim());
      if (/Max-Age=0/i.test(raw) || value === '') {
        jar.delete(name);
        return;
      }
      jar.set(name, value);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    value: {
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: doc,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'location', {
    value: { protocol: 'http:' },
    configurable: true,
    writable: true,
  });
}

function uninstallCookieMock() {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'location');
}

describe('P8 — signals consent parsing + cookie', () => {
  const jar: CookieJar = new Map();

  beforeEach(() => {
    jar.clear();
    installCookieMock(jar);
  });

  afterEach(() => {
    uninstallCookieMock();
  });

  it('parseSignalsConsent accepts only accepted|refused', () => {
    assert.equal(parseSignalsConsent('accepted'), 'accepted');
    assert.equal(parseSignalsConsent('refused'), 'refused');
    assert.equal(parseSignalsConsent('1'), null);
    assert.equal(parseSignalsConsent(''), null);
    assert.equal(parseSignalsConsent(null), null);
  });

  it('consent cookie name + ~6 months TTL', () => {
    assert.equal(SIGNALS_CONSENT_COOKIE, 'cc_signals_consent');
    assert.equal(SIGNALS_CONSENT_MAX_AGE_SEC, 6 * 30 * 24 * 60 * 60);
    // Tracer and audience stay well under the legal ceilings.
    assert.ok(COOKIE_MAX_AGE_SEC <= 13 * 30 * 24 * 60 * 60);
    assert.ok(VID_TTL_SEC <= 25 * 30 * 24 * 60 * 60);
  });

  it('write / read / clear consent choice', () => {
    assert.equal(readSignalsConsent(), null);
    assert.equal(hasAcceptedSignalsConsent(), false);
    writeSignalsConsent('accepted');
    assert.equal(jar.get(SIGNALS_CONSENT_COOKIE), 'accepted');
    assert.equal(readSignalsConsent(), 'accepted');
    assert.equal(hasAcceptedSignalsConsent(), true);
    writeSignalsConsent('refused');
    assert.equal(readSignalsConsent(), 'refused');
    assert.equal(hasAcceptedSignalsConsent(), false);
    clearSignalsConsent();
    assert.equal(jar.has(SIGNALS_CONSENT_COOKIE), false);
    assert.equal(readSignalsConsent(), null);
  });
});

describe('P8 — writeGuestStore gated on accept', () => {
  it('signalsStore refuses to persist without accepted consent', async () => {
    const src = await readFile(
      new URL('./signalsStore.ts', import.meta.url),
      'utf8',
    );
    assert.match(src, /hasAcceptedSignalsConsent/);
    assert.match(src, /P8: persist cc_signals_v1 only after explicit accept/);
    const writeFn = src.slice(
      src.indexOf('export function writeGuestStore'),
      src.indexOf('export function clearGuestStore'),
    );
    assert.match(writeFn, /if \(!hasAcceptedSignalsConsent\(\)\)/);
    assert.match(writeFn, /memoryStore = next/);
    assert.match(writeFn, /sessionStorage\.removeItem\(GUEST_STORAGE_KEY\)/);
    assert.match(writeFn, /deleteCookie\(GUEST_STORAGE_KEY\)/);
    assert.match(src, /export function clearGuestStorePersistence/);
    assert.equal(GUEST_STORAGE_KEY, 'cc_signals_v1');
  });

  it('SignalsProvider gates guest persist + server append on accept', async () => {
    const src = await readFile(
      new URL('../components/SignalsProvider.tsx', import.meta.url),
      'utf8',
    );
    assert.match(src, /acceptSignalsConsent/);
    assert.match(src, /refuseSignalsConsent/);
    assert.match(src, /writeSignalsConsent\('accepted'\)/);
    assert.match(src, /writeSignalsConsent\('refused'\)/);
    const commit = src.slice(
      src.indexOf('const commitGuestSignal'),
      src.indexOf('const enqueueOrSend'),
    );
    assert.match(commit, /hasAcceptedSignalsConsent\(\)/);
    assert.match(commit, /return Promise\.resolve\(\)/);
    assert.match(commit, /postGuestSignal\(signal\)/);
  });
});

describe('P8 — bandeau equal Refuser / Accepter + notice Art.21 + registre', () => {
  it('banner exposes Refuser tout and Accepter tout at same classes', async () => {
    const src = await readFile(
      new URL('../components/SignalsConsentBanner.tsx', import.meta.url),
      'utf8',
    );
    assert.match(src, /Refuser tout/);
    assert.match(src, /Accepter tout/);
    // Button labels (skip the file-header comment which also names them).
    const JSX_REFUSE = '            Refuser tout\n';
    const JSX_ACCEPT = '            Accepter tout\n';
    const refuseAt = src.indexOf(JSX_REFUSE);
    const acceptAt = src.indexOf(JSX_ACCEPT);
    assert.ok(refuseAt > 0, 'Refuser label in JSX');
    assert.ok(acceptAt > refuseAt, 'Accepter after Refuser');
    const btnClassRe =
      /className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-culture-ink bg-culture-surface px-4 text-sm font-semibold text-culture-ink hover:bg-culture-sand sm:flex-none sm:min-w-\[9\.5rem\]"/g;
    assert.equal([...src.matchAll(btnClassRe)].length, 2);
    // Same visual level: neither button uses terracotta / filled primary.
    const refuseBlock = src.slice(refuseAt - 320, refuseAt);
    const acceptBlock = src.slice(acceptAt - 320, acceptAt);
    assert.equal(refuseBlock.includes('bg-culture-terracotta'), false);
    assert.equal(acceptBlock.includes('bg-culture-terracotta'), false);
  });

  it('SiteFooter mounts SignalsConsentBanner', async () => {
    const src = await readFile(
      new URL('../components/SiteFooter.tsx', import.meta.url),
      'utf8',
    );
    assert.match(src, /SignalsConsentBanner/);
    assert.match(src, /<TasteCookieNotice \/>/);
    assert.equal(src.includes('digestTestWindowOpen'), false);
  });

  it('hides the CMP while the test window is open and restores it at the gate', async () => {
    const RealDate = Date;
    function withFrozenNow<T>(iso: string, fn: () => T): T {
      const frozen = RealDate.parse(iso);
      // ConstructorParameters<typeof Date> keeps only the last overload
      // (`new (value)`), so a zero-arg `new Date()` would be typed as impossible.
      type DateCtorArgs =
        | []
        | [value: number | string | Date]
        | [
            year: number,
            monthIndex: number,
            date?: number,
            hours?: number,
            minutes?: number,
            seconds?: number,
            ms?: number,
          ];
      function FrozenDate(this: Date, ...args: DateCtorArgs) {
        if (!new.target) return RealDate();
        if (args.length === 0) return new RealDate(frozen);
        if (args.length === 1) return new RealDate(args[0]);
        return new RealDate(...args);
      }
      FrozenDate.now = () => frozen;
      FrozenDate.parse = RealDate.parse;
      FrozenDate.UTC = RealDate.UTC;
      FrozenDate.prototype = RealDate.prototype;
      Object.setPrototypeOf(FrozenDate, RealDate);
      globalThis.Date = FrozenDate as DateConstructor;
      try {
        return fn();
      } finally {
        globalThis.Date = RealDate;
      }
    }

    assert.equal(
      DIGEST_OPT_IN_GATE_AT,
      RealDate.parse('2026-12-01T00:00:00+01:00'),
    );
    assert.equal(
      withFrozenNow('2026-10-01T12:00:00+02:00', () => digestTestWindowOpen()),
      true,
    );
    assert.equal(
      withFrozenNow('2026-12-01T00:00:00+01:00', () => digestTestWindowOpen()),
      false,
    );

    const banner = await readFile(
      new URL('../components/SignalsConsentBanner.tsx', import.meta.url),
      'utf8',
    );
    assert.match(banner, /if \(digestTestWindowOpen\(\)\) return null;/);
    assert.equal(banner.includes('writeSignalsConsent'), false);
    const notice = await readFile(
      new URL('../components/TasteCookieNotice.tsx', import.meta.url),
      'utf8',
    );
    assert.equal(notice.includes('digestTestWindowOpen'), false);
    const docs = await readFile(
      new URL('../../docs/design-brief.md', import.meta.url),
      'utf8',
    );
    assert.match(docs, /SignalsConsentBanner/);
    assert.match(docs, /TasteCookieNotice/);
    assert.match(docs, /1er décembre 2026, 00:00 Europe\/Paris/);
  });

  it('confidentialite names prénom, champ libre, clics + Art.21 + registre + durées', async () => {
    const conf = await readFile(
      new URL('../app/confidentialite/page.tsx', import.meta.url),
      'utf8',
    );
    assert.match(conf, /prénom/);
    assert.match(conf, /champ libre/);
    assert.match(conf, /historique de clics/);
    assert.match(conf, /Droit d&apos;opposition \(article 21\)/);
    assert.match(conf, /Registre des traitements/);
    assert.match(conf, /cc_signals_consent/);
    assert.match(conf, /bandeau de choix n&apos;est pas affiché/);
    assert.match(conf, /n&apos;enregistre pas un accord à ta place/);
    assert.match(conf, /1er décembre 2026, 00:00/);
    assert.match(conf, /≤&nbsp;13/);
    assert.match(conf, /≤&nbsp;25/);
    assert.match(conf, /~6&nbsp;mois/);
    // Pre-existing copy other suites assert on:
    assert.match(conf, /export interne limité/);
    assert.match(conf, /Partage/);
    assert.match(conf, /cc_vid/);
  });
});
