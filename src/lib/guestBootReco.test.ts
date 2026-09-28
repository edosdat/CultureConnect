/**
 * Guest boot Top 3: short-TTL cache + SSR budget.
 * N1 `demoteChainFor` stays on the live `queryAgenda` path.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isGuestBootRecoRequest,
  shouldSkipGuestBootRecoPost,
  withDeadline,
} from './guestBootReco';
import {
  computeGuestBootReco,
  deferredRecoByScope,
  mergeGuestBootReco,
  stopAgendaRecoTraceForTests,
  traceAgendaRecoForTests,
} from './agendaQuery';
import { slotFormOfItem } from './reco';
import type { DayItem } from './types';

/** Lundi 28/09/2026 10:00 Paris — same anchor as the N1 demote tests. */
const MONDAY = new Date('2026-09-28T08:00:00.000Z');

describe('guest boot reco predicates', () => {
  it('matches only guest populaire on boot scope Toulouse', () => {
    assert.equal(
      isGuestBootRecoRequest({
        recoUpcoming: true,
        hasProfile: false,
        scope: 'tous',
        commune: 'Toulouse',
        selectedDate: null,
      }),
      true,
    );
    assert.equal(
      isGuestBootRecoRequest({
        recoUpcoming: true,
        hasProfile: false,
        scope: 'tous',
        commune: '  toulouse ',
        selectedDate: '',
      }),
      true,
    );
    assert.equal(
      isGuestBootRecoRequest({
        recoUpcoming: true,
        hasProfile: true,
        scope: 'tous',
        commune: 'Toulouse',
      }),
      false,
    );
    assert.equal(
      isGuestBootRecoRequest({
        recoUpcoming: true,
        hasProfile: false,
        scope: 'soir',
        commune: 'Toulouse',
      }),
      false,
    );
    assert.equal(
      isGuestBootRecoRequest({
        recoUpcoming: true,
        hasProfile: false,
        scope: 'tous',
        commune: 'Blagnac',
      }),
      false,
    );
    assert.equal(
      isGuestBootRecoRequest({
        recoUpcoming: false,
        hasProfile: false,
        scope: 'tous',
        commune: 'Toulouse',
      }),
      false,
    );
    assert.equal(
      isGuestBootRecoRequest({
        recoUpcoming: true,
        hasProfile: false,
        scope: 'tous',
        commune: 'Toulouse',
        selectedDate: '2026-09-28',
      }),
      false,
    );
  });

  it('skips the boot POST only when guest cards are already cached and fresh', () => {
    assert.equal(
      shouldSkipGuestBootRecoPost({ kind: 'guest', cached: true, stale: false }),
      true,
    );
    assert.equal(
      shouldSkipGuestBootRecoPost({ kind: 'guest', cached: true, stale: true }),
      false,
    );
    assert.equal(
      shouldSkipGuestBootRecoPost({ kind: 'guest', cached: false, stale: false }),
      false,
    );
    assert.equal(
      shouldSkipGuestBootRecoPost({ kind: 'profile', cached: true, stale: false }),
      false,
    );
    assert.equal(
      shouldSkipGuestBootRecoPost({ kind: 'pending', cached: true, stale: false }),
      false,
    );
  });
});

describe('guest boot reco SSR budget', () => {
  it('returns a cache hit without waiting out the budget', async () => {
    const started = Date.now();
    const value = await withDeadline(Promise.resolve('cards'), 200, 'empty');
    assert.equal(value, 'cards');
    assert.ok(Date.now() - started < 150);
  });

  it('returns the fallback when compute exceeds the budget and leaves it running', async () => {
    let finished = false;
    const started = Date.now();
    const value = await withDeadline(
      new Promise<string>((resolve) => {
        setTimeout(() => {
          finished = true;
          resolve('late');
        }, 180);
      }),
      40,
      'empty',
    );
    assert.equal(value, 'empty');
    assert.equal(finished, false);
    assert.ok(Date.now() - started < 120);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(finished, true);
  });

  it('turns a rejected fill into the fallback', async () => {
    const value = await withDeadline(
      Promise.reject(new Error('cache down')),
      200,
      'empty',
    );
    assert.equal(value, 'empty');
  });
});

describe('guest boot reco merge', () => {
  it('fills only boot scope tous and leaves a cold payload untouched', () => {
    const cold = { recoByScope: deferredRecoByScope() };
    assert.equal(mergeGuestBootReco(cold, []), cold);
    const card = { key: 'p:guest' } as DayItem;
    const warm = mergeGuestBootReco(cold, [card]);
    assert.equal(warm.recoByScope.tous[0], card);
    assert.equal(warm.recoByScope.soir.length, 0);
    assert.equal(warm.recoByScope.aujourdhui.length, 0);
    assert.equal(cold.recoByScope.tous.length, 0);
  });
});

describe('guest boot reco compute (N1 kept)', { concurrency: false }, () => {
  it('uses the guest populaire path and still runs demoteChainFor', () => {
    const hits = traceAgendaRecoForTests();
    try {
      const result = computeGuestBootReco(MONDAY);
      assert.ok(result.items.length > 0, 'guest boot Top 3 is non-empty');
      assert.ok(result.items.length <= 3);
      const slots = new Set(
        result.items.map((item) => slotFormOfItem(item)).filter(Boolean),
      );
      assert.equal(slots.size, 3, `expected 1+1+1, got ${[...slots].join(',')}`);
      const roles = hits.map((hit) => `${hit.role}:${hit.scope}`);
      assert.ok(roles.includes('narrow:soir'), roles.join(' '));
      assert.ok(roles.includes('narrow:aujourdhui'), roles.join(' '));
      assert.ok(roles.includes('window:tous'), roles.join(' '));
      const windowHit = hits.find(
        (hit) => hit.role === 'window' && hit.scope === 'tous',
      );
      assert.ok(windowHit);
      assert.ok(
        windowHit.demoteWorkIds.size > 0,
        'window tous still receives demoteWorkIds from the narrower scopes',
      );
    } finally {
      stopAgendaRecoTraceForTests();
    }
  });
});

describe('guest boot reco wiring', () => {
  it('SSR payload, POST cache, and the client skip share the guest boot path', async () => {
    const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
    assert.match(page, /initialRecoByScope=\{boot\.recoByScope\}/);

    const query = await readFile(new URL('./agendaQuery.ts', import.meta.url), 'utf8');
    assert.match(query, /guest-boot-reco-v1/);
    assert.match(query, /attachGuestBootReco/);
    assert.match(query, /GUEST_BOOT_RECO_SSR_BUDGET_MS/);
    assert.match(query, /function demoteChainFor/);
    assert.match(query, /export async function queryAgendaReco/);
    assert.match(query, /home-first-paint-v3/);

    const route = await readFile(
      new URL('../app/api/agenda/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(route, /queryAgendaReco/);

    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    assert.match(app, /shouldSkipGuestBootRecoPost/);
    assert.match(app, /hydrateRecoCache\(initialRecoByScope/);
  });
});
