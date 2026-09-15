import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { writeActivityLastSeen } from '@/lib/shareStore';
import { sessionSharerEmail } from '@/lib/shareToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return jsonError('Origine non autorisée', 403);
  }
  const session = await auth();
  const email = sessionSharerEmail(session?.user);
  if (!email) {
    return jsonError('Connecte-toi pour voir tes partages.', 401);
  }
  const lastSeen = await writeActivityLastSeen(email);
  return NextResponse.json({ lastSeen });
}
