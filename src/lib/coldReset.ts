/**
 * Admin « reset froid » — client identity only.
 * Two separate cookie deletes (`cc_vid`, then `cc_signals_v1`).
 * Never compact a profile JSON, never write the visitor id next to an account.
 * KV `cc:vs:*` is not touched here. Neon `account_tastes` is not written.
 * A new `cc_vid` is minted later by the existing guest signal path
 * (`POST /api/signals` → `commitGuestSignals`), not by this module.
 */
import { COHORT_COOKIE, VID_COOKIE } from '@/lib/guestId';
import { MAIL_IDEAS_COOKIE } from '@/lib/mailConsent';
import { GUEST_STORAGE_KEY } from '@/lib/signals';
import { SIGNALS_CONSENT_COOKIE } from '@/lib/signalsConsent';

/** Same string as `ACCOUNT_TASTE_COOKIE`. Cache only — expiring it is not a row write. */
export const ACCOUNT_TASTE_CACHE_COOKIE = 'cc_account_taste';

export const COLD_RESET_LABEL = 'Reset froid / comme 1ʳᵉ visite';

export const COLD_RESET_NOTE =
  'Froid = cet appareil seulement. Les cookies cc_vid et cc_signals_v1 sont effacés séparément. L’historique KV cc:vs:* reste. Zéro écriture Neon. Le compte Google reste.';

export const COLD_RESET_CONFIRM =
  'Reset froid : cet appareil redevient une première visite. La session Google sur cet appareil se ferme. Les cookies cc_vid et cc_signals_v1 sont effacés séparément, puis le stockage local Plan C. L’historique KV cc:vs:* reste. Le compte Google et les goûts en base restent. Continuer ?';

/** sessionStorage / localStorage keys owned by Plan C. Dot variant covers `cc.favorites.v1`. */
export const PLAN_C_STORAGE_PREFIXES = [
  'cc_',
  'cc.',
  'planc_',
  'culture-connect',
] as const;

export type ColdResetCookieDelete = {
  name: string;
  httpOnly: boolean;
};

/**
 * Order is the wipe order. The first two entries stay distinct cookies:
 * visitor id, then taste tracer. Do not join them into one Set-Cookie.
 */
export function coldResetCookieDeletes(): readonly ColdResetCookieDelete[] {
  return [
    { name: VID_COOKIE, httpOnly: true },
    { name: GUEST_STORAGE_KEY, httpOnly: false },
    { name: COHORT_COOKIE, httpOnly: false },
    { name: SIGNALS_CONSENT_COOKIE, httpOnly: false },
    { name: ACCOUNT_TASTE_CACHE_COOKIE, httpOnly: true },
    { name: MAIL_IDEAS_COOKIE, httpOnly: false },
  ];
}

export function coldResetSecureFlag(
  env: { VERCEL?: string; NODE_ENV?: string } = process.env,
): boolean {
  return Boolean(env.VERCEL) || env.NODE_ENV === 'production';
}

export function expiredCookieOptions(httpOnly: boolean, secure: boolean): {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  maxAge: 0;
  expires: Date;
  path: '/';
} {
  return {
    httpOnly,
    sameSite: 'lax',
    secure,
    maxAge: 0,
    expires: new Date(0),
    path: '/',
  };
}

export type ColdResetCookieJar = {
  set: (
    name: string,
    value: string,
    options: ReturnType<typeof expiredCookieOptions>,
  ) => void;
};

/**
 * One `jar.set` per cookie. `cc_vid` and `cc_signals_v1` are two calls.
 * The value is always empty — never a profile payload.
 */
export function applyColdResetCookieDeletes(
  jar: ColdResetCookieJar,
  secure: boolean,
): readonly string[] {
  const planned = coldResetCookieDeletes();
  jar.set(VID_COOKIE, '', expiredCookieOptions(true, secure));
  jar.set(GUEST_STORAGE_KEY, '', expiredCookieOptions(false, secure));
  for (const cookie of planned.slice(2)) {
    jar.set(cookie.name, '', expiredCookieOptions(cookie.httpOnly, secure));
  }
  return planned.map((cookie) => cookie.name);
}

export function isPlanCOwnedStorageKey(key: string): boolean {
  for (const prefix of PLAN_C_STORAGE_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

export type StorageLike = {
  length: number;
  key: (index: number) => string | null;
  removeItem: (key: string) => void;
};

/** Remove owned keys. Collect names first so removals do not shift indexes. */
export function clearPlanCOwnedStorage(store: StorageLike): string[] {
  const doomed: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key && isPlanCOwnedStorageKey(key)) doomed.push(key);
  }
  const removed: string[] = [];
  for (const key of doomed) {
    try {
      store.removeItem(key);
      removed.push(key);
    } catch {
      /* privacy mode or quota */
    }
  }
  return removed;
}

export function clientCookieNames(cookieHeader: string): string[] {
  const names: string[] = [];
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    const name = (idx < 0 ? part : part.slice(0, idx)).trim();
    if (name) names.push(name);
  }
  return names;
}

export function planCClientCookieNames(cookieHeader: string): string[] {
  return clientCookieNames(cookieHeader).filter(isPlanCOwnedStorageKey);
}

/** One cookie per assignment. Secure matches cookies posed on https. */
export function deleteClientCookieHeader(name: string, secure: boolean): string {
  const secureAttr = secure ? '; Secure' : '';
  return `${name}=; Max-Age=0; Path=/; SameSite=Lax${secureAttr}`;
}
