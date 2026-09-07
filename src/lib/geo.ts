/**
 * Crow-flies distance for « Près de moi ».
 * User lat/lng stays in tab memory only — never cookie, JWT, URL, Neon, tastes.
 */

export type GeoPos = { lat: number; lng: number };

/** Place du Capitole — Toulouse fallback when GPS is off (same haversine as Près de moi). */
export const TOULOUSE_ORIGIN: GeoPos = { lat: 43.6045, lng: 1.444 };

const EARTH_KM = 6371;

export function parseCoord(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Venue-level coords only (CSV or attached lookup). Not a commune centroid. */
export function parseLieuCoords(lieu: {
  lat?: string | number | null;
  lng?: string | number | null;
} | null | undefined): GeoPos | null {
  if (!lieu) return null;
  const lat = parseCoord(lieu.lat);
  const lng = parseCoord(lieu.lng);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function haversineKm(a: GeoPos, b: GeoPos): number {
  const dLat = degToRad(b.lat - a.lat);
  const dLng = degToRad(b.lng - a.lng);
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** « 2,3 km » crow-flies. No transit, no minutes. */
export function formatKmLabel(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  const rounded = Math.round(km * 10) / 10;
  const n = rounded === 0 && km > 0 ? 0.1 : rounded;
  const body = Number.isInteger(n)
    ? String(n)
    : n.toFixed(1).replace('.', ',');
  return `${body} km`;
}

export function itemVenueCoords(item: {
  lieu?: { lat?: string | number | null; lng?: string | number | null } | null;
}): GeoPos | null {
  return parseLieuCoords(item.lieu);
}

/** East/north km from `origin` — planar, Toulouse-scale only. */
function toLocalKm(point: GeoPos, origin: GeoPos): { x: number; y: number } {
  const latRad = degToRad((point.lat + origin.lat) / 2);
  return {
    x: (point.lng - origin.lng) * 111.32 * Math.cos(latRad),
    y: (point.lat - origin.lat) * 111.32,
  };
}

/**
 * Project `point` onto segment a→b.
 * `t` is unclamped (0–1 = on the segment). `distKm` uses the clamped foot.
 */
export function projectOnSegment(
  point: GeoPos,
  a: GeoPos,
  b: GeoPos,
): { t: number; distKm: number } {
  const p = toLocalKm(point, a);
  const q = toLocalKm(b, a);
  const len2 = q.x * q.x + q.y * q.y;
  if (len2 < 1e-12) {
    return { t: 0, distKm: haversineKm(point, a) };
  }
  const t = (p.x * q.x + p.y * q.y) / len2;
  const tClamped = Math.max(0, Math.min(1, t));
  const foot: GeoPos = {
    lat: a.lat + tClamped * (b.lat - a.lat),
    lng: a.lng + tClamped * (b.lng - a.lng),
  };
  return { t, distKm: haversineKm(point, foot) };
}

/**
 * Venue lies on the user→cinema walking corridor (projection on the segment
 * and within `halfWidthKm` of that segment). Degenerate when user ≈ cinema.
 */
export function isOnUserCinemaCorridor(
  venue: GeoPos,
  user: GeoPos,
  cinema: GeoPos,
  halfWidthKm: number,
): boolean {
  if (haversineKm(user, cinema) < 1e-3) return false;
  const { t, distKm } = projectOnSegment(venue, user, cinema);
  if (t < 0 || t > 1) return false;
  return distKm <= halfWidthKm;
}
