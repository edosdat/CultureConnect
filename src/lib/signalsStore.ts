/**
 * Guest signal store: sessionStorage + first-party cookie (14d, SameSite=Lax).
 * Client-only — do not import from server components.
 */
import {
  COOKIE_MAX_AGE_SEC,
  GUEST_CAP,
  GUEST_STORAGE_KEY,
  dedupAppend,
  emptyGuestStore,
  overlayZeroWeights,
  parseGuestStore,
  profileHasZeroWeights,
  recalcProfile,
  unzeroKeysTouchedBySignal,
  wipeProfileKey,
  type GuestSignalsStore,
  type ProfileBucket,
  type Signal,
} from '@/lib/signals';

const COOKIE_BUDGET = 3500;

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

function storeToJson(store: GuestSignalsStore): string {
  return JSON.stringify(store);
}

function compactForCookie(store: GuestSignalsStore): string {
  const full = storeToJson(store);
  if (full.length <= COOKIE_BUDGET) return full;
  const events = [...store.events];
  while (events.length > 1) {
    events.shift();
    const next = storeToJson({
      events,
      profile: overlayZeroWeights(recalcProfile(events), store.profile),
    });
    if (next.length <= COOKIE_BUDGET) return next;
  }
  return storeToJson({
    events: events.slice(-1),
    profile: overlayZeroWeights(recalcProfile(events.slice(-1)), store.profile),
  });
}

export function readGuestStore(): GuestSignalsStore {
  if (!canUseDom()) return emptyGuestStore();
  try {
    const rawSs = sessionStorage.getItem(GUEST_STORAGE_KEY);
    if (rawSs) {
      const parsed = parseGuestStore(JSON.parse(rawSs));
      if (parsed.events.length > 0 || profileHasZeroWeights(parsed.profile)) {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const rawCk = readCookie(GUEST_STORAGE_KEY);
    if (rawCk) {
      const parsed = parseGuestStore(JSON.parse(rawCk));
      if (parsed.events.length > 0 || profileHasZeroWeights(parsed.profile)) {
        try {
          sessionStorage.setItem(GUEST_STORAGE_KEY, storeToJson(parsed));
        } catch {
          /* ignore */
        }
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return emptyGuestStore();
}

export function writeGuestStore(store: GuestSignalsStore): GuestSignalsStore {
  const events = store.events.slice(-GUEST_CAP);
  const next: GuestSignalsStore = {
    events,
    profile: overlayZeroWeights(recalcProfile(events), store.profile),
  };
  if (!canUseDom()) return next;
  const json = storeToJson(next);
  try {
    sessionStorage.setItem(GUEST_STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
  try {
    writeCookie(GUEST_STORAGE_KEY, compactForCookie(next), COOKIE_MAX_AGE_SEC);
  } catch {
    /* ignore */
  }
  return next;
}

export function clearGuestStore(): void {
  if (!canUseDom()) return;
  try {
    sessionStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  deleteCookie(GUEST_STORAGE_KEY);
}

export function appendGuestSignal(signal: Signal): GuestSignalsStore {
  const current = readGuestStore();
  const events = dedupAppend(current.events, signal, GUEST_CAP);
  return writeGuestStore({ events, profile: current.profile });
}

export function wipeGuestProfileKey(
  bucket: ProfileBucket,
  key: string,
): GuestSignalsStore {
  const current = readGuestStore();
  return writeGuestStore({
    events: current.events,
    profile: wipeProfileKey(current.profile, bucket, key),
  });
}

export function addGuestPhraseSignal(signal: Signal): GuestSignalsStore {
  const current = readGuestStore();
  const profile = unzeroKeysTouchedBySignal(current.profile, signal);
  const events = dedupAppend(current.events, signal, GUEST_CAP);
  return writeGuestStore({ events, profile });
}

export const SIGNALS_CHANGED_EVENT = 'cc-signals-changed';

export function notifySignalsChanged(): void {
  if (!canUseDom()) return;
  window.dispatchEvent(new Event(SIGNALS_CHANGED_EVENT));
}
