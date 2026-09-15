/**
 * Site fetchers for the Connexion activity contract.
 * Live endpoints are not required — 401/404/network → empty, never fake RSVPs.
 *
 *   GET /api/share/activity/item/<itemKey>  → goingNames / envieNames (my tokens)
 *   GET /api/share/activity                 → inbox items + events
 *   POST /api/share/activity/seen           → optional lastSeen (404 OK)
 *
 * actorId = session email. 0 Matching A.
 */
import {
  parseActivityItemPayload,
  parseActivityListPayload,
  resolveLastSeen,
  writeClientLastSeen,
  type ActivityItemPayload,
  type ActivityListPayload,
} from '@/lib/shareActivity';

export const ACTIVITY_INBOX_PATH = '/api/share/activity';
export const ACTIVITY_ITEM_PATH = '/api/share/activity/item';
export const ACTIVITY_SEEN_PATH = '/api/share/activity/seen';

function emptyInbox(): ActivityListPayload {
  return { items: [] };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Missing / unauthorized Connexion → empty list. Do not invent rows. */
export async function fetchActivityInbox(
  limit = 30,
): Promise<ActivityListPayload> {
  try {
    const res = await fetch(`${ACTIVITY_INBOX_PATH}?limit=${limit}`, {
      credentials: 'same-origin',
    });
    if (res.status === 401 || res.status === 404 || !res.ok) {
      return emptyInbox();
    }
    const parsed = parseActivityListPayload(await readJson(res));
    return {
      items: parsed.items,
      lastSeen: resolveLastSeen(parsed.lastSeen ?? null) ?? undefined,
    };
  } catch {
    return emptyInbox();
  }
}

/** Missing / unauthorized / 0 tokens → null (omit sand). */
export async function fetchActivityItem(
  itemKey: string,
): Promise<ActivityItemPayload | null> {
  if (!itemKey) return null;
  try {
    const res = await fetch(
      `${ACTIVITY_ITEM_PATH}/${encodeURIComponent(itemKey)}`,
      { credentials: 'same-origin' },
    );
    if (res.status === 401 || res.status === 404 || !res.ok) return null;
    return parseActivityItemPayload(await readJson(res));
  } catch {
    return null;
  }
}

/** Marks lu. 404 → client lastSeen only. */
export async function markActivitySeen(): Promise<string> {
  const now = new Date().toISOString();
  writeClientLastSeen(now);
  try {
    const res = await fetch(ACTIVITY_SEEN_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return now;
    const data = (await readJson(res)) as { lastSeen?: unknown };
    if (typeof data?.lastSeen === 'string' && !Number.isNaN(Date.parse(data.lastSeen))) {
      writeClientLastSeen(data.lastSeen);
      return data.lastSeen;
    }
  } catch {
    /* client lastSeen still written */
  }
  return now;
}
