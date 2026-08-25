import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteAccountTaste } from '@/lib/accountTasteStore';

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
  return NextResponse.json({ ok: true });
}
