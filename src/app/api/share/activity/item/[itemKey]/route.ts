/**
 * Preview of GET /api/share/activity/item/<itemKey>.
 * Names only for tokens owned by session email. 0 invented RSVPs.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { sharerActivityItem } from '@/lib/shareStore';
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
  const session = await auth();
  const email = sessionSharerEmail(session?.user);
  if (!email) {
    return jsonError('Connecte-toi pour voir tes partages.', 401);
  }
  const { itemKey: raw } = await params;
  const itemKey = normalizeDeepLinkId(decodeURIComponent(raw || ''));
  if (!itemKey) {
    return jsonError('itemKey invalide', 400);
  }
  const workId = workIdForItemKey(itemKey) || itemKey;
  const payload = await sharerActivityItem({
    email,
    itemKey,
    matchesToken: (token) =>
      token.itemKey === itemKey ||
      (workIdForItemKey(token.itemKey) || token.itemKey) === workId,
  });
  const body: { itemKey: string; goingNames?: string[]; envieNames?: string[] } = {
    itemKey: payload.itemKey || itemKey,
  };
  if (payload.goingNames?.length) body.goingNames = payload.goingNames;
  if (payload.envieNames?.length) body.envieNames = payload.envieNames;
  return NextResponse.json(body);
}
