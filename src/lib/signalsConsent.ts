/**
 * P8 — Consent gate for guest taste tracer `cc_signals_v1`.
 * Choice cookie ~6 months. Storage of tastes only when accepted.
 * Client-only helpers (DOM cookie) — do not import from server components
 * that run without a document polyfill.
 */

export const SIGNALS_CONSENT_COOKIE = 'cc_signals_consent';
/** ~6 months (CNIL: consent choice retention). */
export const SIGNALS_CONSENT_MAX_AGE_SEC = 6 * 30 * 24 * 60 * 60;
export const SIGNALS_CONSENT_EVENT = 'cc-signals-consent';

export type SignalsConsent = 'accepted' | 'refused';

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function readCookie(name: string): string | null {
  if (!canUseDom()) return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (!canUseDom()) return;
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:'
      ? '; Secure'
      : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

function deleteCookie(name: string) {
  if (!canUseDom()) return;
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function parseSignalsConsent(raw: unknown): SignalsConsent | null {
  if (raw === 'accepted' || raw === 'refused') return raw;
  return null;
}

export function readSignalsConsent(): SignalsConsent | null {
  return parseSignalsConsent(readCookie(SIGNALS_CONSENT_COOKIE));
}

export function hasAcceptedSignalsConsent(): boolean {
  return readSignalsConsent() === 'accepted';
}

export function writeSignalsConsent(choice: SignalsConsent): void {
  if (!canUseDom()) return;
  writeCookie(SIGNALS_CONSENT_COOKIE, choice, SIGNALS_CONSENT_MAX_AGE_SEC);
  try {
    window.dispatchEvent(
      new CustomEvent(SIGNALS_CONSENT_EVENT, { detail: choice }),
    );
  } catch {
    /* ignore */
  }
}

export function clearSignalsConsent(): void {
  deleteCookie(SIGNALS_CONSENT_COOKIE);
  if (!canUseDom()) return;
  try {
    window.dispatchEvent(
      new CustomEvent(SIGNALS_CONSENT_EVENT, { detail: null }),
    );
  } catch {
    /* ignore */
  }
}
