import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { motherStatsFromRsvps, viewerMotherKind } from '@/lib/shareRsvp';
import { emailHash, listEventRsvps } from '@/lib/shareStore';
import { workIdForItemKey } from '@/lib/shareRsvpWork';
import { sessionSharerEmail } from '@/lib/shareToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_KEYS = 24;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Batch mother RSVP stats — one auth + N listEventRsvps.
 * Body: { keys: string[] } (max 24).
 * Response: { results: { [itemKey]: { envie, going, mine } } }
 */
export async function POST(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return jsonError('Origine non autorisée', 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('JSON invalide', 400);
  }
  if (!body || typeof body !== 'object') {
    return jsonError('Corps invalide', 400);
  }
  const rawKeys = (body as { keys?: unknown }).keys;
  if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
    return jsonError('keys invalides', 400);
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawKeys) {
    if (typeof raw !== 'string') continue;
    const itemKey = normalizeDeepLinkId(raw);
    if (!itemKey || seen.has(itemKey)) continue;
    seen.add(itemKey);
    keys.push(itemKey);
    if (keys.length >= MAX_KEYS) break;
  }
  if (keys.length === 0) {
    return jsonError('keys invalides', 400);
  }

  const session = await auth();
  const email = sessionSharerEmail(session?.user);
  const viewerHash = email ? emailHash(email) : null;

  const results: Record<
    string,
    { envie: number; going: number; mine: 'envie' | 'going' | null }
  > = {};

  await Promise.all(
    keys.map(async (itemKey) => {
      const workId = workIdForItemKey(itemKey) || itemKey;
      const rsvps = await listEventRsvps({ itemKey, workId });
      const stats = motherStatsFromRsvps(rsvps);
      const mine = viewerHash
        ? viewerMotherKind(rsvps.filter((r) => r.emailHash === viewerHash))
        : null;
      results[itemKey] = { envie: stats.envie, going: stats.going, mine };
    }),
  );

  return NextResponse.json({ results });
}
