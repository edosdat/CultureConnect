import { NextResponse } from 'next/server';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { eventRsvpStats } from '@/lib/shareStore';
import { workIdForItemKey } from '@/lib/shareRsvpWork';

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
  const stats = await eventRsvpStats({ itemKey, workId });
  return NextResponse.json({ envie: stats.envie, going: stats.going });
}
