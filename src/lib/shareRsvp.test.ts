import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyRsvpToggle,
  assertRsvpRgpd,
  buildTokenSocial,
  circleNamesCopy,
  countKinds,
  DAUGHTER_NOTICE,
  firstNameFromDisplayName,
  motherCountersLabel,
  motherStatsFromRsvps,
  parseRsvpRecord,
  RSVP_LOGIN_ERROR,
  rsvpsForEventStats,
  viewerInCircle,
  type ShareRsvpRecord,
} from './shareRsvp';
import {
  createShareToken,
  emailHash,
  listTokenRsvps,
  memoryAllRsvps,
  memoryRsvpCount,
  memoryVisitCount,
  recordShareVisit,
  resetShareStoreForTests,
  tokenSocialPayload,
  toggleShareRsvp,
  eventRsvpStats,
} from './shareStore';
import { assertNoVidAccountJoin } from './guestSignals';

function rsvp(p: Partial<ShareRsvpRecord> & Pick<ShareRsvpRecord, 'emailHash' | 'kind' | 'firstName'>): ShareRsvpRecord {
  return {
    token: p.token || 'abcd1234',
    itemKey: p.itemKey || 'p:P1847',
    workId: p.workId || 'f:F1',
    emailHash: p.emailHash,
    firstName: p.firstName,
    kind: p.kind,
    ts: p.ts || '2026-09-14T12:00:00.000Z',
  };
}

describe('B3b RSVP helpers', () => {
  it('wording is Envie / J’y vais — never intéressés', () => {
    assert.equal(motherCountersLabel(2, 3), '2 envies · 3 y vont');
    assert.equal(motherCountersLabel(1, 1), '1 envie · 1 y va');
    assert.equal(motherCountersLabel(1, 0), '1 envie');
    assert.equal(motherCountersLabel(0, 1), '1 y va');
    assert.equal(motherCountersLabel(0, 0), '');
    assert.equal(circleNamesCopy(['Marie'], ['Léa']), 'Marie y va · Léa a envie');
    assert.equal(
      circleNamesCopy(['Marie', 'Paul'], ['Léa', 'Tom']),
      'Marie, Paul y vont · Léa, Tom ont envie',
    );
    assert.equal(DAUGHTER_NOTICE, 'Visibles par ceux qui ont ce lien.');
    assert.match(RSVP_LOGIN_ERROR, /Envie ou J’y vais/);
  });

  it('firstName comes from display name, never email', () => {
    assert.equal(firstNameFromDisplayName('Eloi DOSDAT'), 'Eloi');
    assert.equal(firstNameFromDisplayName('  Léa  '), 'Léa');
    assert.equal(firstNameFromDisplayName('a@b.c'), 'Quelqu’un');
    assert.equal(firstNameFromDisplayName(''), 'Quelqu’un');
  });

  it('toggle is exclusive envie|going — no 3rd state', () => {
    assert.equal(applyRsvpToggle(null, 'envie'), 'envie');
    assert.equal(applyRsvpToggle('envie', 'envie'), null);
    assert.equal(applyRsvpToggle('envie', 'going'), 'going');
    assert.equal(applyRsvpToggle('going', 'envie'), 'envie');
    assert.equal(applyRsvpToggle('going', 'going'), null);
  });

  it('RSVP record rejects vid and raw email', () => {
    const ok = rsvp({ emailHash: 'h1', kind: 'envie', firstName: 'Léa' });
    assert.doesNotThrow(() => assertRsvpRgpd(ok));
    assert.equal(parseRsvpRecord({ ...ok, vid: 'v_8f3e2a1b' }), null);
    assert.throws(
      () => assertRsvpRgpd({ ...ok, vid: 'v_8f3e2a1b' }),
      /RGPD/,
    );
    assert.throws(
      () => assertRsvpRgpd({ ...ok, email: 'a@b.c' }),
      /RGPD/,
    );
    assert.throws(
      () => assertNoVidAccountJoin({ vid: 'v_8f3e2a1b', firstName: 'Léa' }),
      /RGPD/,
    );
  });
});

describe('B3b cercle Option A — this token only', () => {
  beforeEach(() => {
    resetShareStoreForTests();
  });

  it('visit / open_shared is not circle and has no firstName', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'sharer@example.com',
      origin: 'https://app.example',
    });
    assert.ok(created);
    const visit = {
      ts: new Date().toISOString(),
      token: created.token,
      emailHash: emailHash('visitor@example.com'),
    };
    await recordShareVisit({ token: created.token, visit });
    assert.equal(memoryVisitCount(created.token), 1);
    assert.equal(memoryRsvpCount(created.token), 0);
    assert.equal(viewerInCircle(await listTokenRsvps(created.token), visit.emailHash), false);
    const social = await tokenSocialPayload({
      token: created.token,
      viewerEmailHash: visit.emailHash,
    });
    assert.equal(social?.inCircle, false);
    assert.equal('goingNames' in (social || {}), false);
    assert.equal('envieNames' in (social || {}), false);
    assert.equal('firstName' in visit, false);
    assert.equal('vid' in visit, false);
  });

  it('guest visit vid never joins firstName; guest is not in circle', async () => {
    const created = await createShareToken({
      itemKey: 'e:E496',
      sharerEmail: null,
      origin: 'https://app.example',
    });
    assert.ok(created);
    const guestVisit = {
      ts: new Date().toISOString(),
      token: created.token,
      vid: 'v_8f3e2a1b',
    };
    assert.doesNotThrow(() => assertNoVidAccountJoin(guestVisit));
    await recordShareVisit({ token: created.token, visit: guestVisit });
    assert.equal(memoryRsvpCount(created.token), 0);
    const social = await tokenSocialPayload({
      token: created.token,
      viewerEmailHash: null,
    });
    assert.equal(social?.inCircle, false);
    assert.equal(social?.envie, 0);
    assert.equal(social?.going, 0);
  });

  it('only Envie / J’y vais on THIS token join the circle and reveal names', async () => {
    const a = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: null,
      origin: 'https://app.example',
    });
    const b = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: null,
      origin: 'https://app.example',
    });
    assert.ok(a && b);
    await toggleShareRsvp({
      token: a.token,
      itemKey: 'p:P1847',
      workId: 'f:F1',
      emailHash: emailHash('marie@example.com'),
      firstName: 'Marie',
      kind: 'going',
    });
    await toggleShareRsvp({
      token: a.token,
      itemKey: 'p:P1847',
      workId: 'f:F1',
      emailHash: emailHash('lea@example.com'),
      firstName: 'Léa',
      kind: 'envie',
    });
    await toggleShareRsvp({
      token: b.token,
      itemKey: 'p:P1847',
      workId: 'f:F1',
      emailHash: emailHash('tom@example.com'),
      firstName: 'Tom',
      kind: 'going',
    });

    const outsider = await tokenSocialPayload({
      token: a.token,
      viewerEmailHash: emailHash('tom@example.com'),
    });
    assert.equal(outsider?.inCircle, false);
    assert.equal(outsider && 'goingNames' in outsider, false);
    assert.equal(outsider?.going, 1);
    assert.equal(outsider?.envie, 1);

    const member = await tokenSocialPayload({
      token: a.token,
      viewerEmailHash: emailHash('marie@example.com'),
    });
    assert.equal(member?.inCircle, true);
    if (!member?.inCircle) throw new Error('expected circle');
    assert.deepEqual(member.goingNames, ['Marie']);
    assert.deepEqual(member.envieNames, ['Léa']);
    assert.equal(member.mine, 'going');
    assert.equal(member.goingNames.includes('Tom'), false);

    const copy = circleNamesCopy(member.goingNames, member.envieNames);
    assert.match(copy, /Marie y va/);
    assert.match(copy, /Léa a envie/);
    assert.equal(/intéress/i.test(copy), false);
  });

  it('toggle is idempotent and switching replaces the only state', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: null,
      origin: 'https://app.example',
    });
    assert.ok(created);
    const email = emailHash('a@b.c');
    const first = await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'f:F1',
      emailHash: email,
      firstName: 'Ada',
      kind: 'envie',
    });
    assert.equal(first.kind, 'envie');
    assert.equal(first.rsvps.length, 1);
    const again = await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'f:F1',
      emailHash: email,
      firstName: 'Ada',
      kind: 'envie',
    });
    assert.equal(again.kind, null);
    assert.equal(again.rsvps.length, 0);
    const going = await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'f:F1',
      emailHash: email,
      firstName: 'Ada',
      kind: 'going',
    });
    assert.equal(going.kind, 'going');
    const switched = await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'f:F1',
      emailHash: email,
      firstName: 'Ada',
      kind: 'envie',
    });
    assert.equal(switched.kind, 'envie');
    assert.equal(switched.rsvps.length, 1);
    assert.equal(switched.rsvps[0]?.kind, 'envie');
  });
});

describe('B3b mother counts + no vid↔name', () => {
  beforeEach(() => {
    resetShareStoreForTests();
  });

  it('mother counts unique accounts from 1, going wins across tokens', async () => {
    const a = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: null,
      origin: 'https://app.example',
    });
    const b = await createShareToken({
      itemKey: 'p:P1999',
      sharerEmail: null,
      origin: 'https://app.example',
    });
    assert.ok(a && b);
    await toggleShareRsvp({
      token: a.token,
      itemKey: 'p:P1847',
      workId: 'f:F1',
      emailHash: emailHash('marie@example.com'),
      firstName: 'Marie',
      kind: 'envie',
    });
    await toggleShareRsvp({
      token: b.token,
      itemKey: 'p:P1999',
      workId: 'f:F1',
      emailHash: emailHash('marie@example.com'),
      firstName: 'Marie',
      kind: 'going',
    });
    await toggleShareRsvp({
      token: a.token,
      itemKey: 'p:P1847',
      workId: 'f:F1',
      emailHash: emailHash('lea@example.com'),
      firstName: 'Léa',
      kind: 'envie',
    });
    const stats = await eventRsvpStats({ itemKey: 'p:P1847', workId: 'f:F1' });
    assert.equal(stats.envie, 1);
    assert.equal(stats.going, 1);
    assert.equal(motherCountersLabel(stats.envie, stats.going), '1 envie · 1 y va');
    const names = memoryAllRsvps().some((r) => 'vid' in r && r.vid);
    assert.equal(names, false);
    for (const rec of memoryAllRsvps()) {
      assert.equal('vid' in rec, false);
      assert.equal('email' in rec, false);
      assert.doesNotThrow(() => assertRsvpRgpd(rec));
    }
  });

  it('mother helper ignores visits and other work ids', () => {
    const rows = [
      rsvp({ emailHash: 'h1', kind: 'envie', firstName: 'A', workId: 'f:F1' }),
      rsvp({ emailHash: 'h2', kind: 'going', firstName: 'B', workId: 'f:F1' }),
      rsvp({
        emailHash: 'h3',
        kind: 'going',
        firstName: 'C',
        workId: 'f:OTHER',
        itemKey: 'e:E1',
      }),
    ];
    const filtered = rsvpsForEventStats(rows, { itemKey: 'p:P1847', workId: 'f:F1' });
    assert.equal(filtered.length, 2);
    assert.deepEqual(motherStatsFromRsvps(filtered), { envie: 1, going: 1 });
    assert.deepEqual(countKinds(filtered), { envie: 1, going: 1 });
    const outsider = buildTokenSocial({ rsvps: filtered, viewerEmailHash: 'nope' });
    assert.equal(outsider.inCircle, false);
    assert.equal('goingNames' in outsider, false);
  });

  it('lists all firstNames with y vont before envie — no 3+K cap', () => {
    const going = ['Zoé', 'Anne', 'Marie', 'Paul'];
    const envie = ['Tom', 'Léa', 'Sam', 'Nina'];
    const copy = circleNamesCopy(going, envie);
    assert.match(copy, /^Zoé, Anne, Marie, Paul y vont/);
    assert.match(copy, /Tom, Léa, Sam, Nina ont envie$/);
    assert.equal(copy.includes('+'), false);
    assert.equal(/intéress/i.test(copy), false);
  });
});

describe('B3b source contract', () => {
  it('API + UI lock wording and isolate RSVP from Matching A', async () => {
    const route = await readFile(
      new URL('../app/api/share/route.ts', import.meta.url),
      'utf8',
    );
    const rsvpHandler = route.slice(route.lastIndexOf('isRsvpKind(incoming.kind)'));
    assert.match(route, /isRsvpKind\(incoming\.kind\)/);
    assert.match(route, /RSVP_LOGIN_ERROR/);
    assert.match(route, /status: 401/);
    assert.equal(rsvpHandler.includes('ingestAccountItemSignal'), false);
    assert.equal(rsvpHandler.includes('commitGuestSignals'), false);

    const social = await readFile(
      new URL('../app/api/share/[token]/social/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(social, /tokenSocialPayload/);
    assert.equal(social.includes('ingestAccountItemSignal'), false);

    const stats = await readFile(
      new URL('../app/api/share/event/[itemKey]/stats/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(stats, /eventRsvpStats/);
    assert.match(stats, /envie/);
    assert.match(stats, /going/);
    assert.equal(stats.includes('firstName'), false);

    const ui = await readFile(
      new URL('../components/ShareSocial.tsx', import.meta.url),
      'utf8',
    );
    assert.match(ui, />Envie</);
    assert.match(ui, /J’y vais/);
    assert.match(ui, /DAUGHTER_NOTICE/);
    assert.equal(/intéress/i.test(ui), false);

    const conf = await readFile(
      new URL('../app/confidentialite/page.tsx', import.meta.url),
      'utf8',
    );
    assert.match(conf, /Partage/);
    assert.match(conf, /Envie ou/);
    assert.match(conf, /cc_vid/);
  });
});
