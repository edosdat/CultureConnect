import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  COHORT_COOKIE,
  GUEST_ID_COOKIE,
  GUEST_RATE_LIMIT_PER_HOUR,
  GUEST_SIGNAL_FIFO_CAP,
  IP_RATE_LIMIT_PER_HOUR,
  SIGNAL_PAYLOAD_MAX_BYTES,
  buildAuthedAppendLine,
  buildGuestAppendLine,
  fifoAppend,
  formatAppendLogLine,
  generateGuestId,
  guestIdCookieOptions,
  hashEmail,
  isAllowedSignalOrigin,
  isValidGuestId,
  itemIdsOutOfBounds,
  itemKeyFromSignal,
  payloadExceedsLimit,
  readCookieValue,
  resolveCohort,
  resolveGuestIdFromCookie,
  sanitizeCohort,
} from './guestSignals';
import { GUEST_STORAGE_KEY, makeSignal } from './signals';
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

describe('cc_guest_id format', () => {
  it('generates g_ + 8–12 alphanumeric and rejects PII / store JSON', () => {
    const id = generateGuestId();
    assert.match(id, /^g_[a-z0-9]{8,12}$/);
    assert.equal(isValidGuestId(id), true);
    assert.equal(isValidGuestId('g_8f3e2a1b'), true);
    assert.equal(isValidGuestId('g_short'), false);
    assert.equal(isValidGuestId('user@example.com'), false);
    assert.equal(isValidGuestId(GUEST_STORAGE_KEY), false);
    assert.equal(isValidGuestId('{"events":[]}'), false);
    assert.equal(resolveGuestIdFromCookie(id), id);
    assert.equal(resolveGuestIdFromCookie(GUEST_STORAGE_KEY), null);
    assert.equal(GUEST_ID_COOKIE, 'cc_guest_id');
    assert.notEqual(GUEST_ID_COOKIE, GUEST_STORAGE_KEY);
    const opts = guestIdCookieOptions();
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
  it('guest line has guestId+kind+itemKey and authed:false, no email', () => {
    const s = signal('favorite');
    const line = buildGuestAppendLine({
      signal: s,
      guestId: 'g_8f3e2a1b',
      cohort: 'beta30',
    });
    assert.equal(line.guestId, 'g_8f3e2a1b');
    assert.equal(line.kind, 'favorite');
    assert.equal(line.itemKey, 'ev-guest-1');
    assert.equal(line.cohort, 'beta30');
    assert.equal(line.authed, false);
    assert.equal(itemKeyFromSignal(s), 'ev-guest-1');
    const dumped = formatAppendLogLine(line);
    assert.equal(dumped.includes('example.com'), false);
    assert.equal(dumped.includes('email'), false);
    assert.match(dumped, /"guestId":"g_8f3e2a1b"/);
    assert.match(dumped, /"kind":"favorite"/);
    assert.match(dumped, /"itemKey":"ev-guest-1"/);
  });

  it('authed mirror hashes email and never stores plaintext', () => {
    const s = signal('open_card');
    const line = buildAuthedAppendLine({
      signal: s,
      email: 'Tester@Example.com',
      cohort: 'public',
    });
    assert.equal(line.authed, true);
    assert.equal(line.emailHash, hashEmail('tester@example.com'));
    assert.equal(line.emailHash.length, 64);
    const dumped = formatAppendLogLine(line);
    assert.equal(dumped.toLowerCase().includes('tester@example.com'), false);
    assert.equal('email' in line, false);
    assert.equal('guestId' in line, false);
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

  it('reads cc_guest_id from Cookie and ignores cc_signals_v1 JSON', () => {
    const header = `${GUEST_STORAGE_KEY}=${encodeURIComponent('{"events":[]}')}; ${GUEST_ID_COOKIE}=g_8f3e2a1b`;
    assert.equal(readCookieValue(header, GUEST_ID_COOKIE), 'g_8f3e2a1b');
    assert.equal(isValidGuestId(readCookieValue(header, GUEST_STORAGE_KEY)), false);
  });
});

describe('FIFO cap', () => {
  it('keeps the newest 200 signals per guestId', () => {
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

  it('creates a guest id and logs the append line', async () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      const result = await commitGuestSignals({
        signals: [signal('open_card')],
        cookieGuestId: null,
        cohortCookie: 'beta30',
        ip: '203.0.113.10',
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.created, true);
      assert.equal(isValidGuestId(result.guestId), true);
      const dumped = lines.join('\n');
      assert.match(dumped, /"authed":false/);
      assert.match(dumped, /"kind":"open_card"/);
      assert.match(dumped, /"itemKey":"ev-guest-1"/);
      assert.match(dumped, new RegExp(`"guestId":"${result.guestId}"`));
    } finally {
      console.log = orig;
    }
  });

  it('reuses a valid cookie guest id', async () => {
    const result = await commitGuestSignals({
      signals: [signal('favorite')],
      cookieGuestId: 'g_8f3e2a1b',
      ip: '203.0.113.11',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, false);
    assert.equal(result.guestId, 'g_8f3e2a1b');
  });

  it('rate-limits ~60/guestId/h and ~120/IP/h', async () => {
    const orig = console.log;
    console.log = () => {};
    try {
    for (let i = 0; i < GUEST_RATE_LIMIT_PER_HOUR; i += 1) {
      const ok = await commitGuestSignals({
        signals: [signal()],
        cookieGuestId: 'g_ratelimit1',
        ip: `198.51.100.${i % 50}`,
      });
      assert.equal(ok.ok, true, `guest hit ${i}`);
    }
    const blockedGuest = await commitGuestSignals({
      signals: [signal()],
      cookieGuestId: 'g_ratelimit1',
      ip: '198.51.100.200',
    });
    assert.equal(blockedGuest.ok, false);
    if (blockedGuest.ok) return;
    assert.equal(blockedGuest.status, 429);

    resetGuestRateLimitForTests();
    for (let i = 0; i < IP_RATE_LIMIT_PER_HOUR; i += 1) {
      const ok = await commitGuestSignals({
        signals: [signal()],
        cookieGuestId: `g_ip${String(i).padStart(6, '0')}`,
        ip: '198.51.100.9',
      });
      assert.equal(ok.ok, true, `ip hit ${i}`);
    }
    const blockedIp = await commitGuestSignals({
      signals: [signal()],
      cookieGuestId: 'g_ip999999',
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
