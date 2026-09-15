/**
 * Site fetchers for the Connexion B3b.7 activity contract.
 * Live store is not required — 401/404/network → empty, never fake RSVPs.
 *
 *   GET  /api/share/activity/item/<itemKey>  → { goingNames, envieNames }
 *   GET  /api/share/activity                 → { lastSeenAt, unreadCount, items }
 *   POST /api/share/activity/seen            → { scope: "all"|"token", token? }
 *                                         ← { ok, unreadCount }
 *
 * actorId = session email. Unread = RSVP only. 0 Matching A.
 */
import {
  emptyActivityInbox,
  parseActivityItemPayload,
  parseActivityListPayload,
  parseActivitySeenPayload,
  writeClientLastSeen,
  type ActivityItemPayload,
  type ActivityListPayload,
  type ActivitySeenBody,
  type ActivitySeenPayload,
} from '@/lib/shareActivity';

export const ACTIVITY_INBOX_PATH = '/api/share/activity';
export const ACTIVITY_ITEM_PATH = '/api/share/activity/item';
export const ACTIVITY_SEEN_PATH = '/api/share/activity/seen';

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
      return emptyActivityInbox();
    }
    return parseActivityListPayload(await readJson(res));
  } catch {
    return emptyActivityInbox();
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

/**
 * Marks lu. 404 → optimistic unreadCount (all → 0, token → leave to caller).
 */
export async function markActivitySeen(
  body: ActivitySeenBody,
): Promise<ActivitySeenPayload> {
  writeClientLastSeen(new Date().toISOString());
  try {
    const res = await fetch(ACTIVITY_SEEN_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 404 || !res.ok) {
      return { ok: true, unreadCount: body.scope === 'all' ? 0 : -1 };
    }
    return (
      parseActivitySeenPayload(await readJson(res)) ?? {
        ok: true,
        unreadCount: body.scope === 'all' ? 0 : -1,
      }
    );
  } catch {
    return { ok: true, unreadCount: body.scope === 'all' ? 0 : -1 };
  }
}
