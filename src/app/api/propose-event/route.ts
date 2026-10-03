import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { loadCultureData } from '@/lib/data';
import {
  buildProposalCandidates,
  resolveProposalActor,
} from '@/lib/eventProposal';
import { submitEventProposal } from '@/lib/eventProposalStore';
import { generateVid, VID_COOKIE, vidCookieOptions } from '@/lib/guestId';
import {
  isAllowedSignalOrigin,
  readCookieValue,
  resolveVidFromCookie,
} from '@/lib/guestSignals';
import { hasAuthSessionCookie, sessionSharerEmail } from '@/lib/shareToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function withGuestCookie(res: NextResponse, vidToSet: string | null): NextResponse {
  if (vidToSet) res.cookies.set(VID_COOKIE, vidToSet, vidCookieOptions());
  return res;
}

/**
 * POST /api/propose-event
 * Signed-in Google e-mail, or a guest device key. Inserts a pending Neon row.
 * Never writes programme.csv. A guest row is not joined to an e-mail.
 */
export async function POST(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const cookieHeader = req.headers.get('cookie');
  let sessionEmail: string | null = null;
  if (hasAuthSessionCookie(cookieHeader)) {
    const session = await auth();
    sessionEmail = sessionSharerEmail(session?.user);
  }
  const cookieVid = resolveVidFromCookie(readCookieValue(cookieHeader, VID_COOKIE));
  const mintedVid = sessionEmail || cookieVid ? null : generateVid();
  const actor = resolveProposalActor({ sessionEmail, cookieVid, mintedVid });
  if (!actor) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const data = loadCultureData();
  const lieux = [...data.lieuxById.values()].map((lieu) => ({
    id: lieu.lieu_id,
    name: lieu.nom,
  }));
  const result = await submitEventProposal(actor.owner, body, {
    candidates: buildProposalCandidates(data.programmeWithContext),
    lieux,
  });
  if (!result.ok) {
    return withGuestCookie(
      NextResponse.json({ error: result.error }, { status: result.status }),
      actor.vidToSet,
    );
  }
  return withGuestCookie(NextResponse.json(result.body), actor.vidToSet);
}
