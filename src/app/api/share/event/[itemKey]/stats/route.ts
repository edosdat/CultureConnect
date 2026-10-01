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

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ itemKey: string }> },
) {
  if (!isAllowedSignalOrigin(req)) {
    return jsonError('Origine non autorisée', 403);
  }
  const { itemKey: raw } = await params;
  const itemKey = normalizeDeepLinkId(decodeURIComponent(raw || ''));
  if (!itemKey) {
    return jsonError('itemKey invalide', 400);
  }
  const workId = workIdForItemKey(itemKey) || itemKey;
  // One Neon/KV read (avoid a second list for counters + mine).
  const rsvps = await listEventRsvps({ itemKey, workId });
  const stats = motherStatsFromRsvps(rsvps);
  const session = await auth();
  const email = sessionSharerEmail(session?.user);
  const mine = email
    ? viewerMotherKind(rsvps.filter((r) => r.emailHash === emailHash(email)))
    : null;
  return NextResponse.json({ envie: stats.envie, going: stats.going, mine });
}
