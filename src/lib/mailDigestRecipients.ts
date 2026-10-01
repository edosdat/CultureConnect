/**
 * Digest recipient list for Relance.
 * Universe = stored Google emails. Unsubscribed accounts are removed.
 * No SMTP.
 */
import 'server-only';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { VercelPool } from '@vercel/postgres';
import {
  digestRecoFieldsFromTaste,
  emptyDigestRecoProfile,
  isDigestRecipient,
  isGoogleMailKey,
  mailDigestSecrets,
  verifyMailUnsubToken,
  type DigestRecoProfile,
} from '@/lib/mailDigest';
import {
  listMailConsentFileRows,
  unsubscribeMailDigest,
  type MailConsentRow,
} from '@/lib/mailConsentStore';
import { listGoogleAccountFileEmails } from '@/lib/googleAccountStore';

export type DigestRecipient = {
  userId: string;
  email: string;
};

/** One digest recipient plus the taste row Relance needs to score. */
export type DigestProfileUser = {
  userId: string;
  email: string;
  profile: DigestRecoProfile;
  excludeWorkIds: string[];
  /** Agenda city is not stored on the account. `null` = métropole. */
  commune: null;
};

export type MailUnsubStatus = 'ok' | 'invalid' | 'unconfigured' | 'error';

/**
 * All stored Google emails, with consent columns for the JS gate.
 * `opted_in` is selected, not filtered: the test window ignores it.
 */
export const DIGEST_RECIPIENTS_SQL = `
  SELECT a.email,
         m.opted_in,
         m.unsubscribed_at
  FROM (
    SELECT DISTINCT lower(btrim(user_key)) AS email
    FROM account_tastes
    WHERE user_key IS NOT NULL
      AND position('@' in lower(btrim(user_key))) > 0
    UNION
    SELECT DISTINCT lower(btrim(email)) AS email
    FROM google_accounts
    WHERE email IS NOT NULL
      AND position('@' in lower(btrim(email))) > 0
    UNION
    SELECT DISTINCT lower(btrim(user_key)) AS email
    FROM mail_consent
    WHERE user_key IS NOT NULL
      AND position('@' in lower(btrim(user_key))) > 0
  ) a
  LEFT JOIN mail_consent m
    ON lower(btrim(m.user_key)) = a.email
  ORDER BY a.email ASC
`;

/**
 * Taste rows for the recipient emails only.
 * `user_key` is matched trim + lower, same key as the recipient list.
 */
export const DIGEST_TASTES_BY_EMAIL_SQL = `
  SELECT DISTINCT ON (lower(btrim(user_key)))
         lower(btrim(user_key)) AS email,
         state
  FROM account_tastes
  WHERE user_key IS NOT NULL
    AND lower(btrim(user_key)) = ANY($1::text[])
  ORDER BY lower(btrim(user_key)), updated_at DESC
`;

function postgresUrl(): string | undefined {
  const env = process.env;
  const url = (env['POSTGRES_URL'] || env['POSTGRES_URL_NON_POOLING'] || '').trim();
  if (!url || url === 'undefined') return undefined;
  return url;
}

let pool: VercelPool | null = null;
let tableReady: Promise<void> | null = null;

function getPool(): VercelPool | null {
  const url = postgresUrl();
  if (!url) return null;
  if (!pool) {
    pool = new VercelPool({ connectionString: url });
  }
  return pool;
}

export function resetDigestRecipientPoolForTests(): void {
  pool = null;
  tableReady = null;
}

async function ensureTables(): Promise<VercelPool | null> {
  const pg = getPool();
  if (!pg) return null;
  if (!tableReady) {
    tableReady = (async () => {
      await pg.query(`
        CREATE TABLE IF NOT EXISTS account_tastes (
          user_key TEXT PRIMARY KEY,
          state JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pg.query(`
        CREATE TABLE IF NOT EXISTS google_accounts (
          email TEXT PRIMARY KEY,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pg.query(`
        CREATE TABLE IF NOT EXISTS mail_consent (
          user_key TEXT PRIMARY KEY,
          opted_in BOOLEAN NOT NULL,
          seen BOOLEAN NOT NULL DEFAULT false,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          unsubscribed_at TIMESTAMPTZ
        )
      `);
      await pg.query(`
        ALTER TABLE mail_consent
        ADD COLUMN IF NOT EXISTS seen BOOLEAN NOT NULL DEFAULT false
      `);
      await pg.query(`
        ALTER TABLE mail_consent
        ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ
      `);
    })().catch((err: unknown) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
  return pg;
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function tasteDir(): string {
  return (
    process.env['TASTE_STORE_DIR'] ||
    path.join(process.cwd(), '.data', 'account-tastes')
  );
}

async function listTasteFileEmails(): Promise<string[]> {
  let names: string[] = [];
  try {
    names = await readdir(tasteDir());
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(
        await readFile(path.join(tasteDir(), name), 'utf8'),
      ) as { key?: unknown };
      const email = typeof raw.key === 'string' ? raw.key.trim().toLowerCase() : '';
      if (isGoogleMailKey(email)) out.push(email);
    } catch {
      /* skip */
    }
  }
  return out;
}

function toRecipients(
  rows: Array<{ email: string; opted: boolean; unsubscribedAt: string | null }>,
  now: Date,
): DigestRecipient[] {
  const seen = new Set<string>();
  const out: DigestRecipient[] = [];
  const sorted = [...rows].sort((a, b) => a.email.localeCompare(b.email));
  for (const row of sorted) {
    if (!isDigestRecipient(row, now)) continue;
    if (seen.has(row.email)) continue;
    seen.add(row.email);
    out.push({ userId: row.email, email: row.email });
  }
  return out;
}

async function listFromFiles(now: Date): Promise<DigestRecipient[]> {
  const consent = await listMailConsentFileRows();
  const consentByEmail = new Map<string, MailConsentRow>();
  for (const row of consent) consentByEmail.set(row.email, row);
  const universe = new Set<string>([
    ...(await listGoogleAccountFileEmails()),
    ...(await listTasteFileEmails()),
    ...consent.map((row) => row.email),
  ]);
  const rows = [...universe].map((email) => {
    const flags = consentByEmail.get(email);
    return {
      email,
      opted: flags?.opted === true,
      unsubscribedAt: flags?.unsubscribedAt ?? null,
    };
  });
  return toRecipients(rows, now);
}

function unwrapTasteState(raw: unknown, depth = 0): unknown {
  if (typeof raw !== 'string' || depth > 2) return raw;
  try {
    return unwrapTasteState(JSON.parse(raw), depth + 1);
  } catch {
    return null;
  }
}

async function tasteStatesFromFiles(want: ReadonlySet<string>): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (want.size === 0) return out;
  let names: string[] = [];
  try {
    names = await readdir(tasteDir());
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(await readFile(path.join(tasteDir(), name), 'utf8')) as {
        key?: unknown;
        state?: unknown;
      };
      const email = typeof raw.key === 'string' ? raw.key.trim().toLowerCase() : '';
      if (!isGoogleMailKey(email) || !want.has(email)) continue;
      out.set(email, raw.state ?? null);
    } catch {
      /* skip */
    }
  }
  return out;
}

async function tasteStatesByEmail(emails: readonly string[]): Promise<Map<string, unknown>> {
  const want = new Set(emails);
  const pg = await ensureTables();
  if (!pg) return tasteStatesFromFiles(want);
  if (want.size === 0) return new Map();
  const { rows } = await pg.query<{ email: string | null; state: unknown }>(
    DIGEST_TASTES_BY_EMAIL_SQL,
    [[...want]],
  );
  const out = new Map<string, unknown>();
  for (const row of rows) {
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    if (!want.has(email) || out.has(email)) continue;
    out.set(email, unwrapTasteState(row.state));
  }
  return out;
}

export async function listDigestProfiles(now = new Date()): Promise<DigestProfileUser[]> {
  const recipients = await listDigestRecipients(now);
  const states = await tasteStatesByEmail(recipients.map((row) => row.email));
  return recipients.map((row) => {
    const stored = states.get(row.email);
    const fields =
      stored === undefined
        ? { profile: emptyDigestRecoProfile(), excludeWorkIds: [] as string[] }
        : digestRecoFieldsFromTaste(unwrapTasteState(stored));
    return {
      userId: row.userId,
      email: row.email,
      profile: fields.profile,
      excludeWorkIds: fields.excludeWorkIds,
      commune: null,
    };
  });
}

export async function listDigestRecipients(now = new Date()): Promise<DigestRecipient[]> {
  const pg = await ensureTables();
  if (!pg) return listFromFiles(now);
  const { rows } = await pg.query<{
    email: string | null;
    opted_in: boolean | null;
    unsubscribed_at: Date | string | null;
  }>(DIGEST_RECIPIENTS_SQL);
  return toRecipients(
    rows.map((row) => ({
      email: typeof row.email === 'string' ? row.email.trim().toLowerCase() : '',
      opted: row.opted_in === true,
      unsubscribedAt: isoOrNull(row.unsubscribed_at),
    })),
    now,
  );
}

export async function unsubscribeByMailToken(
  token: string | null | undefined,
): Promise<MailUnsubStatus> {
  const secrets = mailDigestSecrets();
  if (secrets.length === 0) {
    console.error('mail unsub: no RELANCE_DIGEST_SECRET or CRON_SECRET');
    return 'unconfigured';
  }
  const raw = (token || '').trim();
  if (!raw) return 'invalid';
  let email: string | null = null;
  for (const secret of secrets) {
    email = verifyMailUnsubToken(raw, secret);
    if (email) break;
  }
  if (!email) return 'invalid';
  try {
    await unsubscribeMailDigest(email);
    return 'ok';
  } catch {
    console.error('mail unsub: write failed');
    return 'error';
  }
}
