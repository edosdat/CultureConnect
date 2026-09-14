import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  COHORT_COOKIE,
  GUEST_RATE_LIMIT_PER_HOUR,
  GUEST_SIGNAL_FIFO_CAP,
  IP_RATE_LIMIT_PER_HOUR,
  SIGNAL_PAYLOAD_MAX_BYTES,
  VID_COOKIE,
  assertNoVidAccountJoin,
  buildGuestAppendLine,
  fifoAppend,
  formatAppendLogLine,
  generateVid,
  isAllowedSignalOrigin,
  isValidVid,
  itemIdsOutOfBounds,
  itemKeyFromSignal,
  payloadExceedsLimit,
  readCookieValue,
  resolveCohort,
  resolveVidFromCookie,
  sanitizeCohort,
  vidCookieOptions,
} from './guestSignals';
import {
  GUEST_STORAGE_KEY,
  emptyProfile,
  makeSignal,
  parseGuestStore,
} from './signals';
import {
  commitGuestSignals,
  resetGuestRateLimitForTests,
} from './guestSignalStore';

function signal(kind: 'open_card' | 'favorite' = 'open_card') {
  return makeSignal({
    kind,
    event_id: 'ev-guest-1',
    programme_id: 'pr-guest-1',
    moods: ['rigolo'],
    genres: ['standup'],
  });
}

describe('cc_vid format', () => {
  it('generates v_ + 8–12 alphanumeric and rejects PII / store JSON', () => {
    const id = generateVid();
    assert.match(id, /^v_[a-z0-9]{8,12}$/);
    assert.equal(isValidVid(id), true);
    assert.equal(isValidVid('v_8f3e2a1b'), true);
    assert.equal(isValidVid('v_short'), false);
    assert.equal(isValidVid('user@example.com'), false);
    assert.equal(isValidVid(GUEST_STORAGE_KEY), false);
    assert.equal(isValidVid('{"events":[]}'), false);
    assert.equal(resolveVidFromCookie(id), id);
    assert.equal(resolveVidFromCookie(GUEST_STORAGE_KEY), null);
    assert.equal(VID_COOKIE, 'cc_vid');
    assert.notEqual(VID_COOKIE, GUEST_STORAGE_KEY);
    const opts = vidCookieOptions();
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.sameSite, 'lax');
    assert.equal(opts.path, '/');
    assert.equal(opts.maxAge, 14 * 24 * 60 * 60);
  });
});

describe('cohort', () => {
  it('uses env CC_BETA_COHORT, then cookie, else public', () => {
    assert.equal(resolveCohort(null, 'beta30'), 'beta30');
    assert.equal(resolveCohort('beta30', ''), 'beta30');
    assert.equal(resolveCohort(null, ''), 'public');
    assert.equal(resolveCohort('not valid!', ''), 'public');
    assert.equal(sanitizeCohort('beta30'), 'beta30');
    assert.equal(COHORT_COOKIE, 'cc_cohort');
  });
});

describe('append line schema', () => {
  it('guest line has vid+kind+itemKey and authed:false, no email', () => {
    const s = signal('favorite');
    const line = buildGuestAppendLine({
      signal: s,
      vid: 'v_8f3e2a1b',
      cohort: 'beta30',
    });
    assert.equal(line.vid, 'v_8f3e2a1b');
    assert.equal(line.kind, 'favorite');
    assert.equal(line.itemKey, 'ev-guest-1');
    assert.equal(line.cohort, 'beta30');
    assert.equal(line.authed, false);
    assert.equal(itemKeyFromSignal(s), 'ev-guest-1');
    const dumped = formatAppendLogLine(line);
    assert.equal(dumped.includes('example.com'), false);
    assert.equal(dumped.includes('email'), false);
    assert.equal(dumped.includes('guestId'), false);
    assert.match(dumped, /"vid":"v_8f3e2a1b"/);
    assert.match(dumped, /"kind":"favorite"/);
    assert.match(dumped, /"itemKey":"ev-guest-1"/);
  });

  it('guest append never carries emailHash (0 vid+email mirror)', () => {
    const line = buildGuestAppendLine({
      signal: signal('open_card'),
      vid: 'v_8f3e2a1b',
      cohort: 'public',
    });
    const dumped = formatAppendLogLine(line);
    assert.equal('emailHash' in line, false);
    assert.equal(dumped.includes('emailHash'), false);
    assert.equal(dumped.includes('email'), false);
    assert.equal(line.authed, false);
  });
});

describe('RGPD — 0 join vid × account', () => {
  it('throws if a record carries vid with email / emailHash / Neon key', () => {
    assert.throws(
      () => assertNoVidAccountJoin({ vid: 'v_8f3e2a1b', email: 'a@b.c' }),
      /RGPD/,
    );
    assert.throws(
      () => assertNoVidAccountJoin({ vid: 'v_8f3e2a1b', emailHash: 'abc' }),
      /RGPD/,
    );
    assert.throws(
      () => assertNoVidAccountJoin({ vid: 'v_8f3e2a1b', user_key: 'a@b.c' }),
      /RGPD/,
    );
    assert.throws(
      () => assertNoVidAccountJoin({ vid: 'v_8f3e2a1b', firstName: 'Léa' }),
      /RGPD/,
    );
    assert.doesNotThrow(() =>
      assertNoVidAccountJoin({
        vid: 'v_8f3e2a1b',
        kind: 'open_card',
        authed: false,
      }),
    );
    assert.doesNotThrow(() =>
      assertNoVidAccountJoin({ emailHash: 'abc', authed: true }),
    );
  });

  it('connected path has no analytics mirror of vid or emailHash', async () => {
    const { readFile } = await import('node:fs/promises');
    const route = await readFile(
      new URL('../app/api/signals/route.ts', import.meta.url),
      'utf8',
    );
    const store = await readFile(
      new URL('./guestSignalStore.ts', import.meta.url),
      'utf8',
    );
    assert.equal(route.includes('mirrorAuthedSignals'), false);
    assert.equal(route.includes('emailHash'), false);
    assert.equal(store.includes('mirrorAuthedSignals'), false);
    assert.equal(store.includes('persistAuthedAppend'), false);
    assert.equal(store.includes('buildAuthedAppendLine'), false);
  });

  it('never copies vid into cc_signals_v1 guest store JSON', () => {
    const parsed = parseGuestStore({
      events: [],
      profile: emptyProfile(),
      vid: 'v_8f3e2a1b',
      email: 'a@b.c',
    });
    const dumped = JSON.stringify(parsed);
    assert.equal('vid' in parsed, false);
    assert.equal(dumped.includes('v_8f3e2a1b'), false);
    assert.equal(dumped.includes('a@b.c'), false);
  });
});

describe('validation guards', () => {
  it('bounds item ids, payload size, and same-site origin', () => {
    const ok = signal();
    assert.equal(itemIdsOutOfBounds(ok), false);
    const huge = makeSignal({
      kind: 'open_card',
      event_id: 'x'.repeat(129),
      moods: [],
      genres: [],
    });
    assert.equal(itemIdsOutOfBounds(huge), true);
    assert.equal(payloadExceedsLimit('{"signal":{}}'), false);
    assert.equal(payloadExceedsLimit('a'.repeat(SIGNAL_PAYLOAD_MAX_BYTES + 1)), true);

    const same = new Request('https://app.example/api/signals', {
      headers: { origin: 'https://app.example' },
    });
    assert.equal(isAllowedSignalOrigin(same), true);
    const missing = new Request('https://app.example/api/signals');
    assert.equal(isAllowedSignalOrigin(missing), true);
    const other = new Request('https://app.example/api/signals', {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(isAllowedSignalOrigin(other), false);
  });

  it('reads cc_vid from Cookie and ignores cc_signals_v1 JSON', () => {
    const header = `${GUEST_STORAGE_KEY}=${encodeURIComponent('{"events":[]}')}; ${VID_COOKIE}=v_8f3e2a1b`;
    assert.equal(readCookieValue(header, VID_COOKIE), 'v_8f3e2a1b');
    assert.equal(isValidVid(readCookieValue(header, GUEST_STORAGE_KEY)), false);
  });
});

describe('FIFO cap', () => {
  it('keeps the newest 200 signals per vid', () => {
    let list: number[] = [];
    for (let i = 0; i < 205; i += 1) {
      list = fifoAppend(list, i, GUEST_SIGNAL_FIFO_CAP);
    }
    assert.equal(list.length, 200);
    assert.equal(list[0], 5);
    assert.equal(list[199], 204);
  });
});

describe('commitGuestSignals — append-only, no account path', () => {
  beforeEach(() => {
    resetGuestRateLimitForTests();
  });

  it('creates a cc_vid and logs the append line', async () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      const result = await commitGuestSignals({
        signals: [signal('open_card')],
        cookieVid: null,
        cohortCookie: 'beta30',
        ip: '203.0.113.10',
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.created, true);
      assert.equal(isValidVid(result.vid), true);
      const dumped = lines.join('\n');
      assert.match(dumped, /"authed":false/);
      assert.match(dumped, /"kind":"open_card"/);
      assert.match(dumped, /"itemKey":"ev-guest-1"/);
      assert.match(dumped, new RegExp(`"vid":"${result.vid}"`));
      assert.equal(dumped.includes('guestId'), false);
    } finally {
      console.log = orig;
    }
  });

  it('reuses a valid cc_vid cookie', async () => {
    const result = await commitGuestSignals({
      signals: [signal('favorite')],
      cookieVid: 'v_8f3e2a1b',
      ip: '203.0.113.11',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, false);
    assert.equal(result.vid, 'v_8f3e2a1b');
  });

  it('rate-limits ~60/vid/h and ~120/IP/h', async () => {
    const orig = console.log;
    console.log = () => {};
    try {
      for (let i = 0; i < GUEST_RATE_LIMIT_PER_HOUR; i += 1) {
        const ok = await commitGuestSignals({
          signals: [signal()],
          cookieVid: 'v_ratelimit1',
          ip: `198.51.100.${i % 50}`,
        });
        assert.equal(ok.ok, true, `vid hit ${i}`);
      }
      const blockedVid = await commitGuestSignals({
        signals: [signal()],
        cookieVid: 'v_ratelimit1',
        ip: '198.51.100.200',
      });
      assert.equal(blockedVid.ok, false);
      if (blockedVid.ok) return;
      assert.equal(blockedVid.status, 429);

      resetGuestRateLimitForTests();
      for (let i = 0; i < IP_RATE_LIMIT_PER_HOUR; i += 1) {
        const ok = await commitGuestSignals({
          signals: [signal()],
          cookieVid: `v_ip${String(i).padStart(6, '0')}`,
          ip: '198.51.100.9',
        });
        assert.equal(ok.ok, true, `ip hit ${i}`);
      }
      const blockedIp = await commitGuestSignals({
        signals: [signal()],
        cookieVid: 'v_ip999999',
        ip: '198.51.100.9',
      });
      assert.equal(blockedIp.ok, false);
      if (blockedIp.ok) return;
      assert.equal(blockedIp.status, 429);
    } finally {
      console.log = orig;
    }
  });
});
