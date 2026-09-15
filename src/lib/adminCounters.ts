/**
 * First-party KV counters for admin analytics.
 * Login counts: no email stored. Daily vid sets live on the guest append path.
 */
import { googleLoginCountKey } from '@/lib/adminAnalytics';
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

function pipelineCount(entry: unknown): number {
  if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
  if (typeof entry === 'string' && /^\d+$/.test(entry)) return Number(entry);
  if (entry && typeof entry === 'object' && 'result' in entry) {
    const n = (entry as { result?: unknown }).result;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    if (typeof n === 'string' && /^\d+$/.test(n)) return Number(n);
  }
  return 0;
}

const LOGIN_TTL_SEC = 40 * 24 * 60 * 60;

/** NextAuth sign-in event — increment only, never store email / vid. */
export async function recordGoogleLogin(now = new Date()): Promise<void> {
  const day = parisParts(now).iso;
  const key = googleLoginCountKey(day);
  try {
    await kvPipeline([
      ['INCR', key],
      ['EXPIRE', key, String(LOGIN_TTL_SEC)],
    ]);
  } catch {
    /* never throw into login */
  }
}

export async function readGoogleLoginCounts(
  days: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (days.length === 0) return out;
  const rows = await kvPipeline(days.map((d) => ['GET', googleLoginCountKey(d)]));
  if (!rows) return out;
  days.forEach((day, i) => {
    out.set(day, pipelineCount(rows[i]));
  });
  return out;
}
