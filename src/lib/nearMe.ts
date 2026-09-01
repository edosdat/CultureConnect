/**
 * « Près de moi » — opt-in browser geolocation, tab memory only.
 * Denied / insecure / missing API → Toulouse stays, no error wall.
 * Never writes lat/lng to cookie, JWT, URL, Neon, tastes, cc_signals, profile.communes.
 */

import {
  formatKmLabel,
  haversineKm,
  itemVenueCoords,
  parseLieuCoords,
  type GeoPos,
} from './geo';
import { communeCentroid, sortCoordsForLieu } from './lieuCoords';
import type { DayItem } from './types';

export type { GeoPos };

export const NEAR_ME_CHIP_LABEL = 'Près de moi';
export const TOULOUSE_CHIP_DEFAULT = 'Toulouse';

export type NearMeRequestResult =
  | { ok: true; pos: GeoPos }
  | { ok: false; reason: 'denied' | 'unavailable' | 'insecure' };

export type NearMeUiState = {
  active: boolean;
  pos: GeoPos | null;
  commune: string | null;
};

/** Permission denied / no GPS: keep Toulouse, drop any in-memory pos. */
export function nearMeOnDenied(
  currentCommune: string | null = TOULOUSE_CHIP_DEFAULT,
): NearMeUiState {
  return {
    active: false,
    pos: null,
    commune: currentCommune || TOULOUSE_CHIP_DEFAULT,
  };
}

export function nearMeOnGranted(pos: GeoPos): NearMeUiState {
  return { active: true, pos, commune: null };
}

export function nearMeOnToggleOff(): NearMeUiState {
  return {
    active: false,
    pos: null,
    commune: TOULOUSE_CHIP_DEFAULT,
  };
}

export function resolveNearMeResult(
  result: NearMeRequestResult,
  currentCommune: string | null,
): NearMeUiState {
  if (result.ok) return nearMeOnGranted(result.pos);
  return nearMeOnDenied(currentCommune);
}

/** Secure context (HTTPS / localhost). Never invent a fallback city from GPS. */
export function canUseBrowserGeolocation(
  loc: Pick<Location, 'protocol' | 'hostname'> | null | undefined,
  secureContext: boolean,
): boolean {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
  if (secureContext) return true;
  if (!loc) return false;
  return (
    loc.protocol === 'https:' ||
    loc.hostname === 'localhost' ||
    loc.hostname === '127.0.0.1'
  );
}

export function requestBrowserPosition(): Promise<NearMeRequestResult> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ ok: false, reason: 'unavailable' });
  }
  if (
    !canUseBrowserGeolocation(window.location, window.isSecureContext)
  ) {
    return Promise.resolve({ ok: false, reason: 'insecure' });
  }
  if (!navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: 'unavailable' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          pos: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({ ok: false, reason: 'denied' });
          return;
        }
        resolve({ ok: false, reason: 'unavailable' });
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 0,
      },
    );
  });
}

/** Exact venue coords only — skip label when missing. */
export function itemLabelKm(
  item: { lieu?: { lat?: string | number | null; lng?: string | number | null } | null },
  origin: GeoPos | null | undefined,
): number | null {
  if (!origin) return null;
  const coords = itemVenueCoords(item);
  if (!coords) return null;
  return haversineKm(origin, coords);
}

export function itemKmLabel(
  item: { lieu?: { lat?: string | number | null; lng?: string | number | null } | null },
  origin: GeoPos | null | undefined,
): string | null {
  const km = itemLabelKm(item, origin);
  if (km == null) return null;
  const label = formatKmLabel(km);
  return label || null;
}

/**
 * Sort key: exact lat/lng if present, else commune centroid.
 * Missing both → +∞ (stay after located items).
 */
export function itemSortKm(
  item: {
    lieu?: {
      lieu_id?: string;
      lat?: string | number | null;
      lng?: string | number | null;
      commune?: string | null;
    } | null;
  },
  origin: GeoPos | null | undefined,
): number {
  if (!origin) return Number.POSITIVE_INFINITY;
  const coords = sortCoordsForLieu(item.lieu);
  if (!coords) return Number.POSITIVE_INFINITY;
  return haversineKm(origin, coords);
}

export function sortItemsNearestFirst<T extends { lieu?: DayItem['lieu'] }>(
  items: T[],
  origin: GeoPos | null | undefined,
): T[] {
  if (!origin || items.length < 2) return items;
  return [...items].sort((a, b) => {
    const da = itemSortKm(a, origin);
    const db = itemSortKm(b, origin);
    if (da !== db) return da - db;
    return 0;
  });
}

export function minLabelKm(
  items: Array<{
    lieu?: { lat?: string | number | null; lng?: string | number | null } | null;
  }>,
  origin: GeoPos | null | undefined,
): number | null {
  if (!origin) return null;
  let best: number | null = null;
  for (const item of items) {
    const km = itemLabelKm(item, origin);
    if (km == null) continue;
    if (best == null || km < best) best = km;
  }
  return best;
}

export function minKmLabel(
  items: Array<{
    lieu?: { lat?: string | number | null; lng?: string | number | null } | null;
  }>,
  origin: GeoPos | null | undefined,
): string | null {
  const km = minLabelKm(items, origin);
  if (km == null) return null;
  const label = formatKmLabel(km);
  return label || null;
}

/** Guard: GPS must never become a persistable commune / query / taste field. */
export function assertGpsNotPersisted(payload: Record<string, unknown>): void {
  const banned = ['lat', 'lng', 'latitude', 'longitude', 'coords', 'geoloc'];
  for (const key of banned) {
    if (key in payload && payload[key] != null && payload[key] !== '') {
      throw new Error(`GPS field ${key} must not be persisted`);
    }
  }
}

export { parseLieuCoords, communeCentroid };
