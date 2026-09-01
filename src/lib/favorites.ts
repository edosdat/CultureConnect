/** Client-side « à voir » — localStorage only. No backend. */

const KEY = 'cc.favorites.v1';

export function readFavoriteKeys(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

export function writeFavoriteKeys(keys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(keys.slice(0, 200)));
  } catch {
    /* quota / private mode */
  }
}
