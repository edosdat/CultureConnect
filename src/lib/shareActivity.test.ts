import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it, beforeEach } from 'node:test';
import {
  ACTIVITY_EMPTY,
  ACTIVITY_NOTICE,
  activityCopyHasInteresses,
  activityDeltaCopy,
  activityFicheHref,
  activitySandLines,
  buildActivityItemPayload,
  buildActivityListItems,
  filterActivityTokensByEventDate,
  formatActivityDateShort,
  formatActivityRelative,
  hasSharerSand,
  inboxDeltaCopy,
  inboxUnreadCount,
  itemIsUnread,
  lastSeenForToken,
  parseActivityItemPayload,
  parseActivityListPayload,
  parseActivitySeenPayload,
  slimActivityListForWire,
  unreadBadgeLabel,
  type ActivityListItem,
} from './shareActivity';
import {
  fetchActivityInbox,
  fetchActivityItem,
  fetchGuestTeaserCount,
  markActivitySeen,
} from './shareActivityClient';
import {
  createShareToken,
  emailHash,
  forgetActivitySeenMemoryForTests,
  guestActivityTeaserCount,
  listTokenRsvps,
  markSharerActivitySeen,
  recordShareVisit,
  resetShareStoreForTests,
  setShareKvPipelineForTests,
  sharerActivityInbox,
  sharerActivityItem,
  toggleShareRsvp,
  writeActivityLastSeen,
} from './shareStore';

const upcomingDate = {
  eventDateIsoForItemKey: () => '2099-12-31',
};

function memoryKv() {
  const store = new Map<string, string>();
  return {
    store,
    async pipeline(cmds: string[][]) {
      return cmds.map((cmd) => {
        const [op, key, val] = cmd;
        if (op === 'SET' && key && val !== undefined) {
          store.set(key, val);
          return { result: 'OK' };
        }
        if (op === 'GET' && key) {
          return { result: store.has(key) ? store.get(key)! : null };
        }
        return { result: null };
      });
    },
  };
}

function ev(
  firstName: string,
  kind: 'going' | 'envie',
  ts = '2026-09-15T10:00:00.000Z',
  token = 'abcd1234',
) {
  return { firstName, kind, ts, token };
}

describe('B3b activity copy', () => {
  it('named going / envie / plurals / mix going before envie', () => {
    assert.equal(activityDeltaCopy([ev('Ludo', 'going')]), 'Ludo y va');
    assert.equal(activityDeltaCopy([ev('Camille', 'envie')]), 'Camille a envie');
    assert.equal(
      activityDeltaCopy([ev('Ludo', 'going'), ev('Benjamin', 'going')]),
      'Ludo et Benjamin y vont',
    );
    assert.equal(
      activityDeltaCopy([ev('Ludo', 'going'), ev('Camille', 'envie')]),
      'Ludo y va · Camille a envie',
    );
    assert.equal(
      activityDeltaCopy([ev('Ludo', 'going'), ev('Quelqu’un', 'envie')]),
      'Ludo y va · +1 envie',
    );
    assert.equal(activityDeltaCopy([ev('Quelqu’un', 'going')]), '+1 y va');
    assert.equal(
      activityDeltaCopy([ev('Quelqu’un', 'going'), ev('A', 'going', 't2', 'tok2')]),
      'A y va · +1 y va',
    );
    assert.equal(
      activityDeltaCopy([
        ev('Quelqu’un', 'going', '2026-09-15T10:00:00.000Z', 'tokaaaa'),
        ev('Quelqu’un', 'going', '2026-09-15T11:00:00.000Z', 'tokbbbb'),
      ]),
      'Une personne de plus y va',
    );
    assert.equal(activityCopyHasInteresses(activityDeltaCopy([ev('Ludo', 'going')])), false);
    assert.equal(activityCopyHasInteresses(ACTIVITY_NOTICE), false);
    assert.equal(activityCopyHasInteresses(ACTIVITY_EMPTY), false);
  });

  it('sand lines + omit when 0 RSVP', () => {
    assert.equal(hasSharerSand({ itemKey: 'p:P1' }), false);
    assert.equal(hasSharerSand({ itemKey: 'p:P1', goingNames: [], envieNames: [] }), false);
    const lines = activitySandLines({
      itemKey: 'p:P1',
      goingNames: ['Ludo', 'Benjamin'],
      envieNames: ['Camille'],
    });
    assert.equal(lines.going, 'Ludo et Benjamin y vont');
    assert.equal(lines.envie, 'Camille a envie');
    assert.equal(ACTIVITY_NOTICE, 'Depuis ton lien.');
  });

  it('badge uses unreadCount of items; latest + deltas for copy', () => {
    assert.equal(unreadBadgeLabel(0), null);
    assert.equal(unreadBadgeLabel(2), '2');
    assert.equal(unreadBadgeLabel(9), '9');
    assert.equal(unreadBadgeLabel(10), '9+');
    const unreadItem: ActivityListItem = {
      itemKey: 'p:P1',
      token: 'abcd1234',
      seanceKey: null,
      createdAt: '2026-09-14T10:00:00.000Z',
      envie: 1,
      going: 1,
      unread: true,
      deltaGoing: 1,
      deltaEnvie: 1,
      latest: { firstName: 'Ludo', kind: 'going', ts: '2026-09-15T12:00:00.000Z' },
      events: [
        ev('Ludo', 'going', '2026-09-15T12:00:00.000Z'),
        ev('Camille', 'envie', '2026-09-14T09:00:00.000Z'),
      ],
    };
    const readItem = { ...unreadItem, unread: false, token: 'zzzzzzzz' };
    assert.equal(inboxUnreadCount([unreadItem, readItem]), 1);
    assert.equal(itemIsUnread(unreadItem), true);
    assert.equal(itemIsUnread(readItem), false);
    assert.equal(inboxDeltaCopy(unreadItem), 'Ludo y va · +1 envie');
    const parsed = parseActivityListPayload({
      lastSeenAt: null,
      unreadCount: 2,
      items: [unreadItem],
    });
    assert.equal(parsed.unreadCount, 2);
    assert.equal(parsed.lastSeenAt, null);
    assert.equal(parsed.items[0]?.deltaGoing, 1);
    assert.deepEqual(parseActivitySeenPayload({ ok: true, unreadCount: 0 }), {
      ok: true,
      unreadCount: 0,
    });
    assert.equal(
      lastSeenForToken(
        {
          global: '2026-09-15T12:00:00.000Z',
          tokens: { abcd1234: '2026-09-10T12:00:00.000Z' },
        },
        'abcd1234',
      ),
      '2026-09-15T12:00:00.000Z',
    );
    assert.equal(
      lastSeenForToken(
        {
          global: '2026-09-10T12:00:00.000Z',
          tokens: { abcd1234: '2026-09-15T12:00:00.000Z' },
        },
        'abcd1234',
      ),
      '2026-09-15T12:00:00.000Z',
    );
    assert.deepEqual(
      filterActivityTokensByEventDate(
        [{ itemKey: 'p:PAST' }, { itemKey: 'p:TODAY' }, { itemKey: 'p:MISS' }],
        (key) =>
          key === 'p:PAST' ? '2026-09-14' : key === 'p:TODAY' ? '2026-09-15' : '',
        '2026-09-15',
      ).map((t) => t.itemKey),
      ['p:TODAY'],
    );
  });

  it('canonical fiche href is /?e=&t=', () => {
    assert.equal(
      activityFicheHref('p:P1847', 'k7f2m9aa'),
      '/?e=p%3AP1847&t=k7f2m9aa',
    );
  });

  it('wire list drops events[] but keeps unreadCount / deltas / latest', () => {
    const unreadItem: ActivityListItem = {
      itemKey: 'p:P1',
      token: 'abcd1234',
      seanceKey: null,
      createdAt: '2026-09-14T10:00:00.000Z',
      envie: 1,
      going: 1,
      unread: true,
      deltaGoing: 1,
      deltaEnvie: 0,
      latest: { firstName: 'Ludo', kind: 'going', ts: '2026-09-15T12:00:00.000Z' },
      events: [ev('Ludo', 'going', '2026-09-15T12:00:00.000Z')],
    };
    const slim = slimActivityListForWire({
      lastSeenAt: null,
      unreadCount: 1,
      items: [unreadItem],
    });
    assert.equal(slim.unreadCount, 1);
    assert.equal(slim.items[0]?.deltaGoing, 1);
    assert.equal(slim.items[0]?.latest?.firstName, 'Ludo');
    assert.deepEqual(slim.items[0]?.events, []);
    const parsed = parseActivityListPayload(slim);
    assert.equal(parsed.unreadCount, 1);
    assert.equal(inboxDeltaCopy(parsed.items[0]!), 'Ludo y va');
  });

  it('relative + short date', () => {
    const now = Date.parse('2026-09-15T12:00:00.000Z');
    assert.equal(formatActivityRelative('2026-09-15T11:48:00.000Z', now), 'il y a 12 min');
    assert.equal(formatActivityRelative('2026-09-15T10:00:00.000Z', now), 'il y a 2 h');
    assert.equal(formatActivityDateShort('2026-09-16'), '16/09');
  });

  it('client fetchers treat 404 as empty — no invented RSVPs', async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(null, { status: 404 })) as typeof fetch;
    try {
      const inbox = await fetchActivityInbox();
      assert.deepEqual(inbox.items, []);
      assert.equal(inbox.lastSeenAt, null);
      assert.equal(inbox.unreadCount, 0);
      assert.equal(await fetchActivityItem('p:P1847'), null);
      assert.equal(await fetchGuestTeaserCount(['abcd1234']), 0);
      const seen = await markActivitySeen({ scope: 'all' });
      assert.equal(seen.unreadCount, 0);
    } finally {
      globalThis.fetch = prev;
    }
  });

  it('parser drops email / vid and keeps empty lists honest', () => {
    assert.equal(
      parseActivityItemPayload({
        itemKey: 'p:P1',
        goingNames: ['Ludo'],
        email: 'a@b.c',
      }),
      null,
    );
    const list = parseActivityListPayload({ lastSeenAt: null, unreadCount: 0, items: [] });
    assert.deepEqual(list.items, []);
    assert.equal(list.unreadCount, 0);
    const item = parseActivityItemPayload({ goingNames: [], envieNames: [] });
    assert.deepEqual(item, {});
    assert.equal(hasSharerSand(item), false);
    const named = parseActivityItemPayload({ goingNames: ['Ludo'] });
    assert.deepEqual(named?.goingNames, ['Ludo']);
  });
});

describe('B3b activity store', () => {
  beforeEach(() => {
    resetShareStoreForTests();
  });

  it('lists Alice tokens + Bob going; Carol sees empty names', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      origin: 'https://cc.test',
    });
    assert.ok(created);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: 'bob-hash',
      firstName: 'Bob',
      kind: 'going',
    });
    const alice = await sharerActivityItem({
      email: 'alice@example.com',
      itemKey: 'p:P1847',
      matchesToken: (t) => t.itemKey === 'p:P1847',
    });
    assert.deepEqual(alice.goingNames, ['Bob']);
    const carol = await sharerActivityItem({
      email: 'carol@example.com',
      itemKey: 'p:P1847',
      matchesToken: (t) => t.itemKey === 'p:P1847',
    });
    assert.equal('goingNames' in carol, false);
    const inbox = await sharerActivityInbox({
      email: 'alice@example.com',
      ...upcomingDate,
    });
    assert.equal(inbox.items.length, 1);
    assert.equal(inbox.unreadCount, 1);
    assert.equal(inbox.items[0]?.unread, true);
    assert.equal(inbox.items[0]?.deltaGoing, 1);
    assert.equal(inbox.items[0]?.latest?.firstName, 'Bob');
    assert.equal(inbox.items[0]?.events[0]?.kind, 'going');
    await writeActivityLastSeen('alice@example.com', '2026-09-20T00:00:00.000Z');
    const after = await sharerActivityInbox({
      email: 'alice@example.com',
      ...upcomingDate,
    });
    assert.equal(after.lastSeenAt, '2026-09-20T00:00:00.000Z');
    assert.equal(after.unreadCount, 0);
    assert.equal(after.items[0]?.unread, false);
  });

  it('GET after POST seen persists lastSeenAt and drops unread across isolates', async () => {
    const kv = memoryKv();
    setShareKvPipelineForTests((cmds) => kv.pipeline(cmds));
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      origin: 'https://cc.test',
    });
    assert.ok(created);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: 'bob-hash',
      firstName: 'Bob',
      kind: 'going',
    });
    const before = await sharerActivityInbox({
      email: 'alice@example.com',
      ...upcomingDate,
    });
    assert.equal(before.lastSeenAt, null);
    assert.equal(before.unreadCount, 1);
    const seen = await markSharerActivitySeen({
      email: 'alice@example.com',
      scope: 'all',
      ...upcomingDate,
    });
    assert.equal(seen.ok, true);
    assert.equal(seen.unreadCount, 0);
    forgetActivitySeenMemoryForTests();
    const after = await sharerActivityInbox({
      email: 'alice@example.com',
      ...upcomingDate,
    });
    assert.ok(after.lastSeenAt);
    assert.equal(after.unreadCount, 0);
    assert.equal(after.items[0]?.unread, false);
  });

  it('scope all lastSeen wins over an older per-token stamp', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      origin: 'https://cc.test',
    });
    assert.ok(created);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: 'bob-hash',
      firstName: 'Bob',
      kind: 'going',
    });
    await markSharerActivitySeen({
      email: 'alice@example.com',
      scope: 'token',
      token: created.token,
      now: new Date('2026-09-10T12:00:00.000Z'),
      ...upcomingDate,
    });
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: 'cam-hash',
      firstName: 'Camille',
      kind: 'envie',
    });
    const mid = await sharerActivityInbox({
      email: 'alice@example.com',
      ...upcomingDate,
    });
    assert.equal(mid.unreadCount, 1);
    await markSharerActivitySeen({
      email: 'alice@example.com',
      scope: 'all',
      now: new Date('2099-12-31T00:00:00.000Z'),
      ...upcomingDate,
    });
    const after = await sharerActivityInbox({
      email: 'alice@example.com',
      ...upcomingDate,
    });
    assert.equal(after.unreadCount, 0);
    assert.equal(after.lastSeenAt, '2099-12-31T00:00:00.000Z');
  });

  it('drops past and dateless tokens from inbox and unreadCount', async () => {
    const past = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      origin: 'https://cc.test',
    });
    const today = await createShareToken({
      itemKey: 'p:P2099',
      sharerEmail: 'alice@example.com',
      origin: 'https://cc.test',
    });
    const missing = await createShareToken({
      itemKey: 'p:P0000',
      sharerEmail: 'alice@example.com',
      origin: 'https://cc.test',
    });
    assert.ok(past && today && missing);
    await toggleShareRsvp({
      token: past.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: 'bob-hash',
      firstName: 'Bob',
      kind: 'going',
    });
    await toggleShareRsvp({
      token: today.token,
      itemKey: 'p:P2099',
      workId: 'p:P2099',
      emailHash: 'cam-hash',
      firstName: 'Camille',
      kind: 'envie',
    });
    await toggleShareRsvp({
      token: missing.token,
      itemKey: 'p:P0000',
      workId: 'p:P0000',
      emailHash: 'dan-hash',
      firstName: 'Dan',
      kind: 'going',
    });
    const dates: Record<string, string> = {
      'p:P1847': '2026-09-10',
      'p:P2099': '2026-09-15',
      'p:P0000': '',
    };
    const inbox = await sharerActivityInbox({
      email: 'alice@example.com',
      now: new Date('2026-09-15T12:00:00.000Z'),
      eventDateIsoForItemKey: (key) => dates[key] ?? '',
    });
    assert.equal(inbox.items.length, 1);
    assert.equal(inbox.items[0]?.itemKey, 'p:P2099');
    assert.equal(inbox.unreadCount, 1);
  });

  it('AE5 Alice create only → inbox unreadCount 0 (self excluded)', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      firstName: 'Alice Martin',
      origin: 'https://cc.test',
    });
    assert.ok(created);
    const seeded = await listTokenRsvps(created.token);
    assert.equal(seeded.length, 1);
    assert.equal(seeded[0]?.kind, 'envie');
    assert.equal(seeded[0]?.emailHash, emailHash('alice@example.com'));

    const afterShare = await sharerActivityInbox({
      email: 'alice@example.com',
      ...upcomingDate,
    });
    assert.equal(afterShare.items.length, 1);
    assert.equal(afterShare.items[0]?.token, created.token);
    assert.equal(afterShare.items[0]?.envie, 1);
    assert.equal(afterShare.unreadCount, 0);
    assert.equal(afterShare.items[0]?.unread, false);
    assert.equal(afterShare.items[0]?.deltaEnvie, 0);
    assert.equal(afterShare.items[0]?.deltaGoing, 0);
    assert.equal(afterShare.items[0]?.latest, null);
  });

  it('AE6 Alice create then Bob envie → unread + delta + Bob', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      firstName: 'Alice Martin',
      origin: 'https://cc.test',
    });
    assert.ok(created);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: emailHash('bob@example.com'),
      firstName: 'Bob',
      kind: 'envie',
    });
    const afterBob = await sharerActivityInbox({
      email: 'alice@example.com',
      ...upcomingDate,
    });
    assert.ok(afterBob.unreadCount >= 1);
    assert.equal(afterBob.items[0]?.unread, true);
    assert.equal(afterBob.items[0]?.deltaEnvie, 1);
    assert.equal(afterBob.items[0]?.latest?.firstName, 'Bob');
    assert.equal(afterBob.items[0]?.envie, 2);
  });

  it('recipient Envie sees Alice auto-Envie in cloche; self excluded', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      firstName: 'Alice Martin',
      origin: 'https://cc.test',
    });
    assert.ok(created);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: emailHash('eloi@example.com'),
      firstName: 'Eloi',
      kind: 'envie',
    });

    const eloi = await sharerActivityInbox({
      email: 'eloi@example.com',
      ...upcomingDate,
    });
    assert.equal(eloi.items.length, 1);
    assert.equal(eloi.items[0]?.token, created.token);
    assert.equal(eloi.items[0]?.itemKey, 'p:P1847');
    assert.ok((eloi.items[0]?.envie ?? 0) >= 2);
    assert.equal(eloi.items[0]?.going, 0);
    assert.equal(eloi.unreadCount, 1);
    assert.equal(eloi.items[0]?.unread, true);
    assert.equal(eloi.items[0]?.deltaEnvie, 1);
    assert.equal(eloi.items[0]?.deltaGoing, 0);
    assert.equal(eloi.items[0]?.latest?.firstName, 'Alice');
    assert.equal(eloi.items[0]?.latest?.kind, 'envie');
    assert.equal(
      eloi.items[0]?.events.some((e) => e.firstName === 'Eloi'),
      false,
    );

    const alice = await sharerActivityInbox({
      email: 'alice@example.com',
      ...upcomingDate,
    });
    assert.equal(alice.unreadCount, 1);
    assert.equal(alice.items[0]?.latest?.firstName, 'Eloi');
    assert.equal(alice.items[0]?.latest?.kind, 'envie');
    assert.equal(
      alice.items[0]?.events.some((e) => e.firstName === 'Alice'),
      false,
    );
  });

  it('recipient J’y vais stays going; sees others’ going + envie, not self', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      firstName: 'Alice Martin',
      origin: 'https://cc.test',
    });
    assert.ok(created);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: emailHash('eloi@example.com'),
      firstName: 'Eloi',
      kind: 'going',
    });
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: emailHash('bob@example.com'),
      firstName: 'Bob',
      kind: 'envie',
    });
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: emailHash('camille@example.com'),
      firstName: 'Camille',
      kind: 'going',
    });

    const eloi = await sharerActivityInbox({
      email: 'eloi@example.com',
      ...upcomingDate,
    });
    assert.equal(eloi.items.length, 1);
    assert.equal(eloi.items[0]?.going, 2);
    assert.equal(eloi.items[0]?.envie, 2);
    assert.equal(
      eloi.items[0]?.events.some((e) => e.firstName === 'Eloi'),
      false,
    );
    assert.equal(
      eloi.items[0]?.events.find((e) => e.firstName === 'Camille')?.kind,
      'going',
    );
    assert.equal(
      eloi.items[0]?.events.find((e) => e.firstName === 'Bob')?.kind,
      'envie',
    );
    assert.equal(
      eloi.items[0]?.events.find((e) => e.firstName === 'Alice')?.kind,
      'envie',
    );
    assert.ok((eloi.items[0]?.deltaGoing ?? 0) >= 1);
    assert.ok((eloi.items[0]?.deltaEnvie ?? 0) >= 1);
    assert.equal(eloi.items[0]?.going, eloi.items[0]?.envie);
  });

  it('visit-only recipient is not in inbox; RSVP-off drops the row', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      firstName: 'Alice Martin',
      origin: 'https://cc.test',
    });
    assert.ok(created);
    await recordShareVisit({
      token: created.token,
      visit: {
        ts: '2026-09-15T09:00:00.000Z',
        token: created.token,
        emailHash: emailHash('eloi@example.com'),
      },
    });
    const visitOnly = await sharerActivityInbox({
      email: 'eloi@example.com',
      ...upcomingDate,
    });
    assert.equal(visitOnly.items.length, 0);
    assert.equal(visitOnly.unreadCount, 0);

    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: emailHash('eloi@example.com'),
      firstName: 'Eloi',
      kind: 'envie',
    });
    const afterRsvp = await sharerActivityInbox({
      email: 'eloi@example.com',
      ...upcomingDate,
    });
    assert.equal(afterRsvp.items.length, 1);

    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: emailHash('eloi@example.com'),
      firstName: 'Eloi',
      kind: 'envie',
    });
    const afterOff = await sharerActivityInbox({
      email: 'eloi@example.com',
      ...upcomingDate,
    });
    assert.equal(afterOff.items.length, 0);
    assert.equal(afterOff.unreadCount, 0);
  });

  it('recipient own upcoming RSVP on guest share appears; unread 0 if alone', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: null,
      origin: 'https://cc.test',
    });
    assert.ok(created);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: emailHash('eloi@example.com'),
      firstName: 'Eloi',
      kind: 'going',
    });
    const eloi = await sharerActivityInbox({
      email: 'eloi@example.com',
      ...upcomingDate,
    });
    assert.equal(eloi.items.length, 1);
    assert.equal(eloi.items[0]?.going, 1);
    assert.equal(eloi.items[0]?.envie, 0);
    assert.equal(eloi.unreadCount, 0);
    assert.equal(eloi.items[0]?.unread, false);
    assert.equal(eloi.items[0]?.latest, null);
    assert.equal(eloi.items[0]?.deltaGoing, 0);
    assert.equal(eloi.items[0]?.deltaEnvie, 0);
  });

  it('recipient past / dateless tokens drop from inbox like sharer', async () => {
    const past = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'alice@example.com',
      origin: 'https://cc.test',
    });
    const today = await createShareToken({
      itemKey: 'p:P2099',
      sharerEmail: 'alice@example.com',
      origin: 'https://cc.test',
    });
    assert.ok(past && today);
    await toggleShareRsvp({
      token: past.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: emailHash('eloi@example.com'),
      firstName: 'Eloi',
      kind: 'envie',
    });
    await toggleShareRsvp({
      token: today.token,
      itemKey: 'p:P2099',
      workId: 'p:P2099',
      emailHash: emailHash('eloi@example.com'),
      firstName: 'Eloi',
      kind: 'going',
    });
    const inbox = await sharerActivityInbox({
      email: 'eloi@example.com',
      now: new Date('2026-09-15T12:00:00.000Z'),
      eventDateIsoForItemKey: (key) =>
        key === 'p:P1847' ? '2026-09-10' : key === 'p:P2099' ? '2026-09-15' : '',
    });
    assert.equal(inbox.items.length, 1);
    assert.equal(inbox.items[0]?.itemKey, 'p:P2099');
  });

  it('does not invent RSVP rows when the sharer has no tokens', async () => {
    const empty = await sharerActivityInbox({
      email: 'nobody@example.com',
      ...upcomingDate,
    });
    assert.deepEqual(empty.items, []);
    assert.equal(empty.unreadCount, 0);
    const built = buildActivityListItems({ tokens: [], rsvpsByToken: new Map() });
    assert.deepEqual(built, []);
    const payload = buildActivityItemPayload('p:P1', []);
    assert.deepEqual(payload, { itemKey: 'p:P1' });
  });

  it('guest teaser count is unique emailHash, 0 names, ignores opens', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: null,
      origin: 'https://cc.test',
    });
    assert.ok(created);
    assert.equal(await guestActivityTeaserCount([created.token]), 0);
    await recordShareVisit({
      token: created.token,
      visit: { ts: '2026-09-15T09:00:00.000Z', token: created.token, vid: 'vid-open' },
    });
    assert.equal(await guestActivityTeaserCount([created.token]), 0);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: 'bob-hash',
      firstName: 'Bob',
      kind: 'going',
    });
    assert.equal(await guestActivityTeaserCount([created.token]), 1);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: 'cam-hash',
      firstName: 'Camille',
      kind: 'envie',
    });
    assert.equal(await guestActivityTeaserCount([created.token]), 2);
    await toggleShareRsvp({
      token: created.token,
      itemKey: 'p:P1847',
      workId: 'p:P1847',
      emailHash: 'bob-hash',
      firstName: 'Bob',
      kind: 'envie',
    });
    assert.equal(await guestActivityTeaserCount([created.token]), 2);
    assert.equal(
      await guestActivityTeaserCount(
        [created.token],
        '2099-01-01T00:00:00.000Z',
      ),
      0,
    );
  });
});

describe('B3b activity source contract', () => {
  it('wires cloche + sheet + sand + 3 endpoints, 0 Matching A, 0 card activity', async () => {
    const inbox = await readFile(
      new URL('../components/ActivityInbox.tsx', import.meta.url),
      'utf8',
    );
    assert.match(inbox, /share-activity-bell/);
    assert.match(inbox, /Mes partages/);
    assert.match(inbox, /fetchActivityInbox/);
    assert.match(inbox, /markActivitySeen/);
    assert.match(inbox, /fetchActivityInbox/);
    assert.match(inbox, /setUnreadCount\(parsed\.unreadCount\)/);
    assert.match(inbox, /scope: 'all'/);
    assert.match(inbox, /scope: 'token'/);
    assert.match(inbox, /activityFicheHref/);
    assert.match(inbox, /ACTIVITY_EMPTY/);
    assert.match(inbox, /\{ACTIVITY_EMPTY\}/);
    assert.equal(/intéress/i.test(inbox), false);
    assert.equal(inbox.includes('ingestAccountItemSignal'), false);

    const sand = await readFile(
      new URL('../components/SharerActivitySand.tsx', import.meta.url),
      'utf8',
    );
    assert.match(sand, /Depuis ton lien/);
    assert.match(sand, /fetchActivityItem/);
    assert.equal(/intéress/i.test(sand), false);

    const client = await readFile(
      new URL('./shareActivityClient.ts', import.meta.url),
      'utf8',
    );
    assert.match(client, /\/api\/share\/activity/);
    assert.match(client, /\/api\/share\/activity\/item/);
    assert.match(client, /\/api\/share\/activity\/teaser/);
    assert.match(client, /fetchGuestTeaserCount/);
    assert.match(client, /status === 404/);
    assert.match(client, /emptyActivityInbox/);
    assert.match(client, /lastSeenAt/);
    assert.match(client, /unreadCount/);
    assert.match(client, /scope/);
    assert.match(client, /keepalive: true/);
    assert.equal(client.includes('ingestAccountItemSignal'), false);

    const teaserRoute = await readFile(
      new URL('../app/api/share/activity/teaser/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(teaserRoute, /guestActivityTeaserCount/);
    assert.match(teaserRoute, /\{ count \}/);
    assert.match(teaserRoute, /TOKEN_CAP = 20/);
    assert.equal(teaserRoute.includes('firstName'), false);
    assert.equal(teaserRoute.includes('envieNames'), false);
    assert.equal(teaserRoute.includes('goingNames'), false);

    const auth = await readFile(
      new URL('../components/AuthButtons.tsx', import.meta.url),
      'utf8',
    );
    assert.match(auth, /<ActivityInbox \/>/);
    assert.equal(auth.split('<ActivityInbox').length - 1, 1);
    assert.match(auth, /<GuestTeaserBell \/>/);
    const guestUi = auth.slice(auth.indexOf('data-account-control="login"'));
    assert.equal(guestUi.includes('ActivityInbox'), false);

    const detail = await readFile(
      new URL('../components/EventDetail.tsx', import.meta.url),
      'utf8',
    );
    assert.match(detail, /SharerActivitySand/);
    assert.match(detail, /!shareToken \? \(/);

    const carousel = await readFile(
      new URL('../components/CinemaCarousel.tsx', import.meta.url),
      'utf8',
    );
    assert.equal(carousel.includes('SharerActivitySand'), false);
    assert.equal(carousel.includes('activityDeltaCopy'), false);

    const seance = await readFile(
      new URL('../components/SeanceCard.tsx', import.meta.url),
      'utf8',
    );
    assert.equal(seance.includes('SharerActivitySand'), false);
    assert.equal(seance.includes('activityDeltaCopy'), false);

    for (const file of [
      new URL('../app/api/share/activity/route.ts', import.meta.url),
      new URL('../app/api/share/activity/item/[itemKey]/route.ts', import.meta.url),
      new URL('../app/api/share/activity/seen/route.ts', import.meta.url),
    ]) {
      const src = await readFile(file, 'utf8');
      assert.match(src, /sessionSharerEmail/);
      assert.match(src, /401/);
      assert.equal(src.includes('ingestAccountItemSignal'), false);
      assert.equal(src.includes('commitGuestSignals'), false);
      assert.equal(/intéress/i.test(src), false);
    }

    const seenLib = await readFile(
      new URL('./shareActivity.ts', import.meta.url),
      'utf8',
    );
    assert.equal(seenLib.includes('state.tokens[token] || state.global'), false);
    assert.match(seenLib, /tokenMs >= globalMs/);
    assert.match(seenLib, /ignoreEmailHash/);

    const store = await readFile(new URL('./shareStore.ts', import.meta.url), 'utf8');
    assert.match(store, /share_activity_seen/);
    assert.match(store, /kvSetString/);
    assert.match(store, /isNotBeforeToday/);
    assert.match(store, /activityEventDateIso/);
    assert.match(store, /tokens: \{\}/);
    assert.match(store, /listTokenRsvpsMany/);
    assert.match(store, /warmShareActivityTables/);
    assert.match(store, /queryAgendaItemDateIso|activityEventDateIso/);
    assert.match(store, /opts\.scope === 'all'/);
  });
});

describe('TIP cloche → fiche — navigate first, seen async', () => {
  it('soft-navs without awaiting seen or cold-reloading home', async () => {
    const inbox = await readFile(
      new URL('../components/ActivityInbox.tsx', import.meta.url),
      'utf8',
    );
    assert.equal(inbox.includes('window.location.assign'), false);
    assert.equal(inbox.includes('await markActivitySeen({ scope: \'token\''), false);
    assert.match(inbox, /void markActivitySeen\(\{ scope: 'token'/);
    assert.match(inbox, /router\.push\(href\)/);
    assert.match(inbox, /history\.pushState/);
    assert.match(inbox, /requestOpenFiche/);
    assert.match(inbox, /setOpen\(false\)/);
    assert.match(inbox, /active:bg-culture-sand/);

    const events = await readFile(
      new URL('../components/openFicheEvents.ts', import.meta.url),
      'utf8',
    );
    assert.match(events, /cc-open-fiche/);
    assert.match(events, /export function requestOpenFiche/);
    assert.match(events, /title\?: string/);
    assert.match(events, /image\?: string/);

    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    assert.match(app, /OPEN_FICHE_EVENT/);
    assert.match(app, /showCatalogueShell=\{false\}/);
    assert.match(app, /DeepLinkFicheFallback/);

    const visit = await readFile(
      new URL('../components/ShareVisitProvider.tsx', import.meta.url),
      'utf8',
    );
    assert.match(visit, /OPEN_FICHE_EVENT/);
    assert.match(visit, /setToken/);
  });
});

describe('P1 cloche inbox cold path + meta paint', () => {
  it('activity dates skip queryAgendaDetail; store batches RSVPs', async () => {
    const dates = await readFile(
      new URL('./shareActivityDates.ts', import.meta.url),
      'utf8',
    );
    assert.match(dates, /queryAgendaItemDateIso/);
    assert.equal(dates.includes('queryAgendaDetail'), false);

    const query = await readFile(
      new URL('./agendaQuery.ts', import.meta.url),
      'utf8',
    );
    assert.match(query, /export function queryAgendaItemDateIso/);
    const dateFn = query.slice(query.indexOf('export function queryAgendaItemDateIso'));
    assert.match(dateFn, /findItemByKey/);
    assert.equal(dateFn.slice(0, 400).includes('relatedSeancesFromProgramme'), false);

    const store = await readFile(new URL('./shareStore.ts', import.meta.url), 'utf8');
    assert.match(store, /listTokenRsvpsMany/);
    assert.match(store, /token = ANY/);
    assert.match(store, /warmShareActivityTables/);
    assert.match(store, /activityInboxCache/);
    const inboxFn = store.slice(store.indexOf('export async function sharerActivityInbox'));
    assert.match(inboxFn, /listShareTokensForActivityInbox/);
    assert.match(inboxFn, /listTokenRsvpsMany/);
    assert.match(inboxFn, /dateByKey/);
    assert.match(inboxFn, /ignoreEmailHash/);
    assert.equal(inboxFn.includes('queryAgendaDetail'), false);
    assert.match(store, /listShareTokensByRsvpEmail/);
    assert.match(store, /share:rsvp:user:/);
    assert.match(store, /share_rsvps_email_idx/);

    const route = await readFile(
      new URL('../app/api/share/activity/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(route, /slimActivityListForWire/);
    assert.match(route, /sessionSharerEmail/);
  });

  it('sheet paints hydrated meta; fiche seed + prefetch do not block open', async () => {
    const inbox = await readFile(
      new URL('../components/ActivityInbox.tsx', import.meta.url),
      'utf8',
    );
    assert.match(inbox, /prefetchAgendaItem/);
    assert.match(inbox, /onPointerEnter/);
    assert.match(inbox, /onPointerDown/);
    assert.match(inbox, /title: info\?\.title/);
    assert.match(inbox, /image: info\?\.image/);
    assert.equal(inbox.includes('await markActivitySeen({ scope: \'all\''), false);
    assert.match(inbox, /void markActivitySeen\(\{ scope: 'all'/);
    assert.equal(inbox.includes('window.location.assign'), false);

    const fallback = await readFile(
      new URL('../components/DeepLinkFicheFallback.tsx', import.meta.url),
      'utf8',
    );
    assert.match(fallback, /seed\?: OpenFicheSeed/);
    assert.match(fallback, /seed\?\.title/);
    assert.match(fallback, /seed\?\.image/);

    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    assert.match(app, /peekPrefetchedAgendaItem/);
    assert.match(app, /setFicheSeed/);
    assert.match(app, /seed=\{ficheSeed\}/);

    const prefetch = await readFile(
      new URL('./agendaItemPrefetch.ts', import.meta.url),
      'utf8',
    );
    assert.match(prefetch, /\/api\/agenda\?id=/);
    assert.match(prefetch, /export function peekPrefetchedAgendaItem/);
  });
});

describe('P0 Fermer fiche clears deep-link URL', () => {
  it('onClose strips e/t/id via replaceState; cloche open still pushState', async () => {
    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    assert.match(app, /clearDeepLinkUrlParams/);
    const closeFn = app.slice(app.indexOf('onClose={() => {'));
    assert.match(closeFn, /setSelectedItemKey\(null\)/);
    assert.match(closeFn, /clearDeepLinkUrlParams\(\)/);
    assert.match(app, /tokenInUrl \? normalizeDeepLinkId\(shareVisitItemKey/);

    const helper = await readFile(
      new URL('./deepLink.ts', import.meta.url),
      'utf8',
    );
    assert.match(helper, /history\.replaceState/);
    assert.match(helper, /DEEP_LINK_QUERY_KEYS = \['e', 't', 'id'\]/);

    const inbox = await readFile(
      new URL('../components/ActivityInbox.tsx', import.meta.url),
      'utf8',
    );
    assert.match(inbox, /history\.pushState/);
    assert.match(inbox, /router\.push\(href\)/);
    assert.equal(inbox.includes('clearDeepLinkUrlParams'), false);
    assert.equal(inbox.includes('window.location.assign'), false);
  });
});
