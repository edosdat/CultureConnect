/**
 * Optional venue lat/lng overlay. CSV weekly replace may only have
 * commune + dist_km_capitole — GPS sort still runs when coords exist.
 * Commune centroids are for sort only; never shown as a km label.
 */

import type { Lieu } from './types';
import { parseLieuCoords, type GeoPos } from './geo';

/** INSEE-ish commune centroids — sort fallback, never a card label. */
const COMMUNE_CENTROID: Record<string, GeoPos> = {
  toulouse: { lat: 43.6045, lng: 1.444 },
  blagnac: { lat: 43.6361, lng: 1.3939 },
  'ramonville-saint-agne': { lat: 43.5461, lng: 1.4761 },
  colomiers: { lat: 43.6106, lng: 1.3367 },
  tournefeuille: { lat: 43.5889, lng: 1.3192 },
  balma: { lat: 43.6111, lng: 1.4994 },
  'castanet-tolosan': { lat: 43.5167, lng: 1.4986 },
  fenouillet: { lat: 43.6803, lng: 1.3947 },
  cornebarrieu: { lat: 43.6506, lng: 1.3264 },
  labège: { lat: 43.53, lng: 1.5314 },
  labege: { lat: 43.53, lng: 1.5314 },
  aussonne: { lat: 43.6833, lng: 1.3167 },
  'l’union': { lat: 43.6561, lng: 1.4847 },
  "l'union": { lat: 43.6561, lng: 1.4847 },
  'lacroix-falgarde': { lat: 43.5, lng: 1.4333 },
  'plaisance-du-touch': { lat: 43.5667, lng: 1.3 },
  castelginest: { lat: 43.6936, lng: 1.4331 },
  muret: { lat: 43.4611, lng: 1.3267 },
  poucharramet: { lat: 43.4167, lng: 1.1667 },
  'lasserre-pradère': { lat: 43.6333, lng: 1.1833 },
  'lasserre-pradere': { lat: 43.6333, lng: 1.1833 },
  pechbonnieu: { lat: 43.7, lng: 1.4667 },
  'buzet-sur-tarn': { lat: 43.7833, lng: 1.5833 },
};

/** Well-known salles — labels only when these (or CSV lat/lng) exist. */
const LIEU_EXACT: Record<string, GeoPos> = {
  L040: { lat: 43.60426, lng: 1.44367 },
  L041: { lat: 43.5997, lng: 1.4439 },
  L044: { lat: 43.5994, lng: 1.4528 },
  L050: { lat: 43.5962, lng: 1.4312 },
  L057: { lat: 43.5792, lng: 1.4498 },
  L061: { lat: 43.6117, lng: 1.4544 },
  L062: { lat: 43.6365, lng: 1.3905 },
  L070: { lat: 43.6008, lng: 1.4533 },
  L071: { lat: 43.6065, lng: 1.443 },
  L079: { lat: 43.5944, lng: 1.3808 },
  L082: { lat: 43.638, lng: 1.435 },
  L083: { lat: 43.5514, lng: 1.4864 },
  L084: { lat: 43.589, lng: 1.327 },
  L085: { lat: 43.668, lng: 1.363 },
  L123: { lat: 43.6006, lng: 1.4297 },
  L125: { lat: 43.6378, lng: 1.4522 },
  L126: { lat: 43.585, lng: 1.327 },
  L127: { lat: 43.6075, lng: 1.4433 },
  L128: { lat: 43.5925, lng: 1.4458 },
  L130: { lat: 43.5728, lng: 1.4869 },
  L131: { lat: 43.6058, lng: 1.4436 },
  L132: { lat: 43.629, lng: 1.367 },
  L137: { lat: 43.6045, lng: 1.4472 },
  L138: { lat: 43.5486, lng: 1.5069 },
  L139: { lat: 43.636, lng: 1.375 },
  L140: { lat: 43.676, lng: 1.393 },
  L141: { lat: 43.6033, lng: 1.4464 },
  L142: { lat: 43.573, lng: 1.486 },
  L143: { lat: 43.546, lng: 1.476 },
  L144: { lat: 43.608, lng: 1.328 },
  L145: { lat: 43.566, lng: 1.297 },
  L146: { lat: 43.694, lng: 1.433 },
  L147: { lat: 43.461, lng: 1.327 },
  L148: { lat: 43.517, lng: 1.499 },
  L149: { lat: 43.591, lng: 1.455 },
  L150: { lat: 43.546, lng: 1.476 },
  L151: { lat: 43.5995, lng: 1.4418 },
  L152: { lat: 43.4167, lng: 1.1667 },
};

function normCommune(c: string | null | undefined): string {
  return (c || '').trim().toLocaleLowerCase('fr');
}

export function communeCentroid(
  commune: string | null | undefined,
): GeoPos | null {
  const key = normCommune(commune);
  if (!key) return null;
  return COMMUNE_CENTROID[key] ?? null;
}

export function exactLieuCoords(lieuId: string | null | undefined): GeoPos | null {
  if (!lieuId) return null;
  return LIEU_EXACT[lieuId] ?? null;
}

/** CSV lat/lng win; else known salle. Never invent from dist_km_capitole. */
export function attachLieuCoords(lieu: Lieu): Lieu {
  const fromCsv = parseLieuCoords(lieu);
  if (fromCsv) {
    return { ...lieu, lat: String(fromCsv.lat), lng: String(fromCsv.lng) };
  }
  const known = exactLieuCoords(lieu.lieu_id);
  if (known) {
    return { ...lieu, lat: String(known.lat), lng: String(known.lng) };
  }
  return lieu;
}

export function sortCoordsForLieu(lieu: {
  lieu_id?: string;
  lat?: string | number | null;
  lng?: string | number | null;
  commune?: string | null;
} | null | undefined): GeoPos | null {
  const exact = parseLieuCoords(lieu) ?? exactLieuCoords(lieu?.lieu_id);
  if (exact) return exact;
  return communeCentroid(lieu?.commune);
}
