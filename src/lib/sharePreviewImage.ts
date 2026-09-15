/**
 * Share / Open Graph preview image.
 * Native share sends the URL only (no file) — crawlers read og:image.
 * Only HTTPS absolute catalogue photos are usable; everything else
 * falls back to an absolute `/api/og?e=` card (never empty / relative).
 */

export const SHARE_OG_SIZE = { width: 1200, height: 630 } as const;

/** Same host as layout metadataBase when AUTH_URL / NEXTAUTH_URL are unset. */
export const SHARE_OG_FALLBACK_ORIGIN =
  'https://culture-connect-2q8c-three.vercel.app';

const DATA_URI = /^data:/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function envOrigin(
  raw: string | undefined,
  forceHttps: boolean,
): string {
  const value = (raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (LOCAL_HOSTS.has(url.hostname)) return url.origin;
    if (forceHttps || url.protocol !== 'https:') {
      return `https://${url.host}`;
    }
    return url.origin;
  } catch {
    return '';
  }
}

/** Canonical public origin for absolute og:image / twitter:image. */
export function publicAppOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string {
  for (const key of ['AUTH_URL', 'NEXTAUTH_URL'] as const) {
    const origin = envOrigin(env[key], true);
    if (origin) return origin;
  }
  const vercel = (env.VERCEL_URL || '').trim();
  if (vercel) {
    const origin = envOrigin(
      vercel.includes('://') ? vercel : `https://${vercel}`,
      true,
    );
    if (origin) return origin;
  }
  return SHARE_OG_FALLBACK_ORIGIN;
}

/**
 * Catalogue photo that crawlers can fetch.
 * Accepts https:// only. Rejects data:, http:, relative, and junk.
 * Protocol-relative `//host/img` is upgraded to https.
 */
export function usableHttpsImageUrl(
  raw: string | null | undefined,
): string {
  const value = (raw || '').trim();
  if (!value || DATA_URI.test(value)) return '';

  let href = value;
  if (href.startsWith('//')) href = `https:${href}`;

  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:') return '';
  if (!parsed.hostname) return '';
  return parsed.href;
}

/** Fill-empty only — copy films.csv poster when programme.image_url is blank. */
export function fillEmptyCatalogueImageUrl(
  imageUrl: string | undefined | null,
  filmId: string | undefined | null,
  filmImageUrl: string | undefined | null,
): string {
  const current = (imageUrl || '').trim();
  if (current) return current;
  if (!(filmId || '').trim()) return '';
  return (filmImageUrl || '').trim();
}

export function shareOgFallbackUrl(origin: string, itemKey: string): string {
  const base = (origin || '').replace(/\/$/, '') || SHARE_OG_FALLBACK_ORIGIN;
  const key = (itemKey || '').trim();
  const q = key ? `?e=${encodeURIComponent(key)}` : '';
  return `${base}/api/og${q}`;
}

/**
 * Warm `/api/og` at share-create so the first crawler hit is cached.
 * Fire-and-forget — never blocks the share POST.
 */
export function scheduleShareOgWarm(
  origin: string,
  itemKey: string,
  fetchImpl: typeof fetch = fetch,
): void {
  const url = shareOgFallbackUrl(origin, itemKey);
  if (!/^https?:\/\//i.test(url)) return;
  void fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'image/png' },
    redirect: 'follow',
  }).catch(() => {});
}

export function isOgGeneratorUrl(url: string): boolean {
  const value = (url || '').trim();
  if (!value) return false;
  try {
    return new URL(value).pathname === '/api/og';
  } catch {
    return /(^|\/)api\/og(\?|$)/.test(value);
  }
}

/**
 * Prefer a usable HTTPS catalogue photo; else absolute `/api/og?e=`.
 * Never returns empty or a root-relative path.
 */
export function sharePreviewImageUrl(opts: {
  origin: string;
  itemKey: string;
  candidates?: Array<string | null | undefined>;
}): string {
  for (const candidate of opts.candidates ?? []) {
    const https = usableHttpsImageUrl(candidate);
    if (https) return https;
  }
  const fallback = shareOgFallbackUrl(opts.origin, opts.itemKey);
  if (usableHttpsImageUrl(fallback) || fallback.startsWith('http://localhost')) {
    return fallback;
  }
  return shareOgFallbackUrl(SHARE_OG_FALLBACK_ORIGIN, opts.itemKey);
}

export function sharePreviewOgImage(opts: {
  origin: string;
  itemKey: string;
  candidates?: Array<string | null | undefined>;
  alt?: string;
}): { url: string; alt?: string; width?: number; height?: number } {
  const url = sharePreviewImageUrl(opts);
  const image: { url: string; alt?: string; width?: number; height?: number } = {
    url,
  };
  if (opts.alt) image.alt = opts.alt;
  if (isOgGeneratorUrl(url)) {
    image.width = SHARE_OG_SIZE.width;
    image.height = SHARE_OG_SIZE.height;
  }
  return image;
}
