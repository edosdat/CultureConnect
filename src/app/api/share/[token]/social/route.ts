import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { emailHash, tokenSocialPayload } from '@/lib/shareStore';
import { isShareToken, normalizeShareToken, sessionSharerEmail } from '@/lib/shareToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isAllowedSignalOrigin(req)) {
    return jsonError('Origine non autorisée', 403);
  }
  const { token: raw } = await params;
  const token = normalizeShareToken(raw);
  if (!token || !isShareToken(token)) {
    return jsonError('token invalide', 400);
  }
  const session = await auth();
  const email = sessionSharerEmail(session?.user);
  const payload = await tokenSocialPayload({
    token,
    viewerEmailHash: email ? emailHash(email) : null,
  });
  if (!payload) {
    return jsonError('Lien introuvable', 404);
  }
  return NextResponse.json(payload);
}
