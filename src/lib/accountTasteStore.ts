/**
 * Per-account AccountTasteState that survives sign-out.
 * File is best-effort (gitignored; Vercel FS is ephemeral).
 * Durable copy: httpOnly cookie `cc_account_taste` { key, state }.
 */
import 'server-only';
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { cookies } from 'next/headers';
import {
  hasScorableState,
  parseTasteState,
  profileHasZeroWeights,
  type AccountTasteState,
} from '@/lib/signals';

export const ACCOUNT_TASTE_COOKIE = 'cc_account_taste';
const COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;
const COOKIE_BUDGET = 3200;

function dataDir(): string {
  return (
    process.env['TASTE_STORE_DIR'] ||
    path.join(process.cwd(), '.data', 'account-tastes')
  );
}

export type AccountTasteUser = {
  id?: string | null;
  email?: string | null;
};

export function accountTasteKey(user: AccountTasteUser): string | null {
  const raw = (user.id || user.email || '').trim().toLowerCase();
  return raw || null;
}

export function hasPersistedTasteState(
  state?: AccountTasteState | null,
): boolean {
  if (!state) return false;
  if (hasScorableState(state)) return true;
  if (profileHasZeroWeights(state.profile)) return true;
  return state.signalsRecent.length > 0;
}

function fileName(key: string): string {
  return `${createHash('sha256').update(key).digest('hex')}.json`;
}

function filePathFor(key: string): string {
  return path.join(dataDir(), fileName(key));
}

function cookieSecure(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
}

type CookiePayload = { key: string; state: AccountTasteState };

function parseStoredPayload(raw: unknown, expectedKey: string): AccountTasteState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { key?: unknown; state?: unknown };
  if (typeof o.key === 'string') {
    if (o.key.trim().toLowerCase() !== expectedKey) return null;
    return parseTasteState(o.state);
  }
  return parseTasteState(raw);
}

function decodeCookieJson(raw: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

function compactPayload(key: string, state: AccountTasteState): string {
  const full: CookiePayload = { key, state };
  const fullJson = JSON.stringify(full);
  if (fullJson.length <= COOKIE_BUDGET) return fullJson;
  const signals = [...state.signalsRecent];
  while (signals.length > 0) {
    signals.shift();
    const next = JSON.stringify({
      key,
      state: { ...state, signalsRecent: signals },
    });
    if (next.length <= COOKIE_BUDGET) return next;
  }
  return JSON.stringify({
    key,
    state: {
      signalsRecent: [],
      profile: state.profile,
      tastesText: state.tastesText,
      tastesSetAt: state.tastesSetAt,
    },
  });
}

async function readTasteFile(key: string): Promise<AccountTasteState | null> {
  try {
    const raw = await readFile(filePathFor(key), 'utf8');
    return parseStoredPayload(JSON.parse(raw), key);
  } catch {
    return null;
  }
}

async function writeTasteFile(key: string, state: AccountTasteState): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(
      filePathFor(key),
      JSON.stringify({ key, state }),
      'utf8',
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') return;
  }
}

async function readTasteCookie(key: string): Promise<AccountTasteState | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(ACCOUNT_TASTE_COOKIE)?.value;
    if (!raw) return null;
    return parseStoredPayload(decodeCookieJson(raw), key);
  } catch {
    return null;
  }
}

async function writeTasteCookie(key: string, state: AccountTasteState): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(ACCOUNT_TASTE_COOKIE, compactPayload(key, state), {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure(),
      maxAge: COOKIE_MAX_AGE_SEC,
      path: '/',
    });
  } catch {
    /* cookies() is read-only outside a Route Handler / Server Action */
  }
}

/** File first, else cookie whose key matches the signed-in user. */
export async function readAccountTaste(
  user: AccountTasteUser,
): Promise<AccountTasteState | null> {
  const key = accountTasteKey(user);
  if (!key) return null;
  const fromFile = await readTasteFile(key);
  if (fromFile) return fromFile;
  return readTasteCookie(key);
}

/** Best-effort file (ignore EACCES) + set durable cookie. Never deletes. */
export async function writeAccountTaste(
  user: AccountTasteUser,
  state: AccountTasteState,
): Promise<void> {
  const key = accountTasteKey(user);
  if (!key) return;
  await writeTasteFile(key, state);
  await writeTasteCookie(key, state);
}

export async function resolveAccountTaste(
  user: AccountTasteUser,
  jwtState: AccountTasteState,
  opts?: { preferStore?: boolean },
): Promise<AccountTasteState> {
  if (opts?.preferStore) {
    return (await readAccountTaste(user)) ?? jwtState;
  }
  if (hasPersistedTasteState(jwtState)) return jwtState;
  return (await readAccountTaste(user)) ?? jwtState;
}
