/**
 * B3 token store + B3b RSVP. KV keys: `share:tok:<token>`,
 * `share:visits:<token>` (cap 500), `share:visitors:<token>`,
 * `share:rsvp:<token>`, `share:rsvp:work:<workId>`.
 * Memory fallback for tests / local.
 * RGPD: never persist cc_vid next to email / emailHash / firstName.
 */
import { createHash } from 'crypto';
import { VercelPool } from '@vercel/postgres';
import { deepLinkUrl } from '@/lib/displayHome';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import {
  assertNoVidAccountJoin,
  fifoAppend,
  RATE_WINDOW_MS,
} from '@/lib/guestSignals';
import {
  generateShareToken,
  isShareToken,
  normalizeSeanceKey,
  shareCreateItemKey,
  SHARE_CREATE_RATE_PER_HOUR,
  SHARE_VISITS_CAP,
} from '@/lib/shareToken';
import {
  applyRsvpToggle,
  assertRsvpRgpd,
  buildTokenSocial,
  isRsvpKind,
  motherStatsFromRsvps,
  parseRsvpRecord,
  RSVP_RATE_PER_HOUR,
  rsvpsForEventStats,
  type RsvpKind,
  type ShareRsvpRecord,
  type TokenSocialPayload,
} from '@/lib/shareRsvp';

export type ShareTokenRecord = {
  token: string;
  itemKey: string;
  seanceKey?: string;
  createdAt: string;
  sharerEmail: string | null;
  opens: number;
};

export type ShareVisitGuest = {
  ts: string;
  token: string;
  vid: string;
};

export type ShareVisitAuthed = {
  ts: string;
  token: string;
  emailHash: string;
};

export type ShareVisitRecord = ShareVisitGuest | ShareVisitAuthed;

type KvConfig = { url: string; token: string };

function kvConfig(): KvConfig | null {
  const env = process.env;
  const url = (
    env['KV_REST_API_URL'] ||
    env['UPSTASH_REDIS_REST_URL'] ||
    ''
  ).trim();
  const token = (
    env['KV_REST_API_TOKEN'] ||
    env['UPSTASH_REDIS_REST_TOKEN'] ||
    ''
  ).trim();
  if (!url || !token || url === 'undefined' || token === 'undefined') {
    return null;
  }
  return { url: url.replace(/\/$/, ''), token };
}

async function kvPipeline(cmds: string[][]): Promise<unknown[] | null> {
  const cfg = kvConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cmds),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function pipelineCount(entry: unknown): number {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  if (entry && typeof entry === 'object' && 'result' in entry) {
    const n = (entry as { result?: unknown }).result;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return 0;
}

function pipelineString(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && 'result' in entry) {
    const r = (entry as { result?: unknown }).result;
    if (typeof r === 'string') return r;
  }
  return null;
}

function hourBucket(now = Date.now()): string {
  return String(Math.floor(now / RATE_WINDOW_MS));
}

const memoryTokens = new Map<string, ShareTokenRecord>();
const memoryVisits = new Map<string, ShareVisitRecord[]>();
const memoryVisitors = new Map<string, Set<string>>();
const memoryRsvps = new Map<string, ShareRsvpRecord[]>();
const memoryHits = new Map<string, number[]>();
const memoryOrphans: string[] = [];

export function resetShareStoreForTests(): void {
  memoryTokens.clear();
  memoryVisits.clear();
  memoryVisitors.clear();
  memoryRsvps.clear();
  memoryHits.clear();
  memoryOrphans.length = 0;
}

export function shareOrphanLogsForTests(): readonly string[] {
  return memoryOrphans;
}

function memoryLimited(key: string, max: number, now = Date.now()): boolean {
  const times = (memoryHits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= max) {
    memoryHits.set(key, times);
    return true;
  }
  times.push(now);
  memoryHits.set(key, times);
  return false;
}

async function kvRateLimited(key: string, max: number): Promise<boolean | null> {
  const redisKey = `share:rl:${key}:${hourBucket()}`;
  const rows = await kvPipeline([
    ['INCR', redisKey],
    ['EXPIRE', redisKey, '3600'],
  ]);
  if (!rows) return null;
  return pipelineCount(rows[0]) > max;
}

export async function isShareCreateRateLimited(opts: {
  ip: string;
  email?: string | null;
}): Promise<boolean> {
  const bucket = (opts.email || '').trim().toLowerCase() || `ip:${opts.ip || 'unknown'}`;
  const kv = await kvRateLimited(bucket, SHARE_CREATE_RATE_PER_HOUR);
  return kv ?? memoryLimited(`create:${bucket}`, SHARE_CREATE_RATE_PER_HOUR);
}

export async function isShareRsvpRateLimited(opts: {
  ip: string;
  email?: string | null;
}): Promise<boolean> {
  const bucket = (opts.email || '').trim().toLowerCase() || `ip:${opts.ip || 'unknown'}`;
  const kv = await kvRateLimited(`rsvp:${bucket}`, RSVP_RATE_PER_HOUR);
  return kv ?? memoryLimited(`rsvp:${bucket}`, RSVP_RATE_PER_HOUR);
}

export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

function postgresUrl(): string | undefined {
  const env = process.env;
  const url = (env['POSTGRES_URL'] || env['POSTGRES_URL_NON_POOLING'] || '').trim();
  if (!url || url === 'undefined') return undefined;
  return url;
}

let pool: VercelPool | null = null;
let tableReady: Promise<void> | null = null;
let rsvpTableReady: Promise<void> | null = null;

function getPool(): VercelPool | null {
  const url = postgresUrl();
  if (!url) return null;
  if (!pool) pool = new VercelPool({ connectionString: url });
  return pool;
}

async function ensureShareTokensTable(): Promise<VercelPool | null> {
  const pg = getPool();
  if (!pg) return null;
  if (!tableReady) {
    tableReady = (async () => {
      await pg.query(`
        CREATE TABLE IF NOT EXISTS share_tokens (
          token TEXT PRIMARY KEY,
          item_key TEXT NOT NULL,
          seance_key TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          sharer_email TEXT,
          opens INTEGER NOT NULL DEFAULT 0
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

async function readShareTokenNeon(token: string): Promise<ShareTokenRecord | null> {
  try {
    const pg = await ensureShareTokensTable();
    if (!pg) return null;
    const result = await pg.query(
      `SELECT token, item_key, seance_key, created_at, sharer_email, opens
       FROM share_tokens WHERE token = $1 LIMIT 1`,
      [token],
    );
    const row = result.rows[0] as
      | {
          token?: string;
          item_key?: string;
          seance_key?: string | null;
          created_at?: Date | string;
          sharer_email?: string | null;
          opens?: number;
        }
      | undefined;
    if (!row) return null;
    const createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : typeof row.created_at === 'string'
          ? row.created_at
          : new Date().toISOString();
    return parseTokenRecord({
      token: row.token,
      itemKey: row.item_key,
      seanceKey: row.seance_key,
      createdAt,
      sharerEmail: row.sharer_email,
      opens: row.opens,
    });
  } catch {
    return null;
  }
}

async function writeShareTokenNeon(record: ShareTokenRecord): Promise<void> {
  try {
    const pg = await ensureShareTokensTable();
    if (!pg) return;
    await pg.query(
      `INSERT INTO share_tokens (token, item_key, seance_key, created_at, sharer_email, opens)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token) DO UPDATE SET
         item_key = EXCLUDED.item_key,
         seance_key = EXCLUDED.seance_key,
         sharer_email = EXCLUDED.sharer_email,
         opens = EXCLUDED.opens`,
      [
        record.token,
        record.itemKey,
        record.seanceKey ?? null,
        record.createdAt,
        record.sharerEmail,
        record.opens,
      ],
    );
  } catch {
    /* preview / local without a writable Neon — KV or memory still used */
  }
}

function tokKey(token: string): string {
  return `share:tok:${token}`;
}
function visitsKey(token: string): string {
  return `share:visits:${token}`;
}
function visitorsKey(token: string): string {
  return `share:visitors:${token}`;
}

function parseTokenRecord(raw: unknown): ShareTokenRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<ShareTokenRecord>;
  if (!isShareToken(o.token) || typeof o.itemKey !== 'string') return null;
  const itemKey = normalizeDeepLinkId(o.itemKey);
  if (!itemKey) return null;
  const seanceKey = normalizeSeanceKey(o.seanceKey);
  const rec: ShareTokenRecord = {
    token: o.token,
    itemKey,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    sharerEmail:
      typeof o.sharerEmail === 'string' && o.sharerEmail.includes('@')
        ? o.sharerEmail.trim().toLowerCase()
        : null,
    opens: typeof o.opens === 'number' && Number.isFinite(o.opens) ? o.opens : 0,
  };
  if (seanceKey) rec.seanceKey = seanceKey;
  return rec;
}

export async function readShareToken(token: string): Promise<ShareTokenRecord | null> {
  if (!isShareToken(token)) return null;
  const mem = memoryTokens.get(token);
  if (mem) return mem;
  const rows = await kvPipeline([['GET', tokKey(token)]]);
  if (rows) {
    const raw = pipelineString(rows[0]);
    if (raw) {
      try {
        const parsed = parseTokenRecord(JSON.parse(raw));
        if (parsed) return parsed;
      } catch {
        /* fall through */
      }
    }
  }
  return readShareTokenNeon(token);
}

async function writeShareToken(record: ShareTokenRecord): Promise<void> {
  memoryTokens.set(record.token, { ...record });
  const payload = JSON.stringify(record);
  await kvPipeline([['SET', tokKey(record.token), payload]]);
  await writeShareTokenNeon(record);
}

export async function createShareToken(opts: {
  itemKey: string;
  seanceKey?: string | null;
  sharerEmail: string | null;
  origin: string;
}): Promise<{ token: string; url: string; seanceKey?: string } | null> {
  const seanceKey = normalizeSeanceKey(opts.seanceKey);
  const itemKey = shareCreateItemKey(opts.itemKey, seanceKey);
  if (!itemKey) return null;
  let token = '';
  for (let i = 0; i < 6; i += 1) {
    const candidate = generateShareToken();
    const existing = await readShareToken(candidate);
    if (!existing) {
      token = candidate;
      break;
    }
  }
  if (!token) return null;
  const record: ShareTokenRecord = {
    token,
    itemKey,
    createdAt: new Date().toISOString(),
    sharerEmail: opts.sharerEmail,
    opens: 0,
  };
  if (seanceKey) record.seanceKey = seanceKey;
  await writeShareToken(record);
  const url = deepLinkUrl(opts.origin, itemKey, token);
  return seanceKey ? { token, url, seanceKey } : { token, url };
}

function visitorIdOf(visit: ShareVisitRecord): string {
  return 'vid' in visit ? visit.vid : visit.emailHash;
}

function assertVisitRgpd(visit: ShareVisitRecord): void {
  if ('vid' in visit) {
    assertNoVidAccountJoin(visit);
    if ('emailHash' in visit) {
      throw new Error('RGPD: cc_vid must not be joined with account identity');
    }
  }
}

export async function recordShareVisit(opts: {
  token: string;
  visit: ShareVisitRecord;
}): Promise<ShareTokenRecord | null> {
  const current = await readShareToken(opts.token);
  if (!current) return null;
  assertVisitRgpd(opts.visit);
  const next: ShareTokenRecord = { ...current, opens: current.opens + 1 };
  await writeShareToken(next);

  const line = JSON.stringify(opts.visit);
  const vid = visitorIdOf(opts.visit);
  const kv = await kvPipeline([
    ['LPUSH', visitsKey(opts.token), line],
    ['LTRIM', visitsKey(opts.token), '0', String(SHARE_VISITS_CAP - 1)],
    ['SADD', visitorsKey(opts.token), vid],
  ]);
  if (!kv) {
    const prev = memoryVisits.get(opts.token) ?? [];
    memoryVisits.set(
      opts.token,
      fifoAppend(prev, opts.visit, SHARE_VISITS_CAP),
    );
    const set = memoryVisitors.get(opts.token) ?? new Set<string>();
    set.add(vid);
    memoryVisitors.set(opts.token, set);
  }
  return next;
}

export function logShareOrphan(token: string): void {
  const line = JSON.stringify({
    kind: 'share_orphan',
    token: isShareToken(token) ? token : 'invalid',
    ts: new Date().toISOString(),
  });
  memoryOrphans.push(line);
  console.log(line);
}

export function memoryVisitCount(token: string): number {
  return memoryVisits.get(token)?.length ?? 0;
}

export function memoryVisitorCount(token: string): number {
  return memoryVisitors.get(token)?.size ?? 0;
}

function rsvpTokKey(token: string): string {
  return `share:rsvp:${token}`;
}
function rsvpWorkKey(workId: string): string {
  return `share:rsvp:work:${workId}`;
}

async function readWorkRsvpsKv(workId: string): Promise<ShareRsvpRecord[] | null> {
  const rows = await kvPipeline([['GET', rsvpWorkKey(workId)]]);
  if (!rows) return null;
  const raw = pipelineString(rows[0]);
  if (!raw) return [];
  try {
    return parseRsvpList(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function upsertWorkIndex(opts: {
  workId: string;
  token: string;
  emailHash: string;
  record: ShareRsvpRecord | null;
}): Promise<void> {
  const current = (await readWorkRsvpsKv(opts.workId)) ?? [];
  const rest = current.filter(
    (r) => !(r.token === opts.token && r.emailHash === opts.emailHash),
  );
  const next = opts.record ? [...rest, opts.record] : rest;
  await kvPipeline([['SET', rsvpWorkKey(opts.workId), JSON.stringify(next)]]);
}

async function ensureShareRsvpsTable(): Promise<VercelPool | null> {
  const pg = getPool();
  if (!pg) return null;
  if (!rsvpTableReady) {
    rsvpTableReady = (async () => {
      await pg.query(`
        CREATE TABLE IF NOT EXISTS share_rsvps (
          token TEXT NOT NULL,
          email_hash TEXT NOT NULL,
          item_key TEXT NOT NULL,
          work_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          first_name TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (token, email_hash)
        )
      `);
      await pg.query(
        `CREATE INDEX IF NOT EXISTS share_rsvps_work_idx ON share_rsvps (work_id)`,
      );
      await pg.query(
        `CREATE INDEX IF NOT EXISTS share_rsvps_item_idx ON share_rsvps (item_key)`,
      );
    })().catch((err: unknown) => {
      rsvpTableReady = null;
      throw err;
    });
  }
  await rsvpTableReady;
  return pg;
}

function parseRsvpList(raw: unknown): ShareRsvpRecord[] {
  if (Array.isArray(raw)) {
    return raw.map(parseRsvpRecord).filter((r): r is ShareRsvpRecord => Boolean(r));
  }
  if (raw && typeof raw === 'object') {
    return Object.values(raw as Record<string, unknown>)
      .map(parseRsvpRecord)
      .filter((r): r is ShareRsvpRecord => Boolean(r));
  }
  return [];
}

async function readTokenRsvpsNeon(token: string): Promise<ShareRsvpRecord[] | null> {
  try {
    const pg = await ensureShareRsvpsTable();
    if (!pg) return null;
    const result = await pg.query(
      `SELECT token, email_hash, item_key, work_id, kind, first_name, updated_at
       FROM share_rsvps WHERE token = $1`,
      [token],
    );
    return result.rows
      .map((row: {
        token?: string;
        email_hash?: string;
        item_key?: string;
        work_id?: string;
        kind?: string;
        first_name?: string;
        updated_at?: Date | string;
      }) =>
        parseRsvpRecord({
          token: row.token,
          emailHash: row.email_hash,
          itemKey: row.item_key,
          workId: row.work_id,
          kind: row.kind,
          firstName: row.first_name,
          ts:
            row.updated_at instanceof Date
              ? row.updated_at.toISOString()
              : row.updated_at,
        }),
      )
      .filter((r: ShareRsvpRecord | null): r is ShareRsvpRecord => Boolean(r));
  } catch {
    return null;
  }
}

async function writeTokenRsvpsNeon(
  token: string,
  rsvps: ShareRsvpRecord[],
): Promise<void> {
  try {
    const pg = await ensureShareRsvpsTable();
    if (!pg) return;
    await pg.query(`DELETE FROM share_rsvps WHERE token = $1`, [token]);
    for (const r of rsvps) {
      await pg.query(
        `INSERT INTO share_rsvps
          (token, email_hash, item_key, work_id, kind, first_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [r.token, r.emailHash, r.itemKey, r.workId, r.kind, r.firstName, r.ts],
      );
    }
  } catch {
    /* preview / local without writable Neon */
  }
}

async function readEventRsvpsNeon(opts: {
  itemKey: string;
  workId: string;
}): Promise<ShareRsvpRecord[] | null> {
  try {
    const pg = await ensureShareRsvpsTable();
    if (!pg) return null;
    const result = await pg.query(
      `SELECT token, email_hash, item_key, work_id, kind, first_name, updated_at
       FROM share_rsvps WHERE work_id = $1 OR item_key = $2`,
      [opts.workId, opts.itemKey],
    );
    return result.rows
      .map((row: {
        token?: string;
        email_hash?: string;
        item_key?: string;
        work_id?: string;
        kind?: string;
        first_name?: string;
        updated_at?: Date | string;
      }) =>
        parseRsvpRecord({
          token: row.token,
          emailHash: row.email_hash,
          itemKey: row.item_key,
          workId: row.work_id,
          kind: row.kind,
          firstName: row.first_name,
          ts:
            row.updated_at instanceof Date
              ? row.updated_at.toISOString()
              : row.updated_at,
        }),
      )
      .filter((r: ShareRsvpRecord | null): r is ShareRsvpRecord => Boolean(r));
  } catch {
    return null;
  }
}

export async function listTokenRsvps(token: string): Promise<ShareRsvpRecord[]> {
  if (!isShareToken(token)) return [];
  const mem = memoryRsvps.get(token);
  if (mem) return mem.map((r) => ({ ...r }));
  const rows = await kvPipeline([['GET', rsvpTokKey(token)]]);
  if (rows) {
    const raw = pipelineString(rows[0]);
    if (raw) {
      try {
        return parseRsvpList(JSON.parse(raw));
      } catch {
        /* fall through */
      }
    }
  }
  return (await readTokenRsvpsNeon(token)) ?? [];
}

async function writeTokenRsvps(
  token: string,
  rsvps: ShareRsvpRecord[],
): Promise<void> {
  for (const r of rsvps) assertRsvpRgpd(r);
  memoryRsvps.set(token, rsvps.map((r) => ({ ...r })));
  await kvPipeline([['SET', rsvpTokKey(token), JSON.stringify(rsvps)]]);
  await writeTokenRsvpsNeon(token, rsvps);
}

export async function toggleShareRsvp(opts: {
  token: string;
  itemKey: string;
  workId: string;
  emailHash: string;
  firstName: string;
  kind: RsvpKind;
}): Promise<{
  kind: RsvpKind | null;
  rsvps: ShareRsvpRecord[];
}> {
  if (!isShareToken(opts.token) || !isRsvpKind(opts.kind)) {
    return { kind: null, rsvps: [] };
  }
  const tokenRec = await readShareToken(opts.token);
  if (!tokenRec) return { kind: null, rsvps: [] };
  const itemKey = tokenRec.itemKey || opts.itemKey;
  const workId = opts.workId || itemKey;
  const current = await listTokenRsvps(opts.token);
  const existing = current.find((r) => r.emailHash === opts.emailHash) ?? null;
  const nextKind = applyRsvpToggle(existing?.kind ?? null, opts.kind);
  const rest = current.filter((r) => r.emailHash !== opts.emailHash);
  let next = rest;
  if (nextKind) {
    const record: ShareRsvpRecord = {
      token: opts.token,
      itemKey,
      workId,
      emailHash: opts.emailHash,
      firstName: opts.firstName,
      kind: nextKind,
      ts: new Date().toISOString(),
    };
    assertRsvpRgpd(record);
    next = [...rest, record];
  }
  await writeTokenRsvps(opts.token, next);
  const written = next.find((r) => r.emailHash === opts.emailHash) ?? null;
  await upsertWorkIndex({
    workId,
    token: opts.token,
    emailHash: opts.emailHash,
    record: written,
  });
  if (itemKey !== workId) {
    await upsertWorkIndex({
      workId: itemKey,
      token: opts.token,
      emailHash: opts.emailHash,
      record: written,
    });
  }
  return { kind: nextKind, rsvps: next };
}

export async function tokenSocialPayload(opts: {
  token: string;
  viewerEmailHash: string | null;
}): Promise<TokenSocialPayload | null> {
  const tokenRec = await readShareToken(opts.token);
  if (!tokenRec) return null;
  const rsvps = await listTokenRsvps(opts.token);
  return buildTokenSocial({
    rsvps,
    viewerEmailHash: opts.viewerEmailHash,
  });
}

export async function eventRsvpStats(opts: {
  itemKey: string;
  workId: string;
}): Promise<{ envie: number; going: number }> {
  const collected: ShareRsvpRecord[] = [];
  for (const list of memoryRsvps.values()) {
    collected.push(...list);
  }
  if (collected.length > 0) {
    return motherStatsFromRsvps(rsvpsForEventStats(collected, opts));
  }
  const neon = await readEventRsvpsNeon(opts);
  if (neon && neon.length > 0) return motherStatsFromRsvps(neon);
  const fromWork = await readWorkRsvpsKv(opts.workId);
  const fromItem =
    opts.itemKey !== opts.workId ? await readWorkRsvpsKv(opts.itemKey) : null;
  const kv = [...(fromWork ?? []), ...(fromItem ?? [])];
  if (kv.length > 0) return motherStatsFromRsvps(kv);
  if (neon) return motherStatsFromRsvps(neon);
  return { envie: 0, going: 0 };
}

export function memoryRsvpCount(token: string): number {
  return memoryRsvps.get(token)?.length ?? 0;
}

export function memoryAllRsvps(): ShareRsvpRecord[] {
  return [...memoryRsvps.values()].flat().map((r) => ({ ...r }));
}
