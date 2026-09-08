import { normalizeCommune } from '@/lib/commune';
import type { DayItem } from '@/lib/types';

/** Public card payloads only — no email, no tastes text. sessionStorage. */
export const PROFILE_RECO_CACHE_KEY = 'cc.profileReco.v1';

export type ProfileRecoCacheFile = {
  parisIso: string;
  commune: string;
  /** Drop the file when the published catalogue rotates. */
  catalogueVersion?: string;
  pools: Record<string, DayItem[]>;
};

export function isProfileRecoCacheCurrent(
  parsed: ProfileRecoCacheFile,
  parisIso: string,
  commune: string | null,
  catalogueVersion: string,
): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.parisIso !== parisIso) return false;
  if (normalizeCommune(parsed.commune) !== normalizeCommune(commune)) {
    return false;
  }
  const stored = (parsed.catalogueVersion || '').trim();
  const live = (catalogueVersion || '').trim();
  if (!live || stored !== live) return false;
  return Boolean(parsed.pools && typeof parsed.pools === 'object');
}

/** Drop cards whose keys left the live catalogue (or keep all if the set is empty). */
export function pruneRecoItemsByLiveKeys(
  items: DayItem[],
  liveKeys: Set<string>,
): DayItem[] {
  if (liveKeys.size === 0) return items;
  return items.filter((item) => liveKeys.has(item.key));
}

export function profilePoolsFromFile(
  parsed: ProfileRecoCacheFile,
  liveKeys?: Set<string>,
): Record<string, DayItem[]> {
  const out: Record<string, DayItem[]> = {};
  for (const [key, items] of Object.entries(parsed.pools || {})) {
    if (!key.endsWith('|profile') || !Array.isArray(items)) continue;
    const next = liveKeys
      ? pruneRecoItemsByLiveKeys(items, liveKeys)
      : items;
    if (next.length === 0 && items.length > 0) continue;
    out[key] = next;
  }
  return out;
}

export function readProfileRecoCache(
  parisIso: string,
  commune: string | null,
  catalogueVersion: string,
  liveKeys?: Set<string>,
): Record<string, DayItem[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(PROFILE_RECO_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProfileRecoCacheFile;
    if (!isProfileRecoCacheCurrent(parsed, parisIso, commune, catalogueVersion)) {
      sessionStorage.removeItem(PROFILE_RECO_CACHE_KEY);
      return {};
    }
    return profilePoolsFromFile(parsed, liveKeys);
  } catch {
    return {};
  }
}

export function writeProfileRecoCache(
  parisIso: string,
  commune: string | null,
  catalogueVersion: string,
  pools: Record<string, DayItem[]>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const slim: Record<string, DayItem[]> = {};
    for (const [key, items] of Object.entries(pools)) {
      if (!key.endsWith('|profile') || !Array.isArray(items)) continue;
      slim[key] = items;
    }
    sessionStorage.setItem(
      PROFILE_RECO_CACHE_KEY,
      JSON.stringify({
        parisIso,
        commune: commune ?? '',
        catalogueVersion,
        pools: slim,
      } satisfies ProfileRecoCacheFile),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearProfileRecoCache(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PROFILE_RECO_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
