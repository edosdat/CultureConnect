/**
 * Preview of POST /api/share/activity/seen
 * { scope: "all" | "token", token? } → { ok, unreadCount }
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { isShareToken, normalizeShareToken, sessionSharerEmail } from '@/lib/shareToken';
import { markSharerActivitySeen } from '@/lib/shareStore';

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
  let body: { scope?: unknown; token?: unknown } = {};
  try {
    body = (await req.json()) as { scope?: unknown; token?: unknown };
  } catch {
    body = {};
  }
  const scope = body.scope === 'token' ? 'token' : 'all';
  const token = normalizeShareToken(
    typeof body.token === 'string' ? body.token : '',
  );
  if (scope === 'token' && (!token || !isShareToken(token))) {
    return jsonError('token invalide', 400);
  }
  return NextResponse.json(
    await markSharerActivitySeen({
      email,
      scope,
      token: token ?? undefined,
    }),
  );
}
