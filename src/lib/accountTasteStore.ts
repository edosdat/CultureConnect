/**
 * Per-account AccountTasteState that survives sign-out.
 * Durable source of truth: Vercel Postgres `account_tastes` when
 * POSTGRES_URL / POSTGRES_URL_NON_POOLING is set.
 * Fallbacks: gitignored file (local/dev) then httpOnly cookie cache.
 * Sign-out must never delete a row.
 */
import 'server-only';
import { createHash } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { cookies } from 'next/headers';
import { VercelPool } from '@vercel/postgres';
import {
  ACCOUNT_CAP,
  coerceProfile,
  concatTastesText,
  hasScorableState,
  mergeSignalLists,
  overlayZeroWeights,
  overlayZeroWeightsExceptIncomingPositives,
  parseTasteState,
  profileHasZeroWeights,
  rebuildTasteState,
  recomputeProfilePcts,
  sanitizeTasteProfile,
  unionPositiveWeights,
  type AccountTasteState,
} from '@/lib/signals';
import { deleteMailConsent } from '@/lib/mailConsentStore';

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

function normalizeTasteKey(value?: string | null): string | null {
  const raw = (value || '').trim().toLowerCase();
  return raw || null;
}

/** Stable key: session email (lowercased). Never user.id / token.sub / UUID. */
export function accountTasteKey(user: AccountTasteUser): string | null {
  return normalizeTasteKey(user.email);
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

function postgresUrl(): string | undefined {
  const env = process.env;
  const url = (env['POSTGRES_URL'] || env['POSTGRES_URL_NON_POOLING'] || '').trim();
  if (!url || url === 'undefined') return undefined;
  return url;
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

/** Drop the httpOnly taste cookie on sign-out. Never DELETE the Neon row. */
export async function clearAccountTasteCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(ACCOUNT_TASTE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure(),
      maxAge: 0,
      expires: new Date(0),
      path: '/',
    });
  } catch {
    /* cookies() is read-only outside a Route Handler / Server Action */
  }
}

let pool: VercelPool | null = null;
let tableReady: Promise<void> | null = null;

function getPool(): VercelPool | null {
  const url = postgresUrl();
  if (!url) return null;
  if (!pool) {
    pool = new VercelPool({ connectionString: url });
  }
  return pool;
}

async function ensureAccountTastesTable(): Promise<VercelPool | null> {
  const pg = getPool();
  if (!pg) return null;
  if (!tableReady) {
    tableReady = (async () => {
      await pg.query(`
        CREATE TABLE IF NOT EXISTS account_tastes (
          user_key TEXT PRIMARY KEY,
          state JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    })().catch((err: unknown) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
  return pg;
}

const RETENTION_MONTHS = 24;

function activityTimestamps(
  state: AccountTasteState,
  updatedAt?: string,
): number[] {
  const out: number[] = [];
  const push = (raw?: string | Date | null) => {
    if (!raw) return;
    const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
    if (Number.isFinite(t)) out.push(t);
  };
  push(updatedAt);
  push(state.tastesSetAt);
  for (const s of state.signalsRecent) push(s.ts);
  return out;
}

function isPastRetention(
  state: AccountTasteState,
  updatedAt?: string,
): boolean {
  const times = activityTimestamps(state, updatedAt);
  if (times.length === 0) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  return Math.max(...times) < cutoff.getTime();
}

type StoredTasteRow = { state: AccountTasteState; updatedAt?: string };

async function readTastePostgres(key: string): Promise<StoredTasteRow | null> {
  try {
    const pg = await ensureAccountTastesTable();
    if (!pg) return null;
    const result = await pg.query(
      `SELECT state, updated_at FROM account_tastes WHERE user_key = $1 LIMIT 1`,
      [key],
    );
    const row = result.rows[0] as
      | { state?: unknown; updated_at?: Date | string }
      | undefined;
    if (!row) return null;
    const raw = row.state;
    let parsed: AccountTasteState | null = null;
    if (typeof raw === 'string') {
      try {
        parsed = parseTasteState(JSON.parse(raw));
      } catch {
        parsed = null;
      }
    } else {
      parsed = parseTasteState(raw);
    }
    if (!parsed) return null;
    const updatedAt =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
          ? String(row.updated_at)
          : undefined;
    return { state: parsed, updatedAt };
  } catch {
    return null;
  }
}

function newerTimestamp(a?: string, b?: string): string | undefined {
  const ta = a ? Date.parse(a) : Number.NaN;
  const tb = b ? Date.parse(b) : Number.NaN;
  const aOk = Number.isFinite(ta);
  const bOk = Number.isFinite(tb);
  if (aOk && bOk) return ta >= tb ? a : b;
  if (bOk) return b;
  if (aOk) return a;
  return a || b;
}


/** Additive merge onto the stored email row. Never replace a richer snapshot. */
function mergeIncomingTaste(
  existing: AccountTasteState | null,
  incoming: AccountTasteState,
): AccountTasteState {
  const incomingProfile = coerceProfile(incoming.profile);
  if (!existing) {
    return {
      ...incoming,
      profile: recomputeProfilePcts(incomingProfile),
    };
  }
  const existingProfile = coerceProfile(existing.profile);

  const signalsRecent = mergeSignalLists(
    existing.signalsRecent,
    incoming.signalsRecent,
    ACCOUNT_CAP,
  );
  const tastesText = concatTastesText(existing.tastesText, incoming.tastesText);
  const existingText = (existing.tastesText || '').trim() || undefined;
  const mergedText = (tastesText || '').trim() || undefined;
  const tastesSetAt =
    mergedText !== existingText
      ? newerTimestamp(existing.tastesSetAt, incoming.tastesSetAt)
      : existing.tastesSetAt;

  const rebuilt = rebuildTasteState(
    signalsRecent,
    tastesText,
    tastesSetAt,
    ACCOUNT_CAP,
    existingProfile,
  );
  // Recalc, then union fused positives, overlay incoming 0s (wipe persists), then existing 0s
  // except keys incoming is unzeroing (+) so cinema:1 is not re-zeroed.
  const profile = recomputeProfilePcts(
    overlayZeroWeightsExceptIncomingPositives(
      overlayZeroWeights(
        unionPositiveWeights(
          unionPositiveWeights(rebuilt.profile, existingProfile),
          incomingProfile,
        ),
        incomingProfile,
      ),
      existingProfile,
      incomingProfile,
    ),
  );

  return {
    signalsRecent: rebuilt.signalsRecent,
    profile,
    tastesText,
    tastesSetAt,
  };
}

async function writeTastePostgres(
  key: string,
  state: AccountTasteState,
): Promise<void> {
  try {
    const pg = await ensureAccountTastesTable();
    if (!pg) return;
    const existing = await readTastePostgres(key);
    const merged = mergeIncomingTaste(existing?.state ?? null, state);
    const payload = JSON.stringify(merged);
    await pg.query(
      `INSERT INTO account_tastes (user_key, state, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_key)
       DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
      [key, payload],
    );
  } catch {
    /* skip — cookie/file remain; never throw into login */
  }
}

async function readTasteByKey(key: string): Promise<AccountTasteState | null> {
  const fromPg = await readTastePostgres(key);
  const stored = fromPg?.state ?? (await readTasteFile(key)) ?? (await readTasteCookie(key));
  if (!stored) return null;
  if (isPastRetention(stored, fromPg?.updatedAt)) {
    await deleteAccountTaste(key);
    return null;
  }
  return stored;
}

/** Hydrate on email key only. Never looks up user.id / UUID. */
export async function readAccountTaste(
  user: AccountTasteUser,
): Promise<AccountTasteState | null> {
  const key = accountTasteKey(user);
  if (!key) return null;
  const stored = await readTasteByKey(key);
  if (!stored) return null;
  // read raw → migrate leftover numbers → rebuild (union positives) → overlay 0 LAST.
  // Never union after overlay: a leftover number must not rewrite a wipe 0.
  const migrated = sanitizeTasteProfile(coerceProfile(stored.profile));
  const rebuilt = rebuildTasteState(
    stored.signalsRecent,
    stored.tastesText,
    stored.tastesSetAt,
    ACCOUNT_CAP,
    migrated,
  );
  return {
    ...rebuilt,
    profile: overlayZeroWeights(rebuilt.profile, migrated),
  };
}

/** Additive UPSERT on the email key only. Never writes user.id / token.sub. */
export async function writeAccountTaste(
  user: AccountTasteUser,
  state: AccountTasteState,
): Promise<void> {
  const key = accountTasteKey(user);
  if (!key) return;
  const existing = await readTasteByKey(key);
  const merged = mergeIncomingTaste(existing, state);
  await writeTastePostgres(key, merged);
  await writeTasteFile(key, merged);
  await writeTasteCookie(key, merged);
}


/** ONLY this path deletes a row. Sign-out must never call this. Email key only. */
export async function deleteAccountTaste(email: string): Promise<void> {
  const key = normalizeTasteKey(email);
  if (!key) return;

  const pg = await ensureAccountTastesTable();
  if (pg) {
    await pg.query(`DELETE FROM account_tastes WHERE user_key = $1`, [key]);
  }
  try {
    await unlink(filePathFor(key));
  } catch {
    /* missing file is fine */
  }
  await deleteMailConsent(email);
  await clearAccountTasteCookie();
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
