/**
 * Preview of the Connexion inbox contract. actorId = session email.
 * Reads real sharer tokens / RSVPs — 0 invented rows, 0 Matching A.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { sharerActivityInbox } from '@/lib/shareStore';
import { workIdForItemKey } from '@/lib/shareRsvpWork';
import { sessionSharerEmail } from '@/lib/shareToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return jsonError('Origine non autorisée', 403);
  }
  const session = await auth();
  const email = sessionSharerEmail(session?.user);
  if (!email) {
    return jsonError('Connecte-toi pour voir tes partages.', 401);
  }
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') || '30');
  const limit = Number.isFinite(rawLimit)
    ? Math.min(50, Math.max(1, Math.floor(rawLimit)))
    : 30;
  const { items, lastSeen } = await sharerActivityInbox({
    email,
    limit,
    groupKeyOf: (itemKey) => workIdForItemKey(itemKey) || itemKey,
  });
  return NextResponse.json(lastSeen ? { items, lastSeen } : { items });
}
