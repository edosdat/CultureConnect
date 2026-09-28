/**
 * Catalogue posters. A dead host must not be requested: the browser
 * would keep the connection pending until FAIL, and that wait is not
 * the Ciné rail (PackRailSkeleton clears only when the list settles).
 */
const DEAD_POSTER_HOSTS = ['archive.org', 'web.archive.org'];

export function catalogueImageSrc(raw: string | null | undefined): string {
  const url = (raw || '').trim();
  if (!url) return '';
  if (/archive\.org/i.test(url)) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (
        DEAD_POSTER_HOSTS.includes(host) ||
        host.endsWith('.archive.org')
      ) {
        return '';
      }
    } catch {
      return '';
    }
  }
  return url;
}
