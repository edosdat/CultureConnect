import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { resolveProposalActor } from '@/lib/eventProposal';
import { confirmEventProposal } from '@/lib/eventProposalStore';
import { VID_COOKIE } from '@/lib/guestId';
import {
  isAllowedSignalOrigin,
  readCookieValue,
  resolveVidFromCookie,
} from '@/lib/guestSignals';
import { hasAuthSessionCookie, sessionSharerEmail } from '@/lib/shareToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/propose-event/:id/confirm
 * Confirm or decline a catalogue candidate. Does not write the live catalogue.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAllowedSignalOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const cookieHeader = req.headers.get('cookie');
  let sessionEmail: string | null = null;
  if (hasAuthSessionCookie(cookieHeader)) {
    const session = await auth();
    sessionEmail = sessionSharerEmail(session?.user);
  }
  const actor = resolveProposalActor({
    sessionEmail,
    cookieVid: resolveVidFromCookie(readCookieValue(cookieHeader, VID_COOKIE)),
  });
  if (!actor) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const email = actor.owner;
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const accept = Boolean(
    body &&
      typeof body === 'object' &&
      (body as { accept?: unknown }).accept === true,
  );
  const result = await confirmEventProposal(email, id, accept);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body);
}
