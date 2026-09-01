/**
 * Display-only last account profile. Not a write to Neon / JWT.
 * Survives refresh so Mes goûts is not empty while session=loading.
 */
import {
  coerceProfile,
  emptyProfile,
  type TasteProfile,
} from '@/lib/signals';

const KEY = 'cc_account_profile_v1';

type CachePayload = {
  email: string;
  profile: TasteProfile;
};

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

export function writeAccountProfileCache(
  email: string | null | undefined,
  profile: TasteProfile | null | undefined,
): void {
  if (!canUseDom()) return;
  const who = (email || '').trim().toLowerCase();
  if (!who || !profile) return;
  const payload: CachePayload = { email: who, profile: coerceProfile(profile) };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function readAccountProfileCache(
  email?: string | null,
): TasteProfile | null {
  if (!canUseDom()) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachePayload>;
    if (!parsed || typeof parsed !== 'object' || !parsed.profile) return null;
    const cachedEmail =
      typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : '';
    const want = (email || '').trim().toLowerCase();
    if (want && cachedEmail && want !== cachedEmail) return null;
    return coerceProfile(parsed.profile);
  } catch {
    return null;
  }
}

export function emptyCachedProfile(): TasteProfile {
  return emptyProfile();
}
