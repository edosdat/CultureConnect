/**
 * Persist mail-ideas consent (yes/no) keyed by Google email.
 * No send, no list, no cron.
 */
import 'server-only';
import { createHash } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
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

async function ensureTable(): Promise<VercelPool | null> {
  const pg = getPool();
  if (!pg) return null;
  if (!tableReady) {
    tableReady = (async () => {
      await pg.query(`
        CREATE TABLE IF NOT EXISTS mail_consent (
          user_key TEXT PRIMARY KEY,
          opted_in BOOLEAN NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    })().catch((err: unknown) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
  return pg;
}

async function readFileConsent(key: string): Promise<boolean | null> {
  try {
    const raw = JSON.parse(await readFile(filePathFor(key), 'utf8')) as {
      opted?: unknown;
    };
    if (typeof raw.opted === 'boolean') return raw.opted;
    return null;
  } catch {
    return null;
  }
}

async function writeFileConsent(key: string, opted: boolean): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(filePathFor(key), JSON.stringify({ opted }), 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') return;
  }
}

export async function readMailConsent(email: string): Promise<boolean> {
  const key = normalizeKey(email);
  if (!key) return false;
  const pg = await ensureTable();
  if (pg) {
    const { rows } = await pg.query<{ opted_in: boolean }>(
      `SELECT opted_in FROM mail_consent WHERE user_key = $1 LIMIT 1`,
      [key],
    );
    if (rows[0]) return Boolean(rows[0].opted_in);
    return false;
  }
  return (await readFileConsent(key)) ?? false;
}

export async function writeMailConsent(
  email: string,
  opted: boolean,
): Promise<void> {
  const key = normalizeKey(email);
  if (!key) return;
  const pg = await ensureTable();
  if (pg) {
    await pg.query(
      `INSERT INTO mail_consent (user_key, opted_in, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_key)
       DO UPDATE SET opted_in = EXCLUDED.opted_in, updated_at = now()`,
      [key, opted],
    );
  }
  await writeFileConsent(key, opted);
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
