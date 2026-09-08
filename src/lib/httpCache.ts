/**
 * Browser always revalidates; CDN may keep the slim agenda 5 min and SWR 5 min.
 * Vercel-specific CDN headers keep s-maxage if Next overwrites Cache-Control
 * on `force-dynamic` route handlers.
 */
export const PUBLIC_REVALIDATE_CACHE_CONTROL =
  'public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=300';

export const CDN_REVALIDATE_CACHE_CONTROL =
  'public, s-maxage=300, stale-while-revalidate=300';

export const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store';

/** Client GET: revalidate (If-None-Match / 304). Does not skip the CDN. */
export const AGENDA_GET_FETCH_INIT: RequestInit = { cache: 'no-cache' };

export function agendaEtag(catalogueVersion: string, vary: string): string {
  const version = (catalogueVersion || '').trim() || '0';
  return `"${version}:${vary}"`;
}

export function ifNoneMatchHits(
  ifNoneMatch: string | null,
  etag: string,
): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').some((part) => {
    const token = part.trim();
    return token === etag || token === `W/${etag}`;
  });
}

export function publicRevalidateHeaders(etag: string): HeadersInit {
  return {
    'Cache-Control': PUBLIC_REVALIDATE_CACHE_CONTROL,
    'CDN-Cache-Control': CDN_REVALIDATE_CACHE_CONTROL,
    'Vercel-CDN-Cache-Control': CDN_REVALIDATE_CACHE_CONTROL,
    ETag: etag,
    Vary: 'Accept-Encoding',
  };
}

export function privateNoStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': PRIVATE_NO_STORE_CACHE_CONTROL,
    'CDN-Cache-Control': PRIVATE_NO_STORE_CACHE_CONTROL,
    'Vercel-CDN-Cache-Control': PRIVATE_NO_STORE_CACHE_CONTROL,
  };
}
