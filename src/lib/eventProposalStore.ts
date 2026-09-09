/**
 * Neon `event_proposals` — separate from catalogue.
 * Same pattern as accountTasteStore / mailConsentStore:
 * CREATE TABLE IF NOT EXISTS + file fallback when POSTGRES_URL is unset.
 */
import 'server-only';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { VercelPool } from '@vercel/postgres';
import {
  ACTIVE_PROPOSAL_STATUSES,
  isActiveProposalStatus,
  isEventProposalStatus,
  rateWindowStartMs,
  type EventProposal,
} from '@/lib/eventProposal';

function dataDir(): string {
  return (
    process.env['EVENT_PROPOSAL_STORE_DIR'] ||
    path.join(process.cwd(), '.data', 'event-proposals')
  );
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
        CREATE TABLE IF NOT EXISTS event_proposals (
          id UUID PRIMARY KEY,
          submitter_email TEXT NOT NULL,
          title TEXT NOT NULL,
          venue_name TEXT NOT NULL,
          venue_id TEXT,
          is_new_venue BOOLEAN NOT NULL DEFAULT true,
          date DATE NOT NULL,
          time TEXT,
          url_user TEXT,
          url_prog_candidate TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          dedupe_key TEXT NOT NULL,
          match_event_id TEXT,
          user_note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pg.query(`
        CREATE INDEX IF NOT EXISTS event_proposals_email_created_idx
          ON event_proposals (submitter_email, created_at DESC)
      `);
      await pg.query(`
        CREATE INDEX IF NOT EXISTS event_proposals_dedupe_idx
          ON event_proposals (submitter_email, dedupe_key)
      `);
    })().catch((err: unknown) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
  return pg;
}

type PgRow = {
  id: string;
  submitter_email: string;
  title: string;
  venue_name: string;
  venue_id: string | null;
  is_new_venue: boolean;
  date: Date | string;
  time: string | null;
  url_user: string | null;
  url_prog_candidate: string | null;
  status: string;
  dedupe_key: string;
  match_event_id: string | null;
  user_note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function isoDate(value: Date | string): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function isoStamp(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? new Date(t).toISOString() : String(value);
}

function fromPg(row: PgRow): EventProposal | null {
  if (!isEventProposalStatus(row.status)) return null;
  return {
    id: String(row.id),
    submitter_email: String(row.submitter_email),
    title: String(row.title),
    venue_name: String(row.venue_name),
    venue_id: row.venue_id ? String(row.venue_id) : null,
    is_new_venue: Boolean(row.is_new_venue),
    date: isoDate(row.date),
    time: row.time ? String(row.time) : null,
    url_user: row.url_user ? String(row.url_user) : null,
    url_prog_candidate: row.url_prog_candidate
      ? String(row.url_prog_candidate)
      : null,
    status: row.status,
    dedupe_key: String(row.dedupe_key),
    match_event_id: row.match_event_id ? String(row.match_event_id) : null,
    user_note: row.user_note ? String(row.user_note) : null,
    created_at: isoStamp(row.created_at),
    updated_at: isoStamp(row.updated_at),
  };
}

function parseStored(raw: unknown): EventProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<EventProposal>;
  if (
    typeof o.id !== 'string' ||
    typeof o.submitter_email !== 'string' ||
    typeof o.title !== 'string' ||
    typeof o.venue_name !== 'string' ||
    typeof o.date !== 'string' ||
    typeof o.dedupe_key !== 'string' ||
    typeof o.status !== 'string' ||
    !isEventProposalStatus(o.status)
  ) {
    return null;
  }
  return {
    id: o.id,
    submitter_email: o.submitter_email,
    title: o.title,
    venue_name: o.venue_name,
    venue_id: o.venue_id ?? null,
    is_new_venue: Boolean(o.is_new_venue),
    date: o.date,
    time: o.time ?? null,
    url_user: o.url_user ?? null,
    url_prog_candidate: o.url_prog_candidate ?? null,
    status: o.status,
    dedupe_key: o.dedupe_key,
    match_event_id: o.match_event_id ?? null,
    user_note: o.user_note ?? null,
    created_at: o.created_at || new Date().toISOString(),
    updated_at: o.updated_at || new Date().toISOString(),
  };
}

async function listFiles(): Promise<EventProposal[]> {
  try {
    const dir = dataDir();
    const names = await readdir(dir);
    const rows: EventProposal[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
        const row = parseStored(raw);
        if (row) rows.push(row);
      } catch {
        /* skip bad file */
      }
    }
    return rows;
  } catch {
    return [];
  }
}

async function writeFileRow(row: EventProposal): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(
      path.join(dataDir(), `${row.id}.json`),
      JSON.stringify(row),
      'utf8',
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') return;
  }
}

export type NewProposal = Omit<EventProposal, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export async function insertEventProposal(input: NewProposal): Promise<EventProposal> {
  const now = new Date().toISOString();
  const row: EventProposal = {
    ...input,
    id: input.id || randomUUID(),
    created_at: now,
    updated_at: now,
  };
  const pg = await ensureTable();
  if (pg) {
    await pg.query(
      `INSERT INTO event_proposals (
         id, submitter_email, title, venue_name, venue_id, is_new_venue,
         date, time, url_user, url_prog_candidate, status, dedupe_key,
         match_event_id, user_note, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7::date, $8, $9, $10, $11, $12,
         $13, $14, now(), now()
       )`,
      [
        row.id,
        row.submitter_email,
        row.title,
        row.venue_name,
        row.venue_id,
        row.is_new_venue,
        row.date,
        row.time,
        row.url_user,
        row.url_prog_candidate,
        row.status,
        row.dedupe_key,
        row.match_event_id,
        row.user_note,
      ],
    );
  }
  await writeFileRow(row);
  return row;
}

export async function updateEventProposal(
  id: string,
  patch: Partial<
    Pick<
      EventProposal,
      | 'status'
      | 'url_prog_candidate'
      | 'match_event_id'
      | 'updated_at'
    >
  >,
): Promise<EventProposal | null> {
  const current = await getEventProposal(id);
  if (!current) return null;
  const next: EventProposal = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const pg = await ensureTable();
  if (pg) {
    await pg.query(
      `UPDATE event_proposals
          SET status = $2,
              url_prog_candidate = $3,
              match_event_id = $4,
              updated_at = now()
        WHERE id = $1`,
      [id, next.status, next.url_prog_candidate, next.match_event_id],
    );
  }
  await writeFileRow(next);
  return next;
}

export async function getEventProposal(id: string): Promise<EventProposal | null> {
  const pg = await ensureTable();
  if (pg) {
    const result = await pg.query(
      `SELECT * FROM event_proposals WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = result.rows[0] as PgRow | undefined;
    return row ? fromPg(row) : null;
  }
  const files = await listFiles();
  return files.find((r) => r.id === id) ?? null;
}

export async function findActiveByDedupe(
  email: string,
  dedupeKey: string,
): Promise<EventProposal | null> {
  const pg = await ensureTable();
  if (pg) {
    const result = await pg.query(
      `SELECT * FROM event_proposals
        WHERE submitter_email = $1
          AND dedupe_key = $2
          AND status = ANY($3::text[])
        ORDER BY created_at DESC
        LIMIT 1`,
      [email, dedupeKey, [...ACTIVE_PROPOSAL_STATUSES]],
    );
    const row = result.rows[0] as PgRow | undefined;
    return row ? fromPg(row) : null;
  }
  const files = await listFiles();
  return (
    files
      .filter(
        (r) =>
          r.submitter_email === email &&
          r.dedupe_key === dedupeKey &&
          isActiveProposalStatus(r.status),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

export async function countProposalsSince(
  email: string,
  sinceMs: number = rateWindowStartMs(),
): Promise<number> {
  const sinceIso = new Date(sinceMs).toISOString();
  const pg = await ensureTable();
  if (pg) {
    const result = await pg.query(
      `SELECT COUNT(*)::int AS n
         FROM event_proposals
        WHERE submitter_email = $1
          AND created_at >= $2::timestamptz`,
      [email, sinceIso],
    );
    const n = (result.rows[0] as { n?: number } | undefined)?.n;
    return typeof n === 'number' ? n : 0;
  }
  const files = await listFiles();
  return files.filter(
    (r) =>
      r.submitter_email === email && Date.parse(r.created_at) >= sinceMs,
  ).length;
}

export async function listMineProposals(
  email: string,
  limit = 20,
): Promise<EventProposal[]> {
  const pg = await ensureTable();
  if (pg) {
    const result = await pg.query(
      `SELECT * FROM event_proposals
        WHERE submitter_email = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [email, limit],
    );
    return (result.rows as PgRow[])
      .map((r) => fromPg(r))
      .filter((r): r is EventProposal => Boolean(r));
  }
  const files = await listFiles();
  return files
    .filter((r) => r.submitter_email === email)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}
