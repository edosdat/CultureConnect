/**
 * Guest gate for Partager / Envie / J’y vais.
 * One pending fiche action survives the Google redirect (sessionStorage).
 * Browse, filters, and Top 3 never write a pending action.
 */
import { normalizeDeepLinkId } from '@/lib/deepLink';
import { normalizeShareToken } from '@/lib/shareToken';
import { LOGIN_NUDGE_DISMISS_KEY } from '@/lib/signals';

export const AUTH_GATE_TITLE = 'Connexion rapide';
export const AUTH_GATE_GOOGLE = 'Continuer avec Google';
export const AUTH_GATE_LATER = 'Plus tard';
export const AUTH_GATE_ERROR = 'Connexion impossible. Réessaie.';
export const AUTH_GATE_RESUME_RETRY = 'Réessaie';

export const AUTH_GATE_WHY = {
  share: 'Pour envoyer le lien et le retrouver plus tard.',
  envie: 'Pour retrouver tes goûts.',
  going: 'Pour voir qui vient.',
} as const;

export type AuthGateKind = keyof typeof AUTH_GATE_WHY;

/** Other sheets listen and close. Auth sheet is the only blocking layer. */
export const AUTH_GATE_OPEN_EVENT = 'cc-auth-gate-open';

export const AUTH_GATE_QUERY = 'cc_auth';
export const AUTH_GATE_QUERY_ERROR = 'err';

const STORAGE_KEY = 'cc_auth_gate_pending';
const TTL_MS = 15 * 60 * 1000;

export type PendingAuthAction = {
  kind: AuthGateKind;
  itemKey: string;
  seanceKey: string | null;
  token: string | null;
  href: string;
  armed: boolean;
  at: number;
};

export type AuthGateView = {
  kind: AuthGateKind;
  href: string;
  error: boolean;
};

export type AuthGateMatch = {
  kind: AuthGateKind | readonly AuthGateKind[];
  itemKey: string;
  /** When set, mother (null) and daughter token must match. */
  token?: string | null;
};

let autoSheetsHeld = false;
let claimedStamp: string | null = null;
let view: AuthGateView | null = null;
const listeners = new Set<(next: AuthGateView | null) => void>();

export function authGateWhy(kind: AuthGateKind): string {
  return AUTH_GATE_WHY[kind];
}

export function isAuthGateKind(value: unknown): value is AuthGateKind {
  return value === 'share' || value === 'envie' || value === 'going';
}

/** Relative URL so `?e=` / `?t=` reopen the same fiche after Google. */
export function authGateReturnHref(input: {
  pathname: string;
  search: string;
  hash?: string;
  itemKey: string;
  token?: string | null;
}): string {
  const params = new URLSearchParams(
    input.search.startsWith('?') ? input.search.slice(1) : input.search,
  );
  const itemKey = normalizeDeepLinkId(input.itemKey) || input.itemKey.trim();
  if (itemKey) params.set('e', itemKey);
  const token = input.token ? normalizeShareToken(input.token) : null;
  if (token) params.set('t', token);
  params.delete(AUTH_GATE_QUERY);
  const qs = params.toString();
  const path = input.pathname || '/';
  return `${path}${qs ? `?${qs}` : ''}${input.hash || ''}`;
}

export function parsePendingAuthAction(
  raw: string | null | undefined,
  now = Date.now(),
): PendingAuthAction | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const row = parsed as Partial<PendingAuthAction>;
  if (!isAuthGateKind(row.kind)) return null;
  if (typeof row.itemKey !== 'string' || !row.itemKey.trim()) return null;
  if (typeof row.href !== 'string' || !row.href.startsWith('/')) return null;
  if (typeof row.at !== 'number' || !Number.isFinite(row.at)) return null;
  if (now - row.at > TTL_MS) return null;
  const itemKey = normalizeDeepLinkId(row.itemKey) || row.itemKey.trim();
  const token =
    typeof row.token === 'string' ? normalizeShareToken(row.token) : null;
  const seanceKey =
    typeof row.seanceKey === 'string' ? normalizeDeepLinkId(row.seanceKey) : null;
  return {
    kind: row.kind,
    itemKey,
    seanceKey,
    token,
    href: row.href,
    armed: row.armed === true,
    at: row.at,
  };
}

export function pendingMatches(
  pending: PendingAuthAction,
  match: AuthGateMatch,
): boolean {
  const kinds = Array.isArray(match.kind) ? match.kind : [match.kind];
  if (!kinds.includes(pending.kind)) return false;
  const itemKey = normalizeDeepLinkId(match.itemKey) || match.itemKey.trim();
  if (!itemKey || pending.itemKey !== itemKey) return false;
  if (match.token !== undefined) {
    const token = match.token ? normalizeShareToken(match.token) : null;
    if (pending.token !== token) return false;
  }
  return true;
}

/**
 * Resume only after the Google button armed the pending action.
 * An auth error keeps the guest on the sheet and does not run the action.
 */
export function shouldResumePending(input: {
  authed: boolean;
  pending: PendingAuthAction | null;
  authError: boolean;
}): boolean {
  if (!input.authed || input.authError) return false;
  return Boolean(input.pending?.armed);
}

export function authGateHoldsAutoSheets(): boolean {
  return autoSheetsHeld;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPendingAuthAction(now = Date.now()): PendingAuthAction | null {
  const store = storage();
  if (!store) return null;
  try {
    return parsePendingAuthAction(store.getItem(STORAGE_KEY), now);
  } catch {
    return null;
  }
}

function writePending(action: PendingAuthAction): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(action));
  } catch {
    /* private mode */
  }
}

export function clearPendingAuthAction(): void {
  claimedStamp = null;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function stampOf(action: PendingAuthAction): string {
  return `${action.at}:${action.kind}:${action.itemKey}:${action.token ?? ''}`;
}

export function armPendingAuthAction(now = Date.now()): PendingAuthAction | null {
  const pending = readPendingAuthAction(now);
  if (!pending) return null;
  const next = { ...pending, armed: true, at: now };
  writePending(next);
  return next;
}

export function disarmPendingAuthAction(): void {
  const pending = readPendingAuthAction();
  if (!pending) return;
  writePending({ ...pending, armed: false });
}

/**
 * Fiche dialog (real or deep-link skeleton) owns the resume.
 * A carousel control under that dialog must not consume the pending action.
 */
export function shouldDeferAuthResume(owner: Element | null): boolean {
  if (typeof document === 'undefined') return false;
  const fiche = document.querySelector('[aria-labelledby="event-detail-title"]');
  if (!fiche) return false;
  if (owner && fiche.contains(owner)) return false;
  return true;
}

export function claimArmedAuthAction(
  match: AuthGateMatch,
  now = Date.now(),
): PendingAuthAction | null {
  const pending = readPendingAuthAction(now);
  if (!shouldResumePending({ authed: true, pending, authError: false })) return null;
  if (!pending || !pendingMatches(pending, match)) return null;
  const stamp = stampOf(pending);
  if (claimedStamp === stamp) return null;
  claimedStamp = stamp;
  clearPendingAuthAction();
  claimedStamp = stamp;
  return pending;
}

function publish(next: AuthGateView | null): void {
  view = next;
  for (const listener of listeners) listener(next);
}

export function subscribeAuthGate(
  listener: (next: AuthGateView | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentAuthGate(): AuthGateView | null {
  return view;
}

/** Close digeste, A2HS sheet, feedback, and the home login nudge. */
export function markAuthGateShown(): void {
  autoSheetsHeld = true;
  if (typeof document !== 'undefined') {
    document.body.dataset.ccAuthGateHold = '1';
  }
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LOGIN_NUDGE_DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(AUTH_GATE_OPEN_EVENT));
}

export function requestAuthGate(input: {
  kind: AuthGateKind;
  itemKey: string;
  seanceKey?: string | null;
  token?: string | null;
}): void {
  if (typeof window === 'undefined') return;
  const itemKey = normalizeDeepLinkId(input.itemKey) || input.itemKey.trim();
  if (!itemKey) return;
  const token = input.token ? normalizeShareToken(input.token) : null;
  const seanceKey = input.seanceKey ? normalizeDeepLinkId(input.seanceKey) : null;
  const href = authGateReturnHref({
    pathname: window.location.pathname || '/',
    search: window.location.search,
    hash: window.location.hash,
    itemKey,
    token,
  });
  const pending: PendingAuthAction = {
    kind: input.kind,
    itemKey,
    seanceKey,
    token,
    href,
    armed: false,
    at: Date.now(),
  };
  writePending(pending);
  markAuthGateShown();
  publish({ kind: input.kind, href, error: false });
}

export function dismissAuthGate(): void {
  clearPendingAuthAction();
  publish(null);
}

export function reopenAuthGateWithError(): void {
  const pending = readPendingAuthAction();
  if (!pending) return;
  disarmPendingAuthAction();
  markAuthGateShown();
  publish({ kind: pending.kind, href: pending.href, error: true });
}

export function showAuthResumeRetry(): void {
  if (typeof document === 'undefined') return;
  let el = document.querySelector<HTMLDivElement>('[data-testid="auth-gate-retry"]');
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('data-testid', 'auth-gate-retry');
    el.className =
      'pointer-events-none fixed bottom-5 left-1/2 z-[210] w-[min(92vw,20rem)] -translate-x-1/2 rounded-full bg-planc-nuit px-4 py-2.5 text-center text-sm font-medium text-planc-creme shadow-lg';
    document.body.appendChild(el);
  }
  el.textContent = AUTH_GATE_RESUME_RETRY;
  el.style.display = 'block';
  window.setTimeout(() => {
    if (el) el.style.display = 'none';
  }, 4000);
}
