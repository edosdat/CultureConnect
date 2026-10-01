import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteAccountTaste } from '@/lib/accountTasteStore';
import { deleteEventProposals } from '@/lib/eventProposalStore';
import { deleteFeedbackForEmail } from '@/lib/feedbackStore';

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const email = session.user.email;
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email requis' }, { status: 400 });
  }

  await deleteAccountTaste(email);
  await deleteEventProposals(email);
  await deleteFeedbackForEmail(email);
  return NextResponse.json({ ok: true });
}
