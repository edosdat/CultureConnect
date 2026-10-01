/**
 * Persist mail-ideas consent keyed by Google email.
 * Digest list is cron-only (Bearer secret). No SMTP from Site.
 * `unsubscribed_at` excludes a recipient. `opted_in` is not the list gate
 * until 2026-12-01 (see `digestOptInGateActive`).
 */
import 'server-only';
import { createHash } from 'crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { VercelPool } from '@vercel/postgres';

function normalizeKey(value?: string | null): string | null {
  const raw = (value || '').trim().toLowerCase();
  return raw || null;
}

function dataDir(): string {
  return (
    process.env['MAIL_CONSENT_DIR'] ||
    path.join(process.cwd(), '.data', 'mail-consent')
  );
}

function fileName(key: string): string {
  return `${createHash('sha256').update(key).digest('hex')}.json`;
}

function filePathFor(key: string): string {
  return path.join(dataDir(), fileName(key));
}

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

export function resetMailConsentPoolForTests(): void {
  pool = null;
  tableReady = null;
}

async function ensureTable(): Promise<VercelPool | null> {
  const pg = getPool();
  if (!pg) return null;
  if (!tableReady) {
    tableReady = (async () => {
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

export type MailFlags = {
  opted: boolean;
  seen: boolean;
  unsubscribedAt: string | null;
  updatedAt: string | null;
};

export type MailConsentRow = {
  email: string;
  opted: boolean;
  unsubscribedAt: string | null;
};

function emptyFlags(): MailFlags {
  return { opted: false, seen: false, unsubscribedAt: null, updatedAt: null };
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

async function readFileFlags(key: string): Promise<MailFlags | null> {
  try {
    const raw = JSON.parse(await readFile(filePathFor(key), 'utf8')) as {
      opted?: unknown;
      seen?: unknown;
      unsubscribedAt?: unknown;
      updatedAt?: unknown;
    };
    if (typeof raw.opted !== 'boolean' && typeof raw.seen !== 'boolean') {
      return null;
    }
    return {
      opted: raw.opted === true,
      seen: raw.seen === true,
      unsubscribedAt: isoOrNull(raw.unsubscribedAt),
      updatedAt: isoOrNull(raw.updatedAt),
    };
  } catch {
    return null;
  }
}

async function writeFileFlags(key: string, flags: MailFlags): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(
      filePathFor(key),
      JSON.stringify({ email: key, ...flags }),
      'utf8',
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') return;
  }
}

async function persistFlags(key: string, flags: MailFlags): Promise<void> {
  const pg = await ensureTable();
  if (pg) {
    await pg.query(
      `INSERT INTO mail_consent (user_key, opted_in, seen, updated_at, unsubscribed_at)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (user_key)
       DO UPDATE SET
         opted_in = EXCLUDED.opted_in,
         seen = EXCLUDED.seen,
         updated_at = now(),
         unsubscribed_at = EXCLUDED.unsubscribed_at`,
      [key, flags.opted, flags.seen, flags.unsubscribedAt],
    );
  }
  await writeFileFlags(key, flags);
}

export async function readMailFlags(email: string): Promise<MailFlags> {
  const key = normalizeKey(email);
  if (!key) return emptyFlags();
  const pg = await ensureTable();
  if (pg) {
    const { rows } = await pg.query<{
      opted_in: boolean;
      seen: boolean | null;
      updated_at: Date | string | null;
      unsubscribed_at: Date | string | null;
    }>(
      `SELECT opted_in, seen, updated_at, unsubscribed_at
       FROM mail_consent WHERE user_key = $1 LIMIT 1`,
      [key],
    );
    if (rows[0]) {
      return {
        opted: Boolean(rows[0].opted_in),
        seen: Boolean(rows[0].seen),
        updatedAt: isoOrNull(rows[0].updated_at),
        unsubscribedAt: isoOrNull(rows[0].unsubscribed_at),
      };
    }
    return emptyFlags();
  }
  return (await readFileFlags(key)) ?? emptyFlags();
}

export async function readMailConsent(email: string): Promise<boolean> {
  return (await readMailFlags(email)).opted;
}

export async function writeMailFlags(
  email: string,
  patch: Partial<Pick<MailFlags, 'opted' | 'seen'>>,
): Promise<MailFlags> {
  const key = normalizeKey(email);
  const current = await readMailFlags(email);
  const next: MailFlags = {
    opted: typeof patch.opted === 'boolean' ? patch.opted : current.opted,
    seen: typeof patch.seen === 'boolean' ? patch.seen : current.seen,
    unsubscribedAt: patch.opted === true ? null : current.unsubscribedAt,
    updatedAt: new Date().toISOString(),
  };
  if (!key) return next;
  await persistFlags(key, next);
  return next;
}

export async function writeMailConsent(
  email: string,
  opted: boolean,
): Promise<void> {
  await writeMailFlags(email, { opted });
}

/** One-click digest unsubscribe. Sets `unsubscribed_at` even if opted_in was already false. */
export async function unsubscribeMailDigest(email: string): Promise<MailFlags> {
  const key = normalizeKey(email);
  const current = await readMailFlags(email);
  const next: MailFlags = {
    opted: false,
    seen: current.seen,
    unsubscribedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!key) return next;
  await persistFlags(key, next);
  return next;
}

export async function listMailConsentFileRows(): Promise<MailConsentRow[]> {
  let names: string[] = [];
  try {
    names = await readdir(dataDir());
  } catch {
    return [];
  }
  const out: MailConsentRow[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(
        await readFile(path.join(dataDir(), name), 'utf8'),
      ) as {
        email?: unknown;
        opted?: unknown;
        unsubscribedAt?: unknown;
      };
      const email =
        typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
      if (!email) continue;
      out.push({
        email,
        opted: raw.opted === true,
        unsubscribedAt: isoOrNull(raw.unsubscribedAt),
      });
    } catch {
      /* skip torn files */
    }
  }
  return out;
}

export async function deleteMailConsent(email: string): Promise<void> {
  const key = normalizeKey(email);
  if (!key) return;
  const pg = await ensureTable();
  if (pg) {
    await pg.query(`DELETE FROM mail_consent WHERE user_key = $1`, [key]);
  }
  try {
    await unlink(filePathFor(key));
  } catch {
    /* missing file is fine */
  }
}
