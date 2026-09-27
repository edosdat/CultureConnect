/**
 * Neon `account_tastes` admin list — no `server-only`, so the real30 CLI
 * can reuse the same query as KPI 18 (`listAccountTastesForAdmin`).
 * Never joins cc_vid. Does not write `data/`.
 */
import { VercelPool } from '@vercel/postgres';
import { cloneTasteStateAsIs } from './real30Export';
import { parseTasteState, type AccountTasteState } from './signals';

export type AccountTasteAdminRow = {
  userKey: string;
  state: AccountTasteState;
  updatedAt?: string;
};

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

async function ensureAccountTastesTable(): Promise<VercelPool | null> {
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
    })().catch((err: unknown) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
  return pg;
}

function parseRowState(raw: unknown, asIs: boolean): AccountTasteState | null {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (asIs) {
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as AccountTasteState;
    if (!o.profile || typeof o.profile !== 'object') return null;
    return cloneTasteStateAsIs(o);
  }
  return parseTasteState(parsed);
}

/**
 * Admin analytics — all persisted comptes. Same SQL as the #140 store.
 * `asIs: true` keeps weights/pcts (real30 bench); default sanitizes like KPI 18.
 */
export async function listAccountTastesForAdmin(
  limit = 2000,
  opts?: { asIs?: boolean },
): Promise<AccountTasteAdminRow[]> {
  try {
    const pg = await ensureAccountTastesTable();
    if (!pg) return [];
    const cap = Math.max(1, Math.min(2000, Math.floor(limit)));
    const result = await pg.query(
      `SELECT user_key, state, updated_at
       FROM account_tastes
       ORDER BY updated_at ASC
       LIMIT $1`,
      [cap],
    );
    const asIs = opts?.asIs === true;
    const out: AccountTasteAdminRow[] = [];
    for (const row of result.rows as Array<{
      user_key?: unknown;
      state?: unknown;
      updated_at?: Date | string;
    }>) {
      const userKey =
        typeof row.user_key === 'string' ? row.user_key.trim().toLowerCase() : '';
      if (!userKey) continue;
      const parsed = parseRowState(row.state, asIs);
      if (!parsed) continue;
      const updatedAt =
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at
            ? String(row.updated_at)
            : undefined;
      out.push({ userKey, state: parsed, updatedAt });
    }
    return out;
  } catch {
    return [];
  }
}
