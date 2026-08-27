/** Public `?e=` / `?id=` deep-link → agenda item key (`p:…` / `e:…`). */

const MAX_LEN = 64;
const SAFE = /^[A-Za-z0-9_:-]+$/;
const BARE_PROGRAMME = /^[Pp]\d+[A-Za-z0-9_-]*$/;
const BARE_EVENT = /^[Ee]\d+[A-Za-z0-9_-]*$/;

/**
 * Trim and map a raw query id to `p:P1847` / `e:E496`.
 * Empty, oversized, or junk (XSS-unsafe) → null.
 */
export function normalizeDeepLinkId(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s || s.length > MAX_LEN || !SAFE.test(s)) return null;
  if (s.startsWith('p:') || s.startsWith('e:')) {
    return s.length > 2 ? s : null;
  }
  if (BARE_PROGRAMME.test(s)) {
    return `p:${s[0].toUpperCase()}${s.slice(1)}`;
  }
  if (BARE_EVENT.test(s)) {
    return `e:${s[0].toUpperCase()}${s.slice(1)}`;
  }
  return null;
}
