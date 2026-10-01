import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  bearerAuthorizesDigest,
  digestOptInGateActive,
  digestRecoFieldsFromTaste,
  emptyDigestRecoProfile,
  isDigestRecipient,
  mailDigestSecrets,
  mailUnsubPath,
  mailUnsubPayloadJson,
  signMailUnsubToken,
  verifyMailUnsubToken,
} from './mailDigest';
import { notInterestedBlockKeys } from './reco';
import {
  DIGEST_RECIPIENTS_SQL,
  DIGEST_TASTES_BY_EMAIL_SQL,
  listDigestProfiles,
  listDigestRecipients,
  resetDigestRecipientPoolForTests,
  unsubscribeByMailToken,
} from './mailDigestRecipients';
import {
  readMailFlags,
  resetMailConsentPoolForTests,
  unsubscribeMailDigest,
  writeMailFlags,
} from './mailConsentStore';
import {
  rememberGoogleAccount,
  resetGoogleAccountPoolForTests,
} from './googleAccountStore';

const DURING = new Date('2026-10-01T12:00:00+02:00');
const AFTER = new Date('2026-12-01T00:00:00+01:00');
const JUST_BEFORE = new Date('2026-11-30T22:59:59.000Z');

describe('digest recipient gate', () => {
  it('mails every Google email until 1 Dec 2026 Paris, then opt-in only', () => {
    assert.equal(digestOptInGateActive(DURING), false);
    assert.equal(digestOptInGateActive(JUST_BEFORE), false);
    assert.equal(digestOptInGateActive(AFTER), true);
    const plain = { email: 'ada@example.com', opted: false, unsubscribedAt: null };
    assert.equal(isDigestRecipient(plain, DURING), true);
    assert.equal(isDigestRecipient(plain, AFTER), false);
    assert.equal(
      isDigestRecipient({ ...plain, opted: true }, AFTER),
      true,
    );
    assert.equal(
      isDigestRecipient(
        { ...plain, opted: true, unsubscribedAt: '2026-10-02T00:00:00.000Z' },
        DURING,
      ),
      false,
    );
    assert.equal(
      isDigestRecipient({ ...plain, email: 'pas-un-email' }, DURING),
      false,
    );
  });

  it('does not filter opted_in in SQL — the date gate is applied in JS', () => {
    assert.equal(DIGEST_RECIPIENTS_SQL.includes('opted_in = true'), false);
    assert.match(DIGEST_RECIPIENTS_SQL, /google_accounts/);
    assert.match(DIGEST_RECIPIENTS_SQL, /account_tastes/);
    assert.match(DIGEST_RECIPIENTS_SQL, /unsubscribed_at/);
    assert.match(DIGEST_TASTES_BY_EMAIL_SQL, /account_tastes/);
    assert.match(DIGEST_TASTES_BY_EMAIL_SQL, /lower\(btrim\(user_key\)\)/);
    assert.equal(DIGEST_TASTES_BY_EMAIL_SQL.includes('opted_in'), false);
  });
});

describe('digest profile payload', () => {
  const pasPourMoi = {
    id: 's1',
    ts: '2026-10-01T10:00:00.000Z',
    kind: 'not_interested' as const,
    weight: -4,
    film_id: 'F-NO',
    event_id: 'E-NO',
    programme_id: 'p-no',
    genres: [] as string[],
    moods: [] as string[],
  };
  const favorite = {
    id: 's2',
    ts: '2026-10-01T11:00:00.000Z',
    kind: 'favorite' as const,
    weight: 6,
    film_id: 'F-YES',
    genres: ['jazz'],
    moods: ['intimiste'],
  };

  it('keeps moods, genres, themes and the same pas-pour-moi keys as the app', () => {
    const fields = digestRecoFieldsFromTaste({
      signalsRecent: [pasPourMoi, favorite],
      profile: {
        moods: { intimiste: { weight: 40, pct: 80 } },
        genres: { jazz: { weight: 20, pct: 40 } },
        themes: { amour: { weight: 10, pct: 20 } },
        cats: { cine: { weight: 9, pct: 100 } },
        communes: { Toulouse: 3 },
      },
      tastesText: 'ne pas renvoyer',
    });
    assert.deepEqual(fields.profile.moods.intimiste, { weight: 40, pct: 100 });
    assert.deepEqual(fields.profile.genres.jazz, { weight: 20, pct: 100 });
    assert.deepEqual(fields.profile.themes.amour, { weight: 10, pct: 100 });
    assert.equal('cats' in fields.profile, false);
    assert.equal('communes' in fields.profile, false);
    assert.deepEqual(fields.excludeWorkIds, [...notInterestedBlockKeys([pasPourMoi, favorite])]);
    assert.equal(fields.excludeWorkIds.includes('f:F-YES'), false);
    assert.equal(JSON.stringify(fields).includes('ne pas renvoyer'), false);
  });

  it('missing or unreadable taste is an empty profile', () => {
    const empty = {
      profile: emptyDigestRecoProfile(),
      excludeWorkIds: [] as string[],
    };
    assert.deepEqual(digestRecoFieldsFromTaste(null), empty);
    assert.deepEqual(digestRecoFieldsFromTaste('nope'), empty);
    assert.deepEqual(digestRecoFieldsFromTaste({}), empty);
  });
});

describe('digest bearer + unsub token', () => {
  const prevRelance = process.env.RELANCE_DIGEST_SECRET;
  const prevCron = process.env.CRON_SECRET;

  afterEach(() => {
    if (prevRelance === undefined) delete process.env.RELANCE_DIGEST_SECRET;
    else process.env.RELANCE_DIGEST_SECRET = prevRelance;
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  });

  it('accepts either secret and rejects a missing or wrong bearer', () => {
    process.env.RELANCE_DIGEST_SECRET = 'relance-secret';
    process.env.CRON_SECRET = 'cron-secret';
    const secrets = mailDigestSecrets();
    assert.deepEqual(secrets, ['relance-secret', 'cron-secret']);
    assert.equal(bearerAuthorizesDigest('Bearer relance-secret', secrets), true);
    assert.equal(bearerAuthorizesDigest('bearer cron-secret', secrets), true);
    assert.equal(bearerAuthorizesDigest('Bearer nope', secrets), false);
    assert.equal(bearerAuthorizesDigest(null, secrets), false);
    assert.equal(bearerAuthorizesDigest('Bearer relance-secret', []), false);
  });

  it('signs a stable token Relance can rebuild', () => {
    const email = 'ada@example.com';
    const secret = 'test-secret';
    assert.equal(
      mailUnsubPayloadJson(email),
      '{"v":1,"e":"ada@example.com","p":"digest-unsub"}',
    );
    const token = signMailUnsubToken(`  ${email.toUpperCase()}  `, secret);
    assert.equal(
      token,
      'eyJ2IjoxLCJlIjoiYWRhQGV4YW1wbGUuY29tIiwicCI6ImRpZ2VzdC11bnN1YiJ9.q3XFSvSW_TgJDNogC3o9ku75_GbEzqxa_jSfiXxpF0I',
    );
    assert.equal(token, signMailUnsubToken(email, secret));
    assert.equal(verifyMailUnsubToken(token!, secret), email);
    assert.equal(verifyMailUnsubToken(token!, 'other'), null);
    assert.equal(verifyMailUnsubToken(`${token}x`, secret), null);
    const [payload, sig] = token!.split('.');
    assert.equal(verifyMailUnsubToken(`${payload}x.${sig}`, secret), null);
    assert.equal(mailUnsubPath(token!), `/mail/unsub?t=${token}`);
    assert.equal(signMailUnsubToken('pas-un-email', secret), null);
  });
});

describe('digest file list + one-click unsub', () => {
  let dir = '';
  const envKeys = [
    'POSTGRES_URL',
    'POSTGRES_URL_NON_POOLING',
    'MAIL_CONSENT_DIR',
    'GOOGLE_ACCOUNTS_DIR',
    'TASTE_STORE_DIR',
    'RELANCE_DIGEST_SECRET',
    'CRON_SECRET',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'digest-'));
    for (const key of envKeys) saved[key] = process.env[key];
    process.env.POSTGRES_URL = '';
    process.env.POSTGRES_URL_NON_POOLING = '';
    process.env.MAIL_CONSENT_DIR = path.join(dir, 'consent');
    process.env.GOOGLE_ACCOUNTS_DIR = path.join(dir, 'google');
    process.env.TASTE_STORE_DIR = path.join(dir, 'tastes');
    process.env.RELANCE_DIGEST_SECRET = 'test-secret';
    delete process.env.CRON_SECRET;
    resetMailConsentPoolForTests();
    resetGoogleAccountPoolForTests();
    resetDigestRecipientPoolForTests();
  });

  afterEach(async () => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetMailConsentPoolForTests();
    resetGoogleAccountPoolForTests();
    resetDigestRecipientPoolForTests();
    await rm(dir, { recursive: true, force: true });
  });

  it('lists Google emails without an opt-in row, and drops unsubscribed ones', async () => {
    await rememberGoogleAccount('Ada@Example.com');
    await rememberGoogleAccount('bea@example.com');
    await mkdir(path.join(dir, 'tastes'), { recursive: true });
    await writeFile(
      path.join(dir, 'tastes', 'cleo.json'),
      JSON.stringify({ key: 'cleo@example.com', state: {} }),
    );
    await writeMailFlags('ada@example.com', { opted: false });
    await unsubscribeMailDigest('bea@example.com');

    const during = await listDigestRecipients(DURING);
    assert.deepEqual(
      during.map((row) => row.email),
      ['ada@example.com', 'cleo@example.com'],
    );
    assert.equal(during[0]?.userId, 'ada@example.com');

    const after = await listDigestRecipients(AFTER);
    assert.deepEqual(after, []);

    await writeMailFlags('ada@example.com', { opted: true });
    const afterOptIn = await listDigestRecipients(AFTER);
    assert.deepEqual(afterOptIn, [
      { userId: 'ada@example.com', email: 'ada@example.com' },
    ]);
  });

  it('seen=true does not opt out and does not drop the test-window list', async () => {
    await rememberGoogleAccount('ada@example.com');
    await writeMailFlags('ada@example.com', { seen: true });
    const flags = await readMailFlags('ada@example.com');
    assert.equal(flags.seen, true);
    assert.equal(flags.opted, false);
    assert.equal(flags.unsubscribedAt, null);
    assert.deepEqual(await listDigestRecipients(DURING), [
      { userId: 'ada@example.com', email: 'ada@example.com' },
    ]);
    assert.deepEqual(await listDigestRecipients(AFTER), []);
  });

  it('one-click token unsubscribes without a session and a second click stays out', async () => {
    await rememberGoogleAccount('ada@example.com');
    const token = signMailUnsubToken('ada@example.com', 'test-secret');
    assert.equal(await unsubscribeByMailToken(token), 'ok');
    assert.deepEqual(await listDigestRecipients(DURING), []);
    assert.equal(await unsubscribeByMailToken(token), 'ok');
    assert.deepEqual(await listDigestRecipients(DURING), []);
    await writeMailFlags('ada@example.com', { opted: true });
    assert.deepEqual(await listDigestRecipients(DURING), [
      { userId: 'ada@example.com', email: 'ada@example.com' },
    ]);
    assert.equal(await unsubscribeByMailToken('nope'), 'invalid');
    delete process.env.RELANCE_DIGEST_SECRET;
    assert.equal(await unsubscribeByMailToken(token), 'unconfigured');
  });

  it('joins the recipient list to account tastes and leaves a missing row empty', async () => {
    await rememberGoogleAccount('ada@example.com');
    await rememberGoogleAccount('bea@example.com');
    await unsubscribeMailDigest('bea@example.com');
    await mkdir(path.join(dir, 'tastes'), { recursive: true });
    await writeFile(
      path.join(dir, 'tastes', 'cleo.json'),
      JSON.stringify({
        key: 'Cleo@Example.com',
        state: {
          signalsRecent: [
            {
              id: 'n1',
              ts: '2026-10-01T10:00:00.000Z',
              kind: 'not_interested',
              weight: -4,
              event_id: 'E-DROP',
              genres: [],
              moods: [],
            },
          ],
          profile: {
            moods: { intimiste: { weight: 40, pct: 80 } },
            genres: { jazz: { weight: 20, pct: 40 } },
            themes: {},
          },
          tastesText: 'ne pas renvoyer',
        },
      }),
    );

    const users = await listDigestProfiles(DURING);
    assert.deepEqual(
      users.map((row) => row.email),
      ['ada@example.com', 'cleo@example.com'],
    );
    assert.deepEqual(users[0], {
      userId: 'ada@example.com',
      email: 'ada@example.com',
      profile: { moods: {}, genres: {}, themes: {} },
      excludeWorkIds: [],
      commune: null,
    });
    const cleo = users[1]!;
    assert.equal(cleo.userId, 'cleo@example.com');
    assert.equal(cleo.commune, null);
    assert.deepEqual(cleo.profile.moods.intimiste, { weight: 40, pct: 100 });
    assert.deepEqual(cleo.profile.genres.jazz, { weight: 20, pct: 100 });
    assert.deepEqual(cleo.excludeWorkIds, ['e:E-DROP']);
    assert.equal(JSON.stringify(cleo).includes('ne pas renvoyer'), false);
    assert.equal(JSON.stringify(users).includes('bea@example.com'), false);
  });
});

describe('digest copy and route', () => {
  it('documents the test window, the curl, and the unsub sentence', async () => {
    const doc = await readFile(
      path.join(process.cwd(), 'docs/relance-digest.md'),
      'utf8',
    );
    const page = await readFile(
      path.join(process.cwd(), 'src/app/mail/unsub/page.tsx'),
      'utf8',
    );
    const route = await readFile(
      path.join(process.cwd(), 'src/app/api/mail-digest/recipients/route.ts'),
      'utf8',
    );
    const profilesRoute = await readFile(
      path.join(process.cwd(), 'src/app/api/mail-digest/profiles/route.ts'),
      'utf8',
    );
    const auth = await readFile(path.join(process.cwd(), 'src/auth.ts'), 'utf8');
    const privacy = await readFile(
      path.join(process.cwd(), 'src/app/confidentialite/page.tsx'),
      'utf8',
    );
    assert.match(doc, /1er décembre 2026/);
    assert.match(doc, /\/api\/mail-digest\/recipients/);
    assert.match(doc, /\/api\/mail-digest\/profiles/);
    assert.match(doc, /Authorization: Bearer \$RELANCE_DIGEST_SECRET/);
    assert.match(doc, /"commune": null/);
    assert.match(profilesRoute, /bearerAuthorizesDigest/);
    assert.match(profilesRoute, /mailDigestSecrets/);
    assert.match(profilesRoute, /listDigestProfiles/);
    assert.equal(profilesRoute.includes('queryRelanceDigest'), false);
    assert.equal(profilesRoute.includes('opted_in'), false);
    assert.match(
      doc,
      /eyJ2IjoxLCJlIjoiYWRhQGV4YW1wbGUuY29tIiwicCI6ImRpZ2VzdC11bnN1YiJ9\.q3XFSvSW_TgJDNogC3o9ku75_GbEzqxa_jSfiXxpF0I/,
    );
    assert.match(page, /Tu ne recevras plus le digeste/);
    assert.match(page, /\/confidentialite/);
    assert.match(route, /bearerAuthorizesDigest/);
    assert.match(route, /listDigestRecipients/);
    assert.equal(route.includes('opted_in'), false);
    assert.match(auth, /rememberGoogleAccount/);
    assert.match(privacy, /1er/);
    assert.match(privacy, /décembre 2026/);
  });
});
