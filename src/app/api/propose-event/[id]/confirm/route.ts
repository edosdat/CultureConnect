import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { confirmEventProposal } from '@/lib/eventProposalStore';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { sessionSharerEmail } from '@/lib/shareToken';

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
  const session = await auth();
  const email = sessionSharerEmail(session?.user);
  if (!session?.user || !email) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
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
