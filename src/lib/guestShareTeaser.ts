/**
 * Guest cloche teaser — Innovateur KEEP.
 * Guest + tokens they created (local / soft) + ≥1 reaction.
 * Badge = digit only. Sheet never leaks first names or « y va ».
 */
import { isShareToken, normalizeShareToken } from './shareToken';
import { unreadBadgeLabel } from './shareActivity';

export const GUEST_CREATED_TOKENS_KEY = 'cc_share_created_tokens';

export const GUEST_TEASER_SHEET_SUB = 'Connecte-toi pour voir qui.';
export const GUEST_TEASER_LOGIN = 'Se connecter';
export const GUEST_TEASER_LATER = 'Plus tard';

export function rememberGuestCreatedToken(token: string): void {
  const t = normalizeShareToken(token);
  if (!t) return;
  if (typeof window === 'undefined') return;
  try {
    const next = [t, ...readGuestCreatedTokens().filter((x) => x !== t)].slice(
      0,
      30,
    );
    window.localStorage.setItem(GUEST_CREATED_TOKENS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readGuestCreatedTokens(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GUEST_CREATED_TOKENS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => (typeof v === 'string' ? normalizeShareToken(v) : null))
      .filter((v): v is string => Boolean(v));
  } catch {
    return [];
  }
}

export function parseGuestCreatedTokens(raw: unknown): string[] {
  if (typeof raw === 'string') {
    try {
      return parseGuestCreatedTokens(JSON.parse(raw));
    } catch {
      const one = normalizeShareToken(raw);
      return one ? [one] : [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const t = typeof v === 'string' ? normalizeShareToken(v) : null;
    if (!t || seen.has(t) || !isShareToken(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** envie + going on this token. Never invents a count. */
export function guestTeaserReactionCount(stats: {
  envie?: unknown;
  going?: unknown;
} | null | undefined): number {
  if (!stats || typeof stats !== 'object') return 0;
  const envie = Number(stats.envie);
  const going = Number(stats.going);
  const a = Number.isFinite(envie) && envie > 0 ? Math.floor(envie) : 0;
  const b = Number.isFinite(going) && going > 0 ? Math.floor(going) : 0;
  return a + b;
}

export function sumGuestTeaserReactions(
  rows: readonly ({ envie?: unknown; going?: unknown } | null | undefined)[],
): number {
  return rows.reduce((n, row) => n + guestTeaserReactionCount(row), 0);
}

export function guestTeaserBadge(n: number): string | null {
  return unreadBadgeLabel(n);
}

export function guestTeaserTitle(n: number): string {
  const count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const who = count === 1 ? '1 personne a' : `${count} personnes ont`;
  return `${who} réagi à ton partage`;
}

/** Combined LOCK sentence (tests / aria). */
export function guestTeaserCopy(n: number): string {
  return `${guestTeaserTitle(n)} — ${GUEST_TEASER_SHEET_SUB}`;
}

export function guestTeaserShouldShow(opts: {
  signedIn: boolean;
  tokens: readonly string[];
  reactions: number;
}): boolean {
  if (opts.signedIn) return false;
  if (opts.tokens.length === 0) return false;
  return opts.reactions >= 1;
}
