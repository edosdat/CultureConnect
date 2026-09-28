import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { loadCultureData } from '@/lib/data';
import { buildProposalCandidates } from '@/lib/eventProposal';
import { submitEventProposal } from '@/lib/eventProposalStore';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { sessionSharerEmail } from '@/lib/shareToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/propose-event
 * Session Google only. Inserts a pending Neon row. Never writes programme.csv.
 */
export async function POST(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const session = await auth();
  const email = sessionSharerEmail(session?.user);
  if (!session?.user || !email) {
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
  const result = await submitEventProposal(email, body, {
    candidates: buildProposalCandidates(data.programmeWithContext),
    lieux,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body);
}
