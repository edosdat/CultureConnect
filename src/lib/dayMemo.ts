/**
 * Same-isolate memo keyed by a Paris day (plus whatever else the caller
 * puts in the key). Next `unstable_cache` recomputes when the browser
 * sends `Cache-Control: no-cache` (hard reload). This map does not.
 * TTL matches the 5 min server cache so a CSV rotate still shows up.
 */

export type DayMemo<T> = {
  get(key: string, nowMs?: number): T | null;
  set(key: string, value: T, nowMs?: number): void;
  clear(): void;
};

export function createDayMemo<T>(opts?: {
  ttlMs?: number;
  max?: number;
}): DayMemo<T> {
  const ttlMs = opts?.ttlMs ?? 300_000;
  const max = Math.max(1, opts?.max ?? 24);
  const map = new Map<string, { value: T; at: number }>();

  return {
    get(key, nowMs = Date.now()) {
      const hit = map.get(key);
      if (!hit) return null;
      if (nowMs - hit.at > ttlMs) {
        map.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key, value, nowMs = Date.now()) {
      if (map.has(key)) map.delete(key);
      map.set(key, { value, at: nowMs });
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    clear() {
      map.clear();
    },
  };
}
