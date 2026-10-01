/**
 * Google emails seen at sign-in.
 * There is no NextAuth users table (JWT sessions). This row plus
 * `account_tastes.user_key` is the durable account list.
 */
import 'server-only';
import { createHash } from 'crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { VercelPool } from '@vercel/postgres';
import { isGoogleMailKey } from '@/lib/mailDigest';

function normalizeEmail(value?: string | null): string | null {
  const email = (value || '').trim().toLowerCase();
  return isGoogleMailKey(email) ? email : null;
}

function dataDir(): string {
  return (
    process.env['GOOGLE_ACCOUNTS_DIR'] ||
    path.join(process.cwd(), '.data', 'google-accounts')
  );
}

function filePathFor(email: string): string {
  const name = `${createHash('sha256').update(email).digest('hex')}.json`;
  return path.join(dataDir(), name);
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

export function resetGoogleAccountPoolForTests(): void {
  pool = null;
  tableReady = null;
}

async function ensureTable(): Promise<VercelPool | null> {
  const pg = getPool();
  if (!pg) return null;
  if (!tableReady) {
    tableReady = (async () => {
      await pg.query(`
        CREATE TABLE IF NOT EXISTS google_accounts (
          email TEXT PRIMARY KEY,
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

async function writeFileEmail(email: string): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(
      filePathFor(email),
      JSON.stringify({ email, updatedAt: new Date().toISOString() }),
      'utf8',
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') return;
  }
}

/** Record a validated Google login email. Invalid values are ignored. */
export async function rememberGoogleAccount(email?: string | null): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) return;
  const pg = await ensureTable();
  if (pg) {
    await pg.query(
      `INSERT INTO google_accounts (email, updated_at)
       VALUES ($1, now())
       ON CONFLICT (email)
       DO UPDATE SET updated_at = now()`,
      [key],
    );
  }
  await writeFileEmail(key);
}

export async function deleteGoogleAccount(email?: string | null): Promise<void> {
  const key = normalizeEmail(email);
  if (!key) return;
  const pg = await ensureTable();
  if (pg) {
    await pg.query(`DELETE FROM google_accounts WHERE email = $1`, [key]);
  }
  try {
    await unlink(filePathFor(key));
  } catch {
    /* missing file is fine */
  }
}

export async function listGoogleAccountFileEmails(): Promise<string[]> {
  let names: string[] = [];
  try {
    names = await readdir(dataDir());
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(
        await readFile(path.join(dataDir(), name), 'utf8'),
      ) as { email?: unknown };
      const email =
        typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
      if (isGoogleMailKey(email)) out.push(email);
    } catch {
      /* skip */
    }
  }
  return out;
}
