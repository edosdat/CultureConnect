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
  countUnreadEvents,
  formatActivityDateShort,
  formatActivityRelative,
  hasSharerSand,
  itemIsUnread,
  parseActivityItemPayload,
  parseActivityListPayload,
  unreadBadgeLabel,
} from './shareActivity';
import {
  createShareToken,
  resetShareStoreForTests,
  sharerActivityInbox,
  sharerActivityItem,
  toggleShareRsvp,
  writeActivityLastSeen,
} from './shareStore';

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

  it('badge caps at 9+ and unread ignores lastSeen opens', () => {
    assert.equal(unreadBadgeLabel(0), null);
    assert.equal(unreadBadgeLabel(2), '2');
    assert.equal(unreadBadgeLabel(9), '9');
    assert.equal(unreadBadgeLabel(10), '9+');
    const items = [
      {
        itemKey: 'p:P1',
        token: 'abcd1234',
        seanceKey: null,
        createdAt: '2026-09-14T10:00:00.000Z',
        envie: 1,
        going: 1,
        events: [
          ev('Ludo', 'going', '2026-09-15T12:00:00.000Z'),
          ev('Camille', 'envie', '2026-09-14T09:00:00.000Z'),
        ],
      },
    ];
    assert.equal(countUnreadEvents(items, '2026-09-15T11:00:00.000Z'), 1);
    assert.equal(countUnreadEvents(items, null), 2);
    assert.equal(itemIsUnread(items[0]!, '2026-09-15T11:00:00.000Z'), true);
    assert.equal(itemIsUnread(items[0]!, '2026-09-15T13:00:00.000Z'), false);
  });

  it('canonical fiche href is /?e=&t=', () => {
    assert.equal(
      activityFicheHref('p:P1847', 'k7f2m9aa'),
      '/?e=p%3AP1847&t=k7f2m9aa',
    );
  });

  it('relative + short date', () => {
    const now = Date.parse('2026-09-15T12:00:00.000Z');
    assert.equal(formatActivityRelative('2026-09-15T11:48:00.000Z', now), 'il y a 12 min');
    assert.equal(formatActivityRelative('2026-09-15T10:00:00.000Z', now), 'il y a 2 h');
    assert.equal(formatActivityDateShort('2026-09-16'), '16/09');
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
    const list = parseActivityListPayload({ items: [] });
    assert.deepEqual(list.items, []);
    const item = parseActivityItemPayload({ itemKey: 'p:P1' });
    assert.deepEqual(item, { itemKey: 'p:P1' });
    assert.equal(hasSharerSand(item), false);
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
    const inbox = await sharerActivityInbox({ email: 'alice@example.com' });
    assert.equal(inbox.items.length, 1);
    assert.equal(inbox.items[0]?.events[0]?.firstName, 'Bob');
    assert.equal(inbox.items[0]?.events[0]?.kind, 'going');
    await writeActivityLastSeen('alice@example.com', '2026-09-20T00:00:00.000Z');
    const after = await sharerActivityInbox({ email: 'alice@example.com' });
    assert.equal(after.lastSeen, '2026-09-20T00:00:00.000Z');
  });

  it('does not invent RSVP rows when the sharer has no tokens', async () => {
    const empty = await sharerActivityInbox({ email: 'nobody@example.com' });
    assert.deepEqual(empty.items, []);
    const built = buildActivityListItems({ tokens: [], rsvpsByToken: new Map() });
    assert.deepEqual(built, []);
    const payload = buildActivityItemPayload('p:P1', []);
    assert.deepEqual(payload, { itemKey: 'p:P1' });
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
    assert.match(inbox, /\/api\/share\/activity\?limit=30/);
    assert.match(inbox, /\/api\/share\/activity\/seen/);
    assert.match(inbox, /activityFicheHref/);
    assert.match(inbox, /Tu n’as pas encore partagé/);
    assert.equal(/intéress/i.test(inbox), false);
    assert.equal(inbox.includes('ingestAccountItemSignal'), false);

    const sand = await readFile(
      new URL('../components/SharerActivitySand.tsx', import.meta.url),
      'utf8',
    );
    assert.match(sand, /Depuis ton lien/);
    assert.match(sand, /\/api\/share\/activity\/item\//);
    assert.equal(/intéress/i.test(sand), false);

    const auth = await readFile(
      new URL('../components/AuthButtons.tsx', import.meta.url),
      'utf8',
    );
    assert.match(auth, /<ActivityInbox \/>/);
    assert.equal(auth.split('<ActivityInbox').length - 1, 1);
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
      assert.match(src, /status: 401/);
      assert.equal(src.includes('ingestAccountItemSignal'), false);
      assert.equal(src.includes('commitGuestSignals'), false);
      assert.equal(/intéress/i.test(src), false);
    }
  });
});
