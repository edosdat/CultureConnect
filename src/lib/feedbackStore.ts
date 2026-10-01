/**
 * Avis / idées. Neon `feedback_notes` when POSTGRES_URL is set.
 * File fallback only when Postgres is not configured (local / tests).
 * One actor column: `user_key` (e-mail fingerprint) XOR `cc_vid`. Never both.
 */
import 'server-only';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { VercelPool } from '@vercel/postgres';
import { isValidVid } from '@/lib/guestId';
import {
  FEEDBACK_ADMIN_CAP,
  assertFeedbackActorExclusive,
  feedbackKind,
  feedbackRetentionCutoff,
  feedbackUserKey,
  toAdminFeedbackNote,
  type AdminFeedbackNote,
  type FeedbackKind,
  type StoredFeedback,
} from '@/lib/feedbackNote';

type StoreBackend = 'pg' | 'file';

function postgresUrl(): string | undefined {
  const url = (
    process.env['POSTGRES_URL'] ||
    process.env['POSTGRES_URL_NON_POOLING'] ||
    ''
  ).trim();
  if (!url || url === 'undefined') return undefined;
  return url;
}

function backend(): StoreBackend {
  if ((process.env['FEEDBACK_STORE'] || '').trim() === 'file') return 'file';
  return postgresUrl() ? 'pg' : 'file';
}

function storeDir(): string {
  return (
    process.env['FEEDBACK_STORE_DIR'] ||
    path.join(process.cwd(), '.data', 'feedback-notes')
  );
}

function storeFile(): string {
  return path.join(storeDir(), 'notes.json');
}

let pool: VercelPool | null = null;
let tableReady: Promise<void> | null = null;

export function resetFeedbackStoreForTests(): void {
  pool = null;
  tableReady = null;
}

function getPool(): VercelPool | null {
  const url = postgresUrl();
  if (!url) return null;
  if (!pool) pool = new VercelPool({ connectionString: url });
  return pool;
}

async function ensureTable(): Promise<VercelPool | null> {
  const pg = getPool();
  if (!pg) return null;
  if (!tableReady) {
    tableReady = (async () => {
      await pg.query(`
        CREATE TABLE IF NOT EXISTS feedback_notes (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          body TEXT NOT NULL,
          user_key TEXT,
          cc_vid TEXT,
          reply TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT feedback_notes_actor_xor CHECK (user_key IS NULL OR cc_vid IS NULL)
        )
      `);
      await pg.query(`
        CREATE INDEX IF NOT EXISTS feedback_notes_created
          ON feedback_notes (created_at DESC)
      `);
      await pg.query(`
        CREATE INDEX IF NOT EXISTS feedback_notes_user
          ON feedback_notes (user_key, created_at DESC)
      `);
      await pg.query(`
        CREATE INDEX IF NOT EXISTS feedback_notes_vid
          ON feedback_notes (cc_vid, created_at DESC)
      `);
    })().catch((err: unknown) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
  return pg;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '').trim();
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function rowFromUnknown(row: Record<string, unknown>): StoredFeedback | null {
  const id = asText(row.id);
  const body = asText(row.body);
  const kind = feedbackKind(row.kind) ?? (asText(row.kind) ? 'autre' : null);
  const createdAt = asIso(row.created_at ?? row.createdAt);
  if (!id || !body || !kind || !createdAt) return null;
  const userKey = asText(row.user_key ?? row.userKey);
  const ccVid = asText(row.cc_vid ?? row.ccVid);
  if (userKey && ccVid) return null;
  if (userKey && userKey.includes('@')) return null;
  if (ccVid && !isValidVid(ccVid)) return null;
  return {
    id,
    kind,
    body,
    userKey,
    ccVid,
    reply: asText(row.reply),
    createdAt,
  };
}

async function readFileRows(): Promise<StoredFeedback[]> {
  try {
    const raw = await readFile(storeFile(), 'utf8');
    const parsed = JSON.parse(raw) as { notes?: unknown };
    if (!Array.isArray(parsed.notes)) return [];
    return parsed.notes
      .map((row) =>
        row && typeof row === 'object'
          ? rowFromUnknown(row as Record<string, unknown>)
          : null,
      )
      .filter((row): row is StoredFeedback => Boolean(row));
  } catch {
    return [];
  }
}

async function writeFileRows(rows: StoredFeedback[]): Promise<void> {
  await mkdir(storeDir(), { recursive: true });
  await writeFile(storeFile(), JSON.stringify({ notes: rows }), 'utf8');
}

export type FeedbackInsert = {
  kind: FeedbackKind;
  body: string;
  userKey: string | null;
  ccVid: string | null;
  reply: string | null;
  createdAt?: string;
  id?: string;
};

function normalizeInsert(input: FeedbackInsert): StoredFeedback {
  const userKey = input.userKey?.trim() || null;
  const ccVid = input.ccVid?.trim() || null;
  assertFeedbackActorExclusive({ userKey, ccVid });
  if (userKey && userKey.includes('@')) {
    throw new Error('RGPD: feedback must not store an e-mail');
  }
  if (ccVid && !isValidVid(ccVid)) {
    throw new Error('cc_vid invalide');
  }
  const body = input.body.trim();
  if (!body) throw new Error('avis vide');
  return {
    id: input.id || randomUUID(),
    kind: input.kind,
    body,
    userKey,
    ccVid,
    reply: input.reply?.trim() || null,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

/** Deletes rows older than 90 days. Returns how many rows were removed. */
export async function purgeExpiredFeedback(now = Date.now()): Promise<number> {
  const cutoff = feedbackRetentionCutoff(now);
  if (backend() === 'file') {
    const rows = await readFileRows();
    const kept = rows.filter((row) => row.createdAt >= cutoff);
    const deleted = rows.length - kept.length;
    if (deleted > 0) await writeFileRows(kept);
    return deleted;
  }
  const pg = await ensureTable();
  if (!pg) throw new Error('postgres unavailable');
  const result = await pg.query<{ id: string }>(
    `DELETE FROM feedback_notes WHERE created_at < $1 RETURNING id`,
    [cutoff],
  );
  return result.rows.length;
}

export async function insertFeedbackNote(input: FeedbackInsert): Promise<StoredFeedback> {
  const row = normalizeInsert(input);
  if (backend() === 'file') {
    const rows = await readFileRows();
    rows.push(row);
    await writeFileRows(rows);
    return row;
  }
  const pg = await ensureTable();
  if (!pg) throw new Error('postgres unavailable');
  await pg.query(
    `INSERT INTO feedback_notes (id, kind, body, user_key, cc_vid, reply, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [row.id, row.kind, row.body, row.userKey, row.ccVid, row.reply, row.createdAt],
  );
  return row;
}

export async function countRecentFeedback(
  actor: { userKey: string | null; ccVid: string | null },
  sinceIso: string,
): Promise<number> {
  if (!actor.userKey && !actor.ccVid) return 0;
  assertFeedbackActorExclusive(actor);
  if (backend() === 'file') {
    const rows = await readFileRows();
    return rows.filter((row) => {
      if (row.createdAt < sinceIso) return false;
      if (actor.userKey) return row.userKey === actor.userKey;
      return row.ccVid === actor.ccVid;
    }).length;
  }
  const pg = await ensureTable();
  if (!pg) throw new Error('postgres unavailable');
  const result = await pg.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
     FROM feedback_notes
     WHERE created_at >= $1
       AND (
         ($2::text IS NOT NULL AND user_key = $2)
         OR ($3::text IS NOT NULL AND cc_vid = $3)
       )`,
    [sinceIso, actor.userKey, actor.ccVid],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function listRows(limit: number, now = Date.now()): Promise<StoredFeedback[]> {
  const cutoff = feedbackRetentionCutoff(now);
  const cap = Math.max(1, Math.min(limit, FEEDBACK_ADMIN_CAP));
  if (backend() === 'file') {
    const rows = await readFileRows();
    return rows
      .filter((row) => row.createdAt >= cutoff)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, cap);
  }
  const pg = await ensureTable();
  if (!pg) throw new Error('postgres unavailable');
  const result = await pg.query<Record<string, unknown>>(
    `SELECT id, kind, body, user_key, cc_vid, reply, created_at
     FROM feedback_notes
     WHERE created_at >= $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [cutoff, cap],
  );
  return result.rows
    .map((row) => rowFromUnknown(row))
    .filter((row): row is StoredFeedback => Boolean(row));
}

export async function listFeedbackForAdmin(
  limit = FEEDBACK_ADMIN_CAP,
): Promise<AdminFeedbackNote[]> {
  try {
    await purgeExpiredFeedback();
  } catch {
    /* listing still hides expired rows */
  }
  const rows = await listRows(limit);
  return rows.map(toAdminFeedbackNote);
}

export async function deleteFeedbackForEmail(email?: string | null): Promise<void> {
  const key = feedbackUserKey(email);
  if (!key) return;
  if (backend() === 'file') {
    const rows = await readFileRows();
    await writeFileRows(rows.filter((row) => row.userKey !== key));
    return;
  }
  const pg = await ensureTable();
  if (!pg) return;
  await pg.query(`DELETE FROM feedback_notes WHERE user_key = $1`, [key]);
}
