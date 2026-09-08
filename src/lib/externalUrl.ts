/**
 * Catalogue page / ticket hrefs. Never emit a root-relative path that
 * Next.js would treat as an app route (`/spectacle/fleur-de-peau` → 404).
 */

const ARTO_ORIGIN = 'https://festivalramonville-arto.fr';

const APP_INTERNAL = new Set(['/', '/artistes', '/confidentialite']);

function isAppInternalPath(pathname: string): boolean {
  const path = (pathname.split('?')[0] || '').replace(/\/+$/, '') || '/';
  if (APP_INTERNAL.has(path)) return true;
  if (path.startsWith('/artistes/')) return true;
  if (path.startsWith('/api/')) return true;
  return false;
}

function artoSpectacleHref(pathname: string, search: string): string {
  const path = pathname.startsWith('/programmation/')
    ? pathname
    : `/programmation${pathname}`;
  return `${ARTO_ORIGIN}${path}${search}`;
}

/**
 * Safe `href` for programme.url / url_source / billetterie.
 * Absolute http(s) kept. ARTO `/spectacle/…` paths get the festival host.
 * Other root-relative paths are dropped (never used as in-app links).
 */
export function externalPageUrl(raw: string | null | undefined): string {
  const url = (raw || '').trim();
  if (!url || url.toLowerCase() === 'javascript:') return '';

  if (/^https?:\/\//i.test(url)) {
    try {
      new URL(url);
      return url;
    } catch {
      return '';
    }
  }

  if (url.startsWith('//')) {
    return externalPageUrl(`https:${url}`);
  }

  if (url.startsWith('/')) {
    if (isAppInternalPath(url)) return '';
    const q = url.indexOf('?');
    const pathname = q >= 0 ? url.slice(0, q) : url;
    const search = q >= 0 ? url.slice(q) : '';
    if (
      pathname === '/spectacle' ||
      pathname.startsWith('/spectacle/') ||
      pathname === '/programmation' ||
      pathname.startsWith('/programmation/')
    ) {
      return artoSpectacleHref(pathname, search);
    }
    return '';
  }

  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(url)) {
    return externalPageUrl(`https://${url}`);
  }

  return '';
}
