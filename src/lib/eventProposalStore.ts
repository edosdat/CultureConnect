/**
 * Pending store for « Proposer un spectacle ».
 * Neon `event_proposals` when POSTGRES_URL is set.
 * File fallback only when Postgres is not configured (local / tests).
 * Never writes programme.csv, the live agenda, or account tastes.
 */
import 'server-only';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { VercelPool } from '@vercel/postgres';
import {
  ACTIVE_PROPOSAL_STATUSES,
  matchPreviewOf,
  matchVenueId,
  normalizeProposalOwner,
  parseProposalBody,
  pickProposalMatch,
  proposalDedupeKey,
  proposalPublic,
  proposalRateLimited,
  type CatalogueMatchCandidate,
  type ProposalMatchPreview,
  type ProposalStatus,
  type StoredProposal,
} from './eventProposal';

export type ProposalPublic = ReturnType<typeof proposalPublic>;

export type SubmitProposalResult =
  | { ok: true; body: ProposalPublic }
  | { ok: false; status: 400 | 429 | 503; error: string };

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
  if ((process.env['EVENT_PROPOSAL_STORE'] || '').trim() === 'file') return 'file';
  return postgresUrl() ? 'pg' : 'file';
}

function storeDir(): string {
  return (
    process.env['EVENT_PROPOSAL_STORE_DIR'] ||
    path.join(process.cwd(), '.data', 'event-proposals')
  );
}

function storeFile(): string {
  return path.join(storeDir(), 'proposals.json');
}

let pool: VercelPool | null = null;
let tableReady: Promise<void> | null = null;

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
        CREATE TABLE IF NOT EXISTS event_proposals (
          id TEXT PRIMARY KEY,
          submitter_email TEXT NOT NULL,
          title TEXT NOT NULL,
          venue_name TEXT NOT NULL DEFAULT '',
          venue_id TEXT,
          is_new_venue BOOLEAN NOT NULL DEFAULT false,
          date TEXT,
          time TEXT,
          url_user TEXT,
          url_prog_candidate TEXT,
          status TEXT NOT NULL,
          dedupe_key TEXT NOT NULL,
          match_event_id TEXT,
          match_payload JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pg.query(`
        CREATE INDEX IF NOT EXISTS event_proposals_email_created
          ON event_proposals (submitter_email, created_at DESC)
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
  const s = String(value ?? '').trim();
  return s;
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function parseMatch(value: unknown): ProposalMatchPreview | null {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== 'string' || typeof o.eventId !== 'string') return null;
  return {
    eventId: o.eventId,
    title: o.title,
    venue: typeof o.venue === 'string' ? o.venue : '',
    whenLabel: typeof o.whenLabel === 'string' ? o.whenLabel : '',
    imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : '',
    categoryLabel: typeof o.categoryLabel === 'string' ? o.categoryLabel : '',
  };
}

function rowFromUnknown(row: Record<string, unknown>): StoredProposal | null {
  const id = asText(row.id);
  const email = asText(row.submitter_email ?? row.submitterEmail);
  const title = asText(row.title);
  const status = asText(row.status) as ProposalStatus | null;
  const dedupe = asText(row.dedupe_key ?? row.dedupeKey);
  if (!id || !email || !title || !status || !dedupe) return null;
  const venueId = asText(row.venue_id ?? row.venueId);
  return {
    id,
    submitterEmail: email,
    title,
    venueName: asText(row.venue_name ?? row.venueName) || '',
    venueId,
    isNewVenue: Boolean(row.is_new_venue ?? row.isNewVenue),
    date: asText(row.date),
    time: asText(row.time),
    urlUser: asText(row.url_user ?? row.urlUser),
    urlProgCandidate: asText(row.url_prog_candidate ?? row.urlProgCandidate),
    status,
    dedupeKey: dedupe,
    matchEventId: asText(row.match_event_id ?? row.matchEventId),
    match: parseMatch(row.match_payload ?? row.match),
    createdAt: asIso(row.created_at ?? row.createdAt),
    updatedAt: asIso(row.updated_at ?? row.updatedAt),
  };
}

async function readFileRows(): Promise<StoredProposal[]> {
  try {
    const raw = await readFile(storeFile(), 'utf8');
    const parsed = JSON.parse(raw) as { proposals?: unknown };
    if (!Array.isArray(parsed.proposals)) return [];
    return parsed.proposals
      .map((row) =>
        row && typeof row === 'object'
          ? rowFromUnknown(row as Record<string, unknown>)
          : null,
      )
      .filter((row): row is StoredProposal => Boolean(row));
  } catch {
    return [];
  }
}

async function writeFileRows(rows: StoredProposal[]): Promise<void> {
  await mkdir(storeDir(), { recursive: true });
  await writeFile(
    storeFile(),
    JSON.stringify({ proposals: rows }),
    'utf8',
  );
}

const ACTIVE = new Set<string>(ACTIVE_PROPOSAL_STATUSES);

function findActiveDuplicate(
  rows: readonly StoredProposal[],
  email: string,
  dedupeKey: string,
): StoredProposal | null {
  let found: StoredProposal | null = null;
  for (const row of rows) {
    if (row.submitterEmail !== email) continue;
    if (row.dedupeKey !== dedupeKey) continue;
    if (!ACTIVE.has(row.status)) continue;
    if (!found || row.createdAt > found.createdAt) found = row;
  }
  return found;
}

async function listForEmail(email: string): Promise<StoredProposal[] | null> {
  if (backend() === 'file') {
    const rows = await readFileRows();
    return rows.filter((row) => row.submitterEmail === email);
  }
  try {
    const pg = await ensureTable();
    if (!pg) return null;
    const result = await pg.query(
      `SELECT id, submitter_email, title, venue_name, venue_id, is_new_venue,
              date, time, url_user, url_prog_candidate, status, dedupe_key,
              match_event_id, match_payload, created_at, updated_at
         FROM event_proposals
        WHERE submitter_email = $1`,
      [email],
    );
    return result.rows
      .map((row) => rowFromUnknown(row as Record<string, unknown>))
      .filter((row): row is StoredProposal => Boolean(row));
  } catch {
    return null;
  }
}

async function insertRow(row: StoredProposal): Promise<boolean> {
  if (backend() === 'file') {
    const rows = await readFileRows();
    rows.push(row);
    await writeFileRows(rows);
    return true;
  }
  try {
    const pg = await ensureTable();
    if (!pg) return false;
    await pg.query(
      `INSERT INTO event_proposals (
         id, submitter_email, title, venue_name, venue_id, is_new_venue,
         date, time, url_user, url_prog_candidate, status, dedupe_key,
         match_event_id, match_payload, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13, $14::jsonb, $15::timestamptz, $16::timestamptz
       )`,
      [
        row.id,
        row.submitterEmail,
        row.title,
        row.venueName,
        row.venueId,
        row.isNewVenue,
        row.date,
        row.time,
        row.urlUser,
        row.urlProgCandidate,
        row.status,
        row.dedupeKey,
        row.matchEventId,
        row.match ? JSON.stringify(row.match) : null,
        row.createdAt,
        row.updatedAt,
      ],
    );
    return true;
  } catch {
    return false;
  }
}

async function updateStatus(
  email: string,
  id: string,
  status: ProposalStatus,
  nowIso: string,
): Promise<StoredProposal | null> {
  if (backend() === 'file') {
    const rows = await readFileRows();
    const idx = rows.findIndex(
      (row) => row.id === id && row.submitterEmail === email,
    );
    if (idx < 0) return null;
    const next = { ...rows[idx], status, updatedAt: nowIso };
    rows[idx] = next;
    await writeFileRows(rows);
    return next;
  }
  try {
    const pg = await ensureTable();
    if (!pg) return null;
    const result = await pg.query(
      `UPDATE event_proposals
          SET status = $1, updated_at = $2::timestamptz
        WHERE id = $3 AND submitter_email = $4
        RETURNING id, submitter_email, title, venue_name, venue_id, is_new_venue,
                  date, time, url_user, url_prog_candidate, status, dedupe_key,
                  match_event_id, match_payload, created_at, updated_at`,
      [status, nowIso, id, email],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? rowFromUnknown(row) : null;
  } catch {
    return null;
  }
}

export async function submitEventProposal(
  emailRaw: string,
  body: unknown,
  opts?: {
    now?: Date;
    candidates?: readonly CatalogueMatchCandidate[];
    lieux?: readonly { id: string; name: string }[];
  },
): Promise<SubmitProposalResult> {
  const email = normalizeProposalOwner(emailRaw);
  if (!email) {
    return { ok: false, status: 400, error: 'Email requis' };
  }
  const parsed = parseProposalBody(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const now = opts?.now ?? new Date();
  const dedupeKey = proposalDedupeKey(parsed.value);
  const existingRows = await listForEmail(email);
  if (!existingRows) {
    return { ok: false, status: 503, error: 'Store indisponible' };
  }
  const duplicate = findActiveDuplicate(existingRows, email, dedupeKey);
  if (duplicate) {
    return { ok: true, body: proposalPublic(duplicate, true) };
  }
  const recent = existingRows
    .map((row) => Date.parse(row.createdAt))
    .filter((t) => Number.isFinite(t));
  if (proposalRateLimited(recent, now.getTime())) {
    return {
      ok: false,
      status: 429,
      error: 'Trop de propositions sur 24 h',
    };
  }

  const candidates = opts?.candidates ?? [];
  const found = pickProposalMatch(parsed.value, candidates, now);
  const urlProg = found?.url || null;
  const status: ProposalStatus =
    found && urlProg ? 'matched_candidate' : 'needs_review';
  const venueId =
    found?.venueId ||
    matchVenueId(parsed.value.venueName, opts?.lieux ?? []) ||
    null;
  const stamp = now.toISOString();
  const row: StoredProposal = {
    id: randomUUID(),
    submitterEmail: email,
    title: parsed.value.title,
    venueName: parsed.value.venueName,
    venueId,
    isNewVenue: Boolean(parsed.value.venueName) && !venueId,
    date: parsed.value.date,
    time: parsed.value.time,
    urlUser: parsed.value.urlUser,
    urlProgCandidate: urlProg,
    status,
    dedupeKey,
    matchEventId: found?.eventId || null,
    match: found && urlProg ? matchPreviewOf(found) : null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const wrote = await insertRow(row);
  if (!wrote) return { ok: false, status: 503, error: 'Store indisponible' };
  return { ok: true, body: proposalPublic(row, false) };
}

export async function confirmEventProposal(
  emailRaw: string,
  id: string,
  accept: boolean,
  now = new Date(),
): Promise<
  | { ok: true; body: ProposalPublic }
  | { ok: false; status: 400 | 404 | 503; error: string }
> {
  const email = normalizeProposalOwner(emailRaw);
  const proposalId = id.trim();
  if (!email || !proposalId) {
    return { ok: false, status: 400, error: 'Identifiant requis' };
  }
  const rows = await listForEmail(email);
  if (!rows) return { ok: false, status: 503, error: 'Store indisponible' };
  const current = rows.find((row) => row.id === proposalId);
  if (!current) return { ok: false, status: 404, error: 'Introuvable' };
  if (current.status !== 'matched_candidate') {
    return { ok: true, body: proposalPublic(current, false) };
  }
  const nextStatus: ProposalStatus =
    accept && current.urlProgCandidate ? 'matched_confirmed' : 'needs_review';
  const updated = await updateStatus(
    email,
    proposalId,
    nextStatus,
    now.toISOString(),
  );
  if (!updated) return { ok: false, status: 503, error: 'Store indisponible' };
  return { ok: true, body: proposalPublic(updated, false) };
}

/** Account deletion. Sign-out must not call this. */
export async function deleteEventProposals(emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return;
  try {
    if (backend() === 'file') {
      const rows = await readFileRows();
      await writeFileRows(rows.filter((row) => row.submitterEmail !== email));
      return;
    }
    const pg = await ensureTable();
    if (!pg) return;
    await pg.query(`DELETE FROM event_proposals WHERE submitter_email = $1`, [
      email,
    ]);
  } catch {
    /* account delete must not block on a missing table */
  }
}
