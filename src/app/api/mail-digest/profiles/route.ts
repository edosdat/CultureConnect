import { NextResponse } from 'next/server';
import { bearerAuthorizesDigest, mailDigestSecrets } from '@/lib/mailDigest';
import { listDigestProfiles } from '@/lib/mailDigestRecipients';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  if (!bearerAuthorizesDigest(req.headers.get('authorization'), mailDigestSecrets())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: NO_STORE });
  }
  try {
    const users = await listDigestProfiles();
    return NextResponse.json({ count: users.length, users }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: 'Profils indisponibles' },
      { status: 503, headers: NO_STORE },
    );
  }
}
