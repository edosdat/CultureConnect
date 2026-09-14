import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deepLinkUrl } from './displayHome';
import { normalizeDeepLinkId } from './deepLink';
import { nextPickedSeanceKey, resolveSharedSeanceKey } from './cineSeances';
import { SIGNAL_WEIGHTS, isKnownSignalKind, makeSignal } from './signals';
import {
  generateShareToken,
  isShareToken,
  normalizeSeanceKey,
  normalizeShareToken,
  sessionSharerEmail,
  SHARE_CREATE_RATE_PER_HOUR,
  SHARE_TOKEN_RE,
  SHARE_VISIT_STORAGE_PREFIX,
  SHARE_VISITS_CAP,
  shareVisitStorageKey,
  shouldClientTrackShare,
} from './shareToken';
import {
  createShareToken,
  emailHash,
  isShareCreateRateLimited,
  logShareOrphan,
  memoryVisitCount,
  memoryVisitorCount,
  readShareToken,
  recordShareVisit,
  resetShareStoreForTests,
  shareOrphanLogsForTests,
} from './shareStore';
import { assertNoVidAccountJoin } from './guestSignals';

describe('B3 share token format', () => {
  it('generates opaque 8-char [a-z0-9] crypto tokens', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    assert.match(a, SHARE_TOKEN_RE);
    assert.equal(a.length, 8);
    assert.equal(isShareToken(a), true);
    assert.equal(isShareToken('ABC12xyz'), false);
    assert.equal(isShareToken('short'), false);
    assert.equal(normalizeShareToken('  abcdef12  '), 'abcdef12');
    assert.equal(normalizeShareToken('nope'), null);
    assert.notEqual(a, b);
  });

  it('seanceKey uses the same DayItem.key space as B1 e=', () => {
    assert.equal(normalizeSeanceKey('p:P1847'), 'p:P1847');
    assert.equal(normalizeSeanceKey('P1847'), 'p:P1847');
    assert.equal(normalizeSeanceKey('not a key'), null);
    assert.equal(resolveSharedSeanceKey([{ key: 'p:A' }, { key: 'p:B' }], 'p:B'), 'p:B');
    assert.equal(resolveSharedSeanceKey([{ key: 'p:A' }], 'p:MISSING'), null);
    assert.equal(resolveSharedSeanceKey([{ key: 'p:A' }], null), null);
    assert.equal(
      nextPickedSeanceKey([{ key: 'p:P1030' }, { key: 'p:P1345' }], 'p:P1345', null),
      'p:P1345',
    );
    assert.equal(
      nextPickedSeanceKey([{ key: 'p:P1030' }, { key: 'p:P1345' }], 'p:P1030', 'p:P1345'),
      'p:P1345',
    );
  });
});

describe('B3 create — unique token per share act', () => {
  beforeEach(() => {
    resetShareStoreForTests();
  });

  it('two creates of the same event yield two tokens', async () => {
    const first = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'a@b.c',
      origin: 'https://app.example',
    });
    const second = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: 'a@b.c',
      origin: 'https://app.example',
    });
    assert.ok(first && second);
    assert.notEqual(first.token, second.token);
    assert.equal(first.url, `https://app.example/?e=${encodeURIComponent('p:P1847')}&t=${first.token}`);
    assert.equal(second.url.includes(second.token), true);
    assert.equal('seanceKey' in first, false);
  });

  it('stores seanceKey when the picker has a current séance', async () => {
    const withSeance = await createShareToken({
      itemKey: 'p:P1847',
      seanceKey: 'p:P1999',
      sharerEmail: null,
      origin: 'https://app.example',
    });
    assert.ok(withSeance);
    assert.equal(withSeance.seanceKey, 'p:P1999');
    const stored = await readShareToken(withSeance.token);
    assert.equal(stored?.itemKey, 'p:P1847');
    assert.equal(stored?.seanceKey, 'p:P1999');
    assert.equal(stored?.sharerEmail, null);
    assert.equal(stored?.opens, 0);

    const itemOnly = await createShareToken({
      itemKey: 'p:P1847',
      sharerEmail: null,
      origin: 'https://app.example',
    });
    assert.ok(itemOnly);
    assert.equal(itemOnly.seanceKey, undefined);
    const storedItem = await readShareToken(itemOnly.token);
    assert.equal(storedItem?.seanceKey, undefined);
  });

  it('guest create keeps sharerEmail null; authed stores lowercase email never UUID', async () => {
    const guest = await createShareToken({
      itemKey: 'e:E496',
      sharerEmail: sessionSharerEmail(null),
      origin: 'https://app.example',
    });
    assert.ok(guest);
    assert.equal((await readShareToken(guest.token))?.sharerEmail, null);
    assert.equal(
      sessionSharerEmail({ email: 'Eloi@Example.COM', id: '00000000-0000-4000-8000-000000000001' }),
      'eloi@example.com',
    );
    assert.equal(
      sessionSharerEmail({ email: '00000000-0000-4000-8000-000000000001' }),
      null,
    );
  });
});

describe('B3 visit + RGPD', () => {
  beforeEach(() => {
    resetShareStoreForTests();
  });

  it('unknown token is an orphan (page must not break)', async () => {
    const orig = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      logShareOrphan('deadbeef');
      assert.equal((await readShareToken('deadbeef')) == null, true);
      assert.match(shareOrphanLogsForTests().join('\n'), /share_orphan/);
      assert.match(lines.join('\n'), /"kind":"share_orphan"/);
    } finally {
      console.log = orig;
    }
  });

  it('guest visit stores vid only; authed visit stores emailHash only', async () => {
    const created = await createShareToken({
      itemKey: 'p:P1847',
      seanceKey: 'p:P2001',
      sharerEmail: 'sharer@example.com',
      origin: 'https://app.example',
    });
    assert.ok(created);
    const guestVisit = {
      ts: new Date().toISOString(),
      token: created.token,
      vid: 'v_8f3e2a1b',
    };
    assert.doesNotThrow(() => assertNoVidAccountJoin(guestVisit));
    const afterGuest = await recordShareVisit({
      token: created.token,
      visit: guestVisit,
    });
    assert.equal(afterGuest?.opens, 1);
    assert.equal(memoryVisitCount(created.token), 1);
    assert.equal(memoryVisitorCount(created.token), 1);

    const authedVisit = {
      ts: new Date().toISOString(),
      token: created.token,
      emailHash: emailHash('visitor@example.com'),
    };
    assert.equal('vid' in authedVisit, false);
    const afterAuthed = await recordShareVisit({
      token: created.token,
      visit: authedVisit,
    });
    assert.equal(afterAuthed?.opens, 2);
    assert.equal(afterAuthed?.seanceKey, 'p:P2001');
    assert.throws(
      () =>
        assertNoVidAccountJoin({
          vid: 'v_8f3e2a1b',
          emailHash: emailHash('a@b.c'),
        }),
      /RGPD/,
    );
  });

  it('rate-limits ~30 create / email|IP / h', async () => {
    for (let i = 0; i < SHARE_CREATE_RATE_PER_HOUR; i += 1) {
      const hit = await isShareCreateRateLimited({
        ip: '203.0.113.9',
        email: 'rate@example.com',
      });
      assert.equal(hit, false, `create ${i}`);
    }
    assert.equal(
      await isShareCreateRateLimited({ ip: '203.0.113.9', email: 'rate@example.com' }),
      true,
    );
  });
});

describe('B3 URL + open_shared + no B3b', () => {
  it('deepLinkUrl appends t= without changing e= fiche id', () => {
    const withTok = deepLinkUrl('https://cc.test', 'p:P1847', 'abcd1234');
    const without = deepLinkUrl('https://cc.test', 'p:P1847');
    assert.equal(without, 'https://cc.test/?e=p%3AP1847');
    assert.equal(withTok, 'https://cc.test/?e=p%3AP1847&t=abcd1234');
    assert.equal(normalizeDeepLinkId('p:P1847'), 'p:P1847');
    assert.equal(normalizeDeepLinkId('abcd1234'), null);
  });

  it('open_shared is a known Matching A kind at weight 4', () => {
    assert.equal(isKnownSignalKind('open_shared'), true);
    assert.equal(SIGNAL_WEIGHTS.open_shared, 4);
    assert.ok(SIGNAL_WEIGHTS.open_shared > SIGNAL_WEIGHTS.share);
    const s = makeSignal({
      kind: 'open_shared',
      event_id: 'ev-1',
      genres: [],
      moods: [],
    });
    assert.equal(s.kind, 'open_shared');
    assert.equal(s.weight, 4);
  });

  it('ShareButton does not double-count Matching A share when create succeeded', () => {
    assert.equal(shouldClientTrackShare({ created: true, authed: true }), false);
    assert.equal(shouldClientTrackShare({ created: true, authed: false }), true);
    assert.equal(shouldClientTrackShare({ created: false, authed: true }), true);
    assert.equal(shareVisitStorageKey('abcd1234'), `${SHARE_VISIT_STORAGE_PREFIX}abcd1234`);
    assert.equal(SHARE_VISITS_CAP, 500);
  });

  it('B3 files have 0 B3b RSVP / prénom / opinion UI', async () => {
    const files = [
      new URL('./shareToken.ts', import.meta.url),
      new URL('./shareStore.ts', import.meta.url),
      new URL('./shareIngest.ts', import.meta.url),
      new URL('../app/api/share/route.ts', import.meta.url),
      new URL('../components/ShareButton.tsx', import.meta.url),
      new URL('../components/ShareVisitProvider.tsx', import.meta.url),
    ];
    const banned =
      /rsvp|envie|going|prénom|prenom|opinion|feedback|cercle|mother.?counter/i;
    for (const file of files) {
      const src = await readFile(file, 'utf8');
      assert.equal(banned.test(src), false, file.pathname);
    }
  });
});
