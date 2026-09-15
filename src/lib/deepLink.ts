/** Public `?e=` / `?id=` deep-link → agenda item key (`p:…` / `e:…`). */

const MAX_LEN = 64;
/** XSS / injection gate — do not widen. Prefixed `p:` / `e:` still go through this. */
const SAFE = /^[A-Za-z0-9_:-]+$/;
/**
 * Bare ids must start with P/E, then optional letters/_, then a digit.
 * Covers P1847, PRIOP0022, PTMP_L…, PHG0005 / E496, ETMP_L…, EHG003.
 * Ids that do not start with P/E (TMPP0988, T90P2111, FEP…, BARP…, UTPP…)
 * need an explicit `p:` / `e:` prefix (accepted after the SAFE check).
 */
const BARE_PROGRAMME = /^[Pp][A-Za-z_]*\d+[A-Za-z0-9_-]*$/;
const BARE_EVENT = /^[Ee][A-Za-z_]*\d+[A-Za-z0-9_-]*$/;

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

/**
 * B1 `?e=` / `?id=` wins. `?t=`-only uses the share record’s itemKey
 * (same DayItem.key space). Never invent a key from the raw token.
 */
export function resolveShareDeepLinkKey(opts: {
  e?: string | null;
  id?: string | null;
  tokenItemKey?: string | null;
  tokenSeanceKey?: string | null;
}): string | null {
  return (
    normalizeDeepLinkId(opts.e || opts.id || '') ||
    normalizeDeepLinkId(opts.tokenItemKey || '') ||
    normalizeDeepLinkId(opts.tokenSeanceKey || '')
  );
}

/** Query keys that open a fiche on boot / client nav (`?e=` / `?t=` / `?id=`). */
export const DEEP_LINK_QUERY_KEYS = ['e', 't', 'id'] as const;

/**
 * Same pathname + hash, minus `e` / `t` / `id`. Other query params stay.
 * Used by Fermer so a reload does not re-read B1 deep-link params.
 */
export function hrefWithoutDeepLinkParams(input: {
  pathname: string;
  search: string;
  hash?: string;
}): string {
  const raw = input.search.startsWith('?') ? input.search.slice(1) : input.search;
  const params = new URLSearchParams(raw);
  for (const key of DEEP_LINK_QUERY_KEYS) {
    params.delete(key);
  }
  const qs = params.toString();
  return `${input.pathname}${qs ? `?${qs}` : ''}${input.hash || ''}`;
}

/**
 * Drop deep-link keys from the current URL without remounting home
 * (`history.replaceState`, same contract as #131 `pushState` on open).
 */
export function clearDeepLinkUrlParams(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const { pathname, search, hash } = window.location;
  const current = `${pathname}${search}${hash}`;
  const next = hrefWithoutDeepLinkParams({ pathname, search, hash });
  if (next === current) return;
  window.history.replaceState(window.history.state, '', next);
}
