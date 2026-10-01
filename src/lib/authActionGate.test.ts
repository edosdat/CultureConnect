import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  AUTH_GATE_ERROR,
  AUTH_GATE_GOOGLE,
  AUTH_GATE_LATER,
  AUTH_GATE_RESUME_RETRY,
  AUTH_GATE_TITLE,
  AUTH_GATE_WHY,
  authGateReturnHref,
  authGateWhy,
  parsePendingAuthAction,
  pendingMatches,
  shouldResumePending,
  type PendingAuthAction,
} from './authActionGate';

function pending(overrides: Partial<PendingAuthAction> = {}): PendingAuthAction {
  return {
    kind: 'envie',
    itemKey: 'p:P1847',
    seanceKey: null,
    token: null,
    href: '/?e=p%3AP1847',
    armed: true,
    at: 1_000,
    ...overrides,
  };
}

describe('auth gate copy — Soft LOCK', () => {
  it('locks the shared chrome and one why line per action', () => {
    assert.equal(AUTH_GATE_TITLE, 'Connexion rapide');
    assert.equal(AUTH_GATE_WHY.share, 'Pour envoyer le lien et le retrouver plus tard.');
    assert.equal(AUTH_GATE_WHY.envie, 'Pour retrouver tes goûts.');
    assert.equal(AUTH_GATE_WHY.going, 'Pour voir qui vient.');
    assert.equal(authGateWhy('share'), AUTH_GATE_WHY.share);
    assert.equal(AUTH_GATE_GOOGLE, 'Continuer avec Google');
    assert.equal(AUTH_GATE_LATER, 'Plus tard');
    assert.equal(AUTH_GATE_ERROR, 'Connexion impossible. Réessaie.');
    assert.equal(AUTH_GATE_RESUME_RETRY, 'Réessaie');
  });
});

describe('auth gate return URL', () => {
  it('keeps the daughter token and points e at the fiche', () => {
    assert.equal(
      authGateReturnHref({
        pathname: '/',
        search: '?t=abcd1234',
        itemKey: 'p:P1847',
        token: 'abcd1234',
      }),
      '/?t=abcd1234&e=p%3AP1847',
    );
  });

  it('drops the auth error flag and preserves other query params', () => {
    assert.equal(
      authGateReturnHref({
        pathname: '/',
        search: '?foo=1&cc_auth=err',
        hash: '#cine',
        itemKey: 'e:E496',
      }),
      '/?foo=1&e=e%3AE496#cine',
    );
  });
});

describe('pending action resume', () => {
  const now = 10_000;

  it('reads an armed action and refuses an expired one', () => {
    const raw = JSON.stringify(pending({ at: now }));
    const parsed = parsePendingAuthAction(raw, now);
    assert.equal(parsed?.kind, 'envie');
    assert.equal(parsed?.armed, true);
    assert.equal(parsePendingAuthAction(JSON.stringify(pending({ at: now - 16 * 60 * 1000 })), now), null);
  });

  it('matches mother and daughter separately', () => {
    const mother = pending({ token: null });
    const daughter = pending({ kind: 'going', token: 'abcd1234' });
    assert.equal(
      pendingMatches(mother, { kind: ['envie', 'going'], itemKey: 'p:P1847', token: null }),
      true,
    );
    assert.equal(
      pendingMatches(mother, { kind: ['envie', 'going'], itemKey: 'p:P1847', token: 'abcd1234' }),
      false,
    );
    assert.equal(
      pendingMatches(daughter, { kind: 'going', itemKey: 'p:P1847', token: 'abcd1234' }),
      true,
    );
    assert.equal(pendingMatches(daughter, { kind: 'share', itemKey: 'p:P1847' }), false);
  });

  it('resumes only when Google armed the action and auth succeeded', () => {
    assert.equal(
      shouldResumePending({ authed: true, pending: pending({ armed: true }), authError: false }),
      true,
    );
    assert.equal(
      shouldResumePending({ authed: true, pending: pending({ armed: false }), authError: false }),
      false,
    );
    assert.equal(
      shouldResumePending({ authed: false, pending: pending(), authError: false }),
      false,
    );
    assert.equal(
      shouldResumePending({ authed: true, pending: pending(), authError: true }),
      false,
    );
    assert.equal(shouldResumePending({ authed: true, pending: null, authError: false }), false);
  });
});

describe('auth gate wiring', () => {
  it('one sheet, Partager gated before the share call, no inline RSVP login', async () => {
    const gate = await readFile(new URL('../components/AuthActionGate.tsx', import.meta.url), 'utf8');
    const share = await readFile(new URL('../components/ShareButton.tsx', import.meta.url), 'utf8');
    const social = await readFile(new URL('../components/ShareSocial.tsx', import.meta.url), 'utf8');
    const providers = await readFile(new URL('../components/Providers.tsx', import.meta.url), 'utf8');
    const click = share.slice(
      share.indexOf('function onShareClick'),
      share.indexOf("if (status !== 'authenticated') return;"),
    );

    assert.match(gate, /data-testid="auth-action-gate"/);
    assert.match(gate, /role="dialog"/);
    assert.match(gate, /aria-modal="true"/);
    assert.match(gate, /AUTH_GATE_TITLE/);
    assert.match(gate, /authGateWhy/);
    assert.match(gate, /AUTH_GATE_GOOGLE/);
    assert.match(gate, /AUTH_GATE_LATER/);
    assert.match(gate, /AUTH_GATE_ERROR/);
    assert.match(gate, /min-h-11/);
    assert.match(gate, /bg-culture-cream/);
    assert.match(gate, /bg-culture-terracotta/);
    assert.match(gate, /rounded-t-2xl/);
    assert.match(gate, /signIn\('google'/);
    assert.equal(gate.includes('type="password"'), false);
    assert.equal(gate.includes('type="email"'), false);

    assert.match(click, /requestAuthGate/);
    assert.match(click, /kind: 'share'/);
    assert.equal(click.includes('flashCopied'), false);
    assert.equal(click.includes('navigator.share'), false);
    assert.equal(click.includes('prefetchShareMint'), false);
    assert.match(share, /claimArmedAuthAction/);
    assert.match(share, /if \(status !== 'authenticated'\) return;/);
    assert.match(share, /handleShare\(\)/);

    assert.equal(social.includes('mother-rsvp-login'), false);
    assert.equal(social.includes('RSVP_LOGIN_ERROR'), false);
    assert.equal(social.includes("signIn('google'"), false);
    assert.match(social, /requestAuthGate/);
    assert.match(social, /claimArmedAuthAction/);
    assert.match(providers, /<AuthActionGate/);
  });

  it('auth sheet wins over digeste, A2HS, feedback, and the login nudge', async () => {
    const files = [
      '../components/DigestTestIntro.tsx',
      '../components/PwaInstall.tsx',
      '../components/FeedbackChat.tsx',
      '../components/LoginNudge.tsx',
      '../components/SignalsProvider.tsx',
    ];
    for (const file of files) {
      const src = await readFile(new URL(file, import.meta.url), 'utf8');
      assert.match(src, /AUTH_GATE_OPEN_EVENT/, file);
    }
    const pwa = await readFile(new URL('../components/PwaInstall.tsx', import.meta.url), 'utf8');
    const digest = await readFile(new URL('../components/DigestTestIntro.tsx', import.meta.url), 'utf8');
    assert.match(pwa, /authGateHoldsAutoSheets/);
    assert.match(digest, /authGateHoldsAutoSheets/);
  });

  it('does not gate browse, filters, or Top 3', async () => {
    const files = [
      '../components/SeanceGrid.tsx',
      '../components/GenreFilter.tsx',
      '../components/Top3GuestCta.tsx',
      '../components/CultureConnectApp.tsx',
      '../components/HomeBootChrome.tsx',
    ];
    for (const file of files) {
      const src = await readFile(new URL(file, import.meta.url), 'utf8');
      assert.equal(src.includes('requestAuthGate'), false, file);
      assert.equal(src.includes('auth-action-gate'), false, file);
    }
  });
});
