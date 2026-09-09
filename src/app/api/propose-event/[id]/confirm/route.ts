import { NextResponse } from 'next/server';
import { nextStatusAfterConfirm, toPublicProposal } from '@/lib/eventProposal';
import { requireProposalEmail } from '@/lib/proposeEventServer';
import {
  getEventProposal,
  updateEventProposal,
} from '@/lib/eventProposalStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authz = await requireProposalEmail();
  if ('error' in authz) return authz.error;

  const { id } = await params;
  const row = await getEventProposal(id || '');
  if (!row || row.submitter_email !== authz.email) {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  }
  if (row.status !== 'matched_candidate') {
    return NextResponse.json(
      { error: 'Confirmation indisponible', proposal: toPublicProposal(row) },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const accept =
    typeof body === 'object' &&
    body !== null &&
    (body as { accept?: unknown }).accept === true;

  const next = nextStatusAfterConfirm({
    accept,
    url_prog_candidate: row.url_prog_candidate,
  });
  const updated = await updateEventProposal(row.id, { status: next.status });
  if (!updated) {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  }

  return NextResponse.json({
    proposal: toPublicProposal(updated),
    match: null,
    enqueued: next.enqueue,
  });
}
