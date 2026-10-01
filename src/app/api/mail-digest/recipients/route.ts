import { NextResponse } from 'next/server';
import { bearerAuthorizesDigest, mailDigestSecrets } from '@/lib/mailDigest';
import { listDigestRecipients } from '@/lib/mailDigestRecipients';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  if (!bearerAuthorizesDigest(req.headers.get('authorization'), mailDigestSecrets())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: NO_STORE });
  }
  try {
    const users = await listDigestRecipients();
    return NextResponse.json({ count: users.length, users }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: 'Liste indisponible' },
      { status: 503, headers: NO_STORE },
    );
  }
}
