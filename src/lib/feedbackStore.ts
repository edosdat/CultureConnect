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
import { prepareFeedbackImage, type PreparedFeedbackImage } from '@/lib/feedbackImage';
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
      await pg.query(`
        ALTER TABLE feedback_notes ADD COLUMN IF NOT EXISTS image_mime TEXT
      `);
      await pg.query(`
        ALTER TABLE feedback_notes ADD COLUMN IF NOT EXISTS image_bytes BYTEA
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

function hasImageFlag(row: Record<string, unknown>): boolean {
  if (row.has_image === true || row.hasImage === true) return true;
  if (asText(row.image_mime ?? row.imageMime)) return true;
  if (asText(row.image_b64 ?? row.imageB64)) return true;
  return false;
}

function rowFromUnknown(row: Record<string, unknown>): StoredFeedback | null {
  const id = asText(row.id);
  const body = typeof row.body === 'string' ? row.body.trim() : '';
  const kind = feedbackKind(row.kind) ?? (asText(row.kind) ? 'autre' : null);
  const createdAt = asIso(row.created_at ?? row.createdAt);
  const hasImage = hasImageFlag(row);
  if (!id || !kind || !createdAt) return null;
  if (!body && !hasImage) return null;
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
    hasImage,
  };
}

type FileNote = StoredFeedback & {
  imageMime: string | null;
  imageB64: string | null;
};

const NOTE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fileNoteFromUnknown(row: Record<string, unknown>): FileNote | null {
  const base = rowFromUnknown(row);
  if (!base) return null;
  const imageMime = asText(row.image_mime ?? row.imageMime);
  const imageB64 = asText(row.image_b64 ?? row.imageB64);
  const hasImage = Boolean(imageMime && imageB64);
  return { ...base, hasImage, imageMime, imageB64 };
}

async function readFileRows(): Promise<FileNote[]> {
  try {
    const raw = await readFile(storeFile(), 'utf8');
    const parsed = JSON.parse(raw) as { notes?: unknown };
    if (!Array.isArray(parsed.notes)) return [];
    return parsed.notes
      .map((row) =>
        row && typeof row === 'object'
          ? fileNoteFromUnknown(row as Record<string, unknown>)
          : null,
      )
      .filter((row): row is FileNote => Boolean(row));
  } catch {
    return [];
  }
}

async function writeFileRows(rows: FileNote[]): Promise<void> {
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
  /** Raw upload. Stored only after JPEG sniff + EXIF strip. */
  image?: Uint8Array | null;
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
  const hasImage = Boolean(input.image && input.image.byteLength > 0);
  if (!body && !hasImage) throw new Error('avis vide');
  return {
    id: input.id || randomUUID(),
    kind: input.kind,
    body,
    userKey,
    ccVid,
    reply: input.reply?.trim() || null,
    createdAt: input.createdAt || new Date().toISOString(),
    hasImage,
  };
}

function preparedImage(bytes: Uint8Array | null | undefined): PreparedFeedbackImage | null {
  if (!bytes || bytes.byteLength < 1) return null;
  const prepared = prepareFeedbackImage(bytes);
  if ('error' in prepared) throw new Error('image');
  return prepared;
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
  const image = preparedImage(input.image);
  row.hasImage = Boolean(image);
  if (backend() === 'file') {
    const rows = await readFileRows();
    rows.push({
      ...row,
      imageMime: image?.mime ?? null,
      imageB64: image ? Buffer.from(image.bytes).toString('base64') : null,
    });
    await writeFileRows(rows);
    return row;
  }
  const pg = await ensureTable();
  if (!pg) throw new Error('postgres unavailable');
  await pg.query(
    `INSERT INTO feedback_notes
       (id, kind, body, user_key, cc_vid, reply, created_at, image_mime, image_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.id,
      row.kind,
      row.body,
      row.userKey,
      row.ccVid,
      row.reply,
      row.createdAt,
      image?.mime ?? null,
      image ? Buffer.from(image.bytes) : null,
    ],
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
    `SELECT id, kind, body, user_key, cc_vid, reply, created_at,
            (image_bytes IS NOT NULL) AS has_image
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

function asImageBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof value === 'string' && value.startsWith('\\x')) {
    return new Uint8Array(Buffer.from(value.slice(2), 'hex'));
  }
  return null;
}

/** Admin read of one JPEG. Expired rows and everyone else get nothing. */
export async function readFeedbackImageForAdmin(
  id: string,
  now = Date.now(),
): Promise<PreparedFeedbackImage | null> {
  if (!NOTE_ID_RE.test(id)) return null;
  const cutoff = feedbackRetentionCutoff(now);
  if (backend() === 'file') {
    const rows = await readFileRows();
    const row = rows.find((note) => note.id === id && note.createdAt >= cutoff);
    if (!row?.imageB64 || row.imageMime !== 'image/jpeg') return null;
    const prepared = prepareFeedbackImage(new Uint8Array(Buffer.from(row.imageB64, 'base64')));
    if ('error' in prepared) return null;
    return prepared;
  }
  const pg = await ensureTable();
  if (!pg) throw new Error('postgres unavailable');
  const result = await pg.query<{ image_mime: unknown; image_bytes: unknown }>(
    `SELECT image_mime, image_bytes
     FROM feedback_notes
     WHERE id = $1 AND created_at >= $2`,
    [id, cutoff],
  );
  const found = result.rows[0];
  if (!found || asText(found.image_mime) !== 'image/jpeg') return null;
  const bytes = asImageBytes(found.image_bytes);
  if (!bytes) return null;
  const prepared = prepareFeedbackImage(bytes);
  if ('error' in prepared) return null;
  return prepared;
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
