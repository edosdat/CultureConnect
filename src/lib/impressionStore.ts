/**
 * P2 — Server impression canal (separate from `cc:vs:*` / `cc_signals_v1`).
 * Prefer Vercel KV / Upstash list; fall back to stdout JSON line.
 * Same FIFO cap / retention regime as guest taste appends.
 * Never joins vid with account identity. Never feeds taste scoring.
 */
import {
  assertNoVidAccountJoin,
  generateVid,
  isValidVid,
} from '@/lib/guestSignals';
import { isSignalRateLimited } from '@/lib/guestSignalStore';
import {
  IMPRESSION_FIFO_CAP,
  buildImpressionLine,
  formatImpressionLogLine,
  impressionListKey,
  type ImpressionClientPayload,
  type ImpressionLine,
} from '@/lib/impressions';

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

export async function impressionKvPipeline(
  cmds: string[][],
): Promise<unknown[] | null> {
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

async function kvAppend(listKey: string, line: string): Promise<boolean> {
  const rows = await impressionKvPipeline([
    ['LPUSH', listKey, line],
    ['LTRIM', listKey, '0', String(IMPRESSION_FIFO_CAP - 1)],
  ]);
  return rows !== null;
}

/** Soft TTL aligned with daily vid index (21d) — FIFO is the hard cap. */
const IMPRESSION_LIST_TTL_SEC = 21 * 24 * 60 * 60;

async function touchImpressionTtl(listKey: string): Promise<void> {
  await impressionKvPipeline([
    ['EXPIRE', listKey, String(IMPRESSION_LIST_TTL_SEC)],
  ]);
}

export async function persistImpressionLine(
  line: ImpressionLine,
): Promise<void> {
  assertNoVidAccountJoin(line);
  const payload = formatImpressionLogLine(line);
  const key = impressionListKey(line.vid);
  const stored = await kvAppend(key, payload);
  if (!stored) {
    console.log(payload);
    return;
  }
  await touchImpressionTtl(key);
}

export type ImpressionCommitOk = {
  ok: true;
  vid: string;
  created: boolean;
};

export type ImpressionCommitErr = {
  ok: false;
  status: 429;
  error: string;
};

export async function commitImpression(input: {
  payload: ImpressionClientPayload;
  cookieVid?: string | null;
  ip: string;
}): Promise<ImpressionCommitOk | ImpressionCommitErr> {
  const created = !isValidVid(input.cookieVid);
  const vid = created ? generateVid() : input.cookieVid!;
  if (await isSignalRateLimited({ ip: input.ip, vid })) {
    return { ok: false, status: 429, error: 'Too many requests' };
  }

  const line = buildImpressionLine({
    vid,
    surface: input.payload.surface,
    scope: input.payload.scope,
    itemKeys: input.payload.itemKeys,
    positions: input.payload.positions,
    enteredViewport: input.payload.enteredViewport,
  });
  if (input.payload.ts && Number.isFinite(Date.parse(input.payload.ts))) {
    line.ts = new Date(input.payload.ts).toISOString();
  }
  await persistImpressionLine(line);
  return { ok: true, vid, created };
}
