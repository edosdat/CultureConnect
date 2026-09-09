import { NextResponse } from 'next/server';
import { toPublicProposal } from '@/lib/eventProposal';
import { requireProposalEmail } from '@/lib/proposeEventServer';
import { listMineProposals } from '@/lib/eventProposalStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const authz = await requireProposalEmail();
  if ('error' in authz) return authz.error;
  const rows = await listMineProposals(authz.email);
  return NextResponse.json({
    proposals: rows.map(toPublicProposal),
  });
}
