/**
 * Browser half of the admin cold reset.
 * Client-only: sessionStorage, localStorage, non-HttpOnly cookies, RAM guest store.
 * `cc_vid` is HttpOnly — the matching server route expires it. This file still
 * issues its own delete so the two identity cookies are never one fused write.
 * Does not mint a visitor id and does not call Neon.
 */
import { COHORT_COOKIE, VID_COOKIE } from '@/lib/guestId';
import { MAIL_IDEAS_COOKIE } from '@/lib/mailConsent';
import { GUEST_STORAGE_KEY } from '@/lib/signals';
import {
  SIGNALS_CONSENT_COOKIE,
  clearSignalsConsent,
} from '@/lib/signalsConsent';
import { clearGuestStore, notifySignalsChanged } from '@/lib/signalsStore';
import {
  clearPlanCOwnedStorage,
  deleteClientCookieHeader,
  planCClientCookieNames,
} from '@/lib/coldReset';

function writeDelete(name: string): void {
  if (typeof document === 'undefined') return;
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:';
  document.cookie = deleteClientCookieHeader(name, secure);
}

/** Drop Plan C client state. Returns storage keys removed. */
export function clearPlanCClientCold(): string[] {
  writeDelete(VID_COOKIE);
  writeDelete(GUEST_STORAGE_KEY);

  const header = typeof document === 'undefined' ? '' : document.cookie;
  const extra = planCClientCookieNames(header).filter(
    (name) => name !== VID_COOKIE && name !== GUEST_STORAGE_KEY,
  );
  for (const name of extra) writeDelete(name);
  writeDelete(COHORT_COOKIE);
  writeDelete(SIGNALS_CONSENT_COOKIE);
  writeDelete(MAIL_IDEAS_COOKIE);

  clearSignalsConsent();
  clearGuestStore();

  const removed: string[] = [];
  try {
    if (typeof sessionStorage !== 'undefined') {
      removed.push(...clearPlanCOwnedStorage(sessionStorage));
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      removed.push(...clearPlanCOwnedStorage(localStorage));
    }
  } catch {
    /* ignore */
  }

  if (typeof window !== 'undefined') {
    const host = window as Window & { __plancInstallPrompt?: unknown };
    host.__plancInstallPrompt = undefined;
  }

  notifySignalsChanged();
  return removed;
}
