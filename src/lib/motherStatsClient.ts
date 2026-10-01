/**
 * Mother RSVP stats — coalesce N carousel/fiche mounts into one POST.
 * Cold home mounts ~5 ShareSocial heroes; unbatched Neon GETs cascade 2–10s.
 */
import { isRsvpKind, type RsvpKind } from '@/lib/shareRsvp';

export type MotherStatsPayload = {
  envie: number;
  going: number;
  mine: RsvpKind | null;
};

type Waiter = {
  resolve: (v: MotherStatsPayload) => void;
  reject: (e: unknown) => void;
};

const BATCH_PATH = '/api/share/event/stats';
const MAX_BATCH = 24;
const cache = new Map<string, MotherStatsPayload>();
const inflight = new Map<string, Promise<MotherStatsPayload>>();
const queue = new Map<string, Waiter[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function emptyPayload(): MotherStatsPayload {
  return { envie: 0, going: 0, mine: null };
}

export function parseMotherStatsPayload(data: unknown): MotherStatsPayload {
  if (!data || typeof data !== 'object') return emptyPayload();
  const o = data as Record<string, unknown>;
  const envie =
    typeof o.envie === 'number' && Number.isFinite(o.envie)
      ? Math.max(0, Math.floor(o.envie))
      : 0;
  const going =
    typeof o.going === 'number' && Number.isFinite(o.going)
      ? Math.max(0, Math.floor(o.going))
      : 0;
  const mine = isRsvpKind(o.mine) ? o.mine : null;
  return { envie, going, mine };
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, 0);
}

async function flushQueue(): Promise<void> {
  while (queue.size > 0) {
    const keys = [...queue.keys()].slice(0, MAX_BATCH);
    const waitersByKey = new Map<string, Waiter[]>();
    for (const key of keys) {
      waitersByKey.set(key, queue.get(key) || []);
      queue.delete(key);
    }
    try {
      const res = await fetch(BATCH_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ keys }),
      });
      const body: unknown = res.ok ? await res.json() : null;
      const results =
        body &&
        typeof body === 'object' &&
        'results' in body &&
        (body as { results?: unknown }).results &&
        typeof (body as { results: unknown }).results === 'object'
          ? ((body as { results: Record<string, unknown> }).results)
          : {};
      for (const key of keys) {
        const parsed = parseMotherStatsPayload(results[key]);
        cache.set(key, parsed);
        for (const w of waitersByKey.get(key) || []) w.resolve(parsed);
      }
    } catch (err) {
      for (const key of keys) {
        for (const w of waitersByKey.get(key) || []) w.reject(err);
      }
    }
  }
}

/**
 * Batched mother stats. Same-tick mounts share one POST.
 * Short-lived cache avoids remount storms while carousels settle.
 */
export function fetchMotherStats(itemKey: string): Promise<MotherStatsPayload> {
  const key = (itemKey || '').trim();
  if (!key) return Promise.resolve(emptyPayload());
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = new Promise<MotherStatsPayload>((resolve, reject) => {
    const list = queue.get(key) || [];
    list.push({ resolve, reject });
    queue.set(key, list);
    scheduleFlush();
  }).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/** After a successful toggle — keep cache warm for remounts. */
export function rememberMotherStats(
  itemKey: string,
  payload: MotherStatsPayload,
): void {
  const key = (itemKey || '').trim();
  if (!key) return;
  cache.set(key, payload);
}

/** Test helper. */
export function resetMotherStatsClientForTests(): void {
  cache.clear();
  inflight.clear();
  queue.clear();
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
