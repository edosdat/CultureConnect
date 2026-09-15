/**
 * Append-only guest signal store (vid only).
 * Prefer Vercel KV / Upstash list; fall back to a stdout JSON line.
 * Never writes Neon `account_tastes` or JWT.
 * Authed Matching A is Neon-only — no analytics mirror of visitor id
 * with account identity.
 */
import {
  GUEST_RATE_LIMIT_PER_HOUR,
  GUEST_SIGNAL_FIFO_CAP,
  IP_RATE_LIMIT_PER_HOUR,
  RATE_WINDOW_MS,
  assertNoVidAccountJoin,
  dailyVidUniquesKey,
  formatAppendLogLine,
  generateVid,
  isValidVid,
  resolveCohort,
  type GuestAppendLine,
  buildGuestAppendLine,
} from '@/lib/guestSignals';
import type { Signal } from '@/lib/signals';
import { parisParts } from '@/lib/timeScope';

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

function hourBucket(now = Date.now()): string {
  return String(Math.floor(now / RATE_WINDOW_MS));
}

const memoryHits = new Map<string, number[]>();

export function resetGuestRateLimitForTests(): void {
  memoryHits.clear();
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

function pipelineCount(entry: unknown): number {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  if (entry && typeof entry === 'object' && 'result' in entry) {
    const n = (entry as { result?: unknown }).result;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return 0;
}

async function kvRateLimited(
  key: string,
  max: number,
): Promise<boolean | null> {
  const bucket = hourBucket();
  const redisKey = `cc:rl:${key}:${bucket}`;
  const rows = await kvPipeline([
    ['INCR', redisKey],
    ['EXPIRE', redisKey, '3600'],
  ]);
  if (!rows) return null;
  return pipelineCount(rows[0]) > max;
}

export async function isSignalRateLimited(opts: {
  ip: string;
  vid?: string | null;
}): Promise<boolean> {
  const ipKey = `ip:${opts.ip || 'unknown'}`;
  const kvIp = await kvRateLimited(ipKey, IP_RATE_LIMIT_PER_HOUR);
  const ipHit = kvIp ?? memoryLimited(ipKey, IP_RATE_LIMIT_PER_HOUR);
  if (ipHit) return true;
  if (!opts.vid) return false;
  const vKey = `v:${opts.vid}`;
  const kvVid = await kvRateLimited(vKey, GUEST_RATE_LIMIT_PER_HOUR);
  return kvVid ?? memoryLimited(vKey, GUEST_RATE_LIMIT_PER_HOUR);
}

async function kvAppend(
  listKey: string,
  line: string,
): Promise<boolean> {
  const rows = await kvPipeline([
    ['LPUSH', listKey, line],
    ['LTRIM', listKey, '0', String(GUEST_SIGNAL_FIFO_CAP - 1)],
  ]);
  return rows !== null;
}

const DAILY_VID_TTL_SEC = 21 * 24 * 60 * 60;

async function indexDailyVid(line: GuestAppendLine): Promise<void> {
  const day = parisParts(new Date(line.ts || Date.now())).iso;
  await kvPipeline([
    ['SADD', dailyVidUniquesKey(day), line.vid],
    ['EXPIRE', dailyVidUniquesKey(day), String(DAILY_VID_TTL_SEC)],
  ]);
}

export async function persistGuestAppend(line: GuestAppendLine): Promise<void> {
  assertNoVidAccountJoin(line);
  const payload = formatAppendLogLine(line);
  const stored = await kvAppend(`cc:vs:${line.vid}`, payload);
  if (!stored) {
    console.log(payload);
    return;
  }
  await indexDailyVid(line);
}

export type GuestCommitOk = {
  ok: true;
  vid: string;
  created: boolean;
};

export type GuestCommitErr = {
  ok: false;
  status: 429;
  error: string;
};

export async function commitGuestSignals(input: {
  signals: Signal[];
  cookieVid?: string | null;
  cohortCookie?: string | null;
  ip: string;
}): Promise<GuestCommitOk | GuestCommitErr> {
  const created = !isValidVid(input.cookieVid);
  const vid = created ? generateVid() : input.cookieVid!;
  if (await isSignalRateLimited({ ip: input.ip, vid })) {
    return { ok: false, status: 429, error: 'Too many requests' };
  }
  const cohort = resolveCohort(input.cohortCookie);
  for (const signal of input.signals) {
    await persistGuestAppend(buildGuestAppendLine({ signal, vid, cohort }));
  }
  return { ok: true, vid, created };
}
