import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { NextResponse } from 'next/server';
import { ACCOUNT_TASTE_COOKIE } from './accountTasteStore';
import {
  ACCOUNT_TASTE_CACHE_COOKIE,
  COLD_RESET_CONFIRM,
  COLD_RESET_LABEL,
  COLD_RESET_NOTE,
  PLAN_C_STORAGE_PREFIXES,
  applyColdResetCookieDeletes,
  clearPlanCOwnedStorage,
  clientCookieNames,
  coldResetCookieDeletes,
  coldResetSecureFlag,
  deleteClientCookieHeader,
  expiredCookieOptions,
  isPlanCOwnedStorageKey,
  planCClientCookieNames,
} from './coldReset';
import { COHORT_COOKIE, VID_COOKIE } from './guestId';
import { MAIL_IDEAS_COOKIE } from './mailConsent';
import { GUEST_STORAGE_KEY } from './signals';
import { SIGNALS_CONSENT_COOKIE } from './signalsConsent';

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

describe('cold reset cookies stay separate', () => {
  it('lists cc_vid and cc_signals_v1 as two deletes', () => {
    const planned = coldResetCookieDeletes();
    const vidName = planned[0]?.name;
    const signalsName = planned[1]?.name;
    assert.equal(vidName === signalsName, false);
    assert.equal(vidName, VID_COOKIE);
    assert.equal(planned[0]?.httpOnly, true);
    assert.equal(signalsName, GUEST_STORAGE_KEY);
    assert.equal(planned[1]?.httpOnly, false);
    assert.equal(ACCOUNT_TASTE_CACHE_COOKIE, ACCOUNT_TASTE_COOKIE);
    assert.deepEqual(
      planned.map((cookie) => cookie.name),
      [
        'cc_vid',
        'cc_signals_v1',
        COHORT_COOKIE,
        SIGNALS_CONSENT_COOKIE,
        ACCOUNT_TASTE_COOKIE,
        MAIL_IDEAS_COOKIE,
      ],
    );
    assert.equal(new Set(planned.map((cookie) => cookie.name)).size, planned.length);
  });

  it('expires each cookie with its own set() and an empty value', () => {
    const calls: { name: string; value: string; httpOnly: boolean; secure: boolean }[] =
      [];
    const names = applyColdResetCookieDeletes(
      {
        set(name, value, options) {
          calls.push({
            name,
            value,
            httpOnly: options.httpOnly,
            secure: options.secure,
          });
        },
      },
      true,
    );
    assert.deepEqual(
      calls.map((call) => call.name),
      [...names],
    );
    assert.equal(calls[0]?.name, 'cc_vid');
    assert.equal(calls[0]?.httpOnly, true);
    assert.equal(calls[1]?.name, 'cc_signals_v1');
    assert.equal(calls[1]?.httpOnly, false);
    for (const call of calls) {
      assert.equal(call.value, '');
      assert.equal(call.value.includes('v_'), false);
      assert.equal(call.name.includes(','), false);
      assert.equal(call.secure, true);
    }
    const vidHeader = calls.filter((call) => call.name === 'cc_vid');
    const tasteHeader = calls.filter((call) => call.name === 'cc_signals_v1');
    assert.equal(vidHeader.length, 1);
    assert.equal(tasteHeader.length, 1);
  });

  it('emits two Set-Cookie headers on a response', () => {
    const res = NextResponse.json({ ok: true });
    applyColdResetCookieDeletes(res.cookies, true);
    const headers = res.headers.getSetCookie();
    const vid = headers.filter((header) => header.startsWith('cc_vid='));
    const tastes = headers.filter((header) => header.startsWith('cc_signals_v1='));
    assert.equal(vid.length, 1);
    assert.equal(tastes.length, 1);
    assert.match(vid[0] ?? '', /HttpOnly/i);
    assert.equal(/HttpOnly/i.test(tastes[0] ?? ''), false);
    assert.match(vid[0] ?? '', /Secure/i);
    assert.match(tastes[0] ?? '', /Secure/i);
    assert.match(vid[0] ?? '', /SameSite=Lax/i);
    assert.equal(
      headers.some((header) => header.includes('cc_vid') && header.includes('cc_signals_v1')),
      false,
    );
  });

  it('does not share one options object between the two identity cookies', () => {
    const vid = expiredCookieOptions(true, true);
    const tastes = expiredCookieOptions(false, true);
    assert.equal(vid === tastes, false);
    assert.equal(vid.httpOnly, true);
    assert.equal(tastes.httpOnly, false);
    assert.equal(vid.maxAge, 0);
    assert.equal(vid.path, '/');
    assert.equal(vid.sameSite, 'lax');
    assert.equal(vid.secure, true);
    assert.equal(coldResetSecureFlag({ NODE_ENV: 'production' }), true);
    assert.equal(coldResetSecureFlag({ VERCEL: '1', NODE_ENV: 'development' }), true);
    assert.equal(coldResetSecureFlag({ NODE_ENV: 'test' }), false);
  });

  it('builds two distinct document.cookie deletes', () => {
    const vid = deleteClientCookieHeader(VID_COOKIE, true);
    const tastes = deleteClientCookieHeader(GUEST_STORAGE_KEY, true);
    assert.equal(vid, 'cc_vid=; Max-Age=0; Path=/; SameSite=Lax; Secure');
    assert.equal(
      tastes,
      'cc_signals_v1=; Max-Age=0; Path=/; SameSite=Lax; Secure',
    );
    assert.equal(vid.includes('cc_signals_v1'), false);
    assert.equal(tastes.includes('cc_vid'), false);
    assert.equal(deleteClientCookieHeader(COHORT_COOKIE, false).includes('Secure'), false);
  });
});

describe('cold reset storage prefixes', () => {
  it('keeps the declared prefixes', () => {
    assert.deepEqual([...PLAN_C_STORAGE_PREFIXES], [
      'cc_',
      'cc.',
      'planc_',
      'culture-connect',
    ]);
  });

  it('clears Plan C keys and leaves foreign keys', () => {
    const bag = new Map<string, string>([
      ['cc_account_profile_v1', '{"email":"a@b.c"}'],
      ['cc_signals_v1', '{"events":[]}'],
      ['cc_vid_posed', '1'],
      ['cc_taste_cookie_notice', '1'],
      ['cc_login_nudge_dismissed', '1'],
      ['cc_auth_hint', '1'],
      ['cc_share_visit:abcd1234', '1'],
      ['cc_share_visit:abcd1234:seance', 'p:1'],
      ['cc_share_activity_last_seen', '2026-01-01'],
      ['cc_share_created_tokens', '[]'],
      ['cc_digest_test_intro', '1'],
      ['cc_social_tip_b1_seen', '1'],
      ['cc_digest_intro_synced', 'a@b.c'],
      ['cc_mes_recos_week_v1', '{}'],
      ['cc.favorites.v1', '[]'],
      ['cc.profileReco.v1', '{}'],
      ['planc_a2hs_day', '2026-10-01'],
      ['planc_a2hs_session', '1'],
      ['culture-connect-flag', '1'],
      ['theme', 'nuit'],
      ['authjs.session-token', 'keep'],
    ]);
    const keys = [...bag.keys()];
    const store = {
      get length() {
        return keys.length;
      },
      key(index: number) {
        return keys[index] ?? null;
      },
      removeItem(key: string) {
        bag.delete(key);
        const at = keys.indexOf(key);
        if (at >= 0) keys.splice(at, 1);
      },
    };
    const removed = clearPlanCOwnedStorage(store);
    assert.equal(bag.has('theme'), true);
    assert.equal(bag.has('authjs.session-token'), true);
    assert.equal(bag.has('cc_vid_posed'), false);
    assert.equal(bag.has('cc_account_profile_v1'), false);
    assert.equal(bag.has('cc.profileReco.v1'), false);
    assert.equal(bag.has('planc_a2hs_day'), false);
    assert.equal(removed.includes('cc_account_profile_v1'), true);
    assert.equal(isPlanCOwnedStorageKey('not_cc_vid'), false);
    assert.equal(isPlanCOwnedStorageKey('cc_vid_posed'), true);
  });

  it('names Plan C cookies from a header without reading values into a profile', () => {
    const header =
      'cc_signals_v1=%7B%7D; cc_cohort=beta; theme=nuit; cc_signals_consent=accepted';
    assert.deepEqual(planCClientCookieNames(header), [
      'cc_signals_v1',
      'cc_cohort',
      'cc_signals_consent',
    ]);
    assert.equal(clientCookieNames(header).includes('theme'), true);
    const dumped = JSON.stringify(planCClientCookieNames(header));
    assert.equal(dumped.includes('%7B'), false);
    assert.equal(dumped.includes('accepted'), false);
  });
});

describe('cold reset copy and gates', () => {
  it('uses the French label and says KV stays', () => {
    assert.equal(COLD_RESET_LABEL, 'Reset froid / comme 1ʳᵉ visite');
    assert.match(COLD_RESET_NOTE, /cc_vid/);
    assert.match(COLD_RESET_NOTE, /cc_signals_v1/);
    assert.match(COLD_RESET_NOTE, /cc:vs:\*/);
    assert.match(COLD_RESET_CONFIRM, /Continuer \?/);
    assert.equal(COLD_RESET_NOTE.includes('vid'), true);
  });

  it('keeps the route free of Neon, KV purge, and vid mint', () => {
    const route = read('../app/api/admin/cold-reset/route.ts');
    const lib = read('./coldReset.ts');
    const client = read('./coldResetClient.ts');
    const ui = read('../components/AdminColdReset.tsx');
    const layout = read('../app/admin/layout.tsx');
    const doc = read('../../docs/reset-froid.md');

    for (const src of [route, lib, client, ui]) {
      assert.equal(src.includes('writeAccountTaste'), false);
      assert.equal(src.includes('generateVid'), false);
      assert.equal(src.includes('compactForCookie'), false);
      assert.equal(src.includes('@vercel/postgres'), false);
      assert.equal(src.includes('kvAppend'), false);
      assert.equal(src.includes('deleteGoogleAccount'), false);
      assert.equal(src.includes('accountTasteStore'), false);
    }
    assert.match(route, /isAdminSession/);
    assert.match(route, /status: 404/);
    assert.match(route, /applyColdResetCookieDeletes/);
    assert.equal(route.includes('cookies().get'), false);
    assert.equal(route.includes('generateVid'), false);
    assert.match(lib, /jar\.set\(VID_COOKIE, '', expiredCookieOptions\(true, secure\)\)/);
    assert.match(
      lib,
      /jar\.set\(GUEST_STORAGE_KEY, '', expiredCookieOptions\(false, secure\)\)/,
    );
    assert.match(client, /writeDelete\(VID_COOKIE\)/);
    assert.match(client, /writeDelete\(GUEST_STORAGE_KEY\)/);
    assert.match(client, /clearGuestStore/);
    assert.equal(client.includes('writeGuestStore'), false);
    const confirmAt = ui.indexOf('window.confirm(COLD_RESET_CONFIRM)');
    const fetchAt = ui.indexOf("fetch('/api/admin/cold-reset'");
    const clearAt = ui.indexOf('clearPlanCClientCold();');
    const signOutAt = ui.indexOf('signOut({ callbackUrl:');
    assert.ok(confirmAt >= 0 && confirmAt < fetchAt);
    assert.ok(fetchAt < clearAt);
    assert.ok(clearAt < signOutAt);
    assert.match(ui, /showHomeEventsCounter/);
    assert.match(ui, /COLD_RESET_LABEL/);
    assert.match(layout, /isAdminSession/);
    assert.match(layout, /notFound\(\)/);
    assert.ok(layout.indexOf('notFound()') < layout.indexOf('<AdminColdReset'));
    assert.match(doc, /cc:vs:\*/);
    assert.match(doc, /commitGuestSignals/);
    assert.match(doc, /account_tastes/);
  });
});
