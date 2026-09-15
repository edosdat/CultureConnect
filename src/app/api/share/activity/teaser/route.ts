/**
 * GET /api/share/activity/teaser?tokens=
 * Guest bell: `{ count }` only. 0 first names, 0 envie/going split.
 */
import { NextResponse } from 'next/server';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { guestActivityTeaserCount } from '@/lib/shareStore';
import { parseGuestCreatedTokens } from '@/lib/guestShareTeaser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return jsonError('Origine non autorisée', 403);
  }
  const url = new URL(req.url);
  const tokens = parseGuestCreatedTokens(
    (url.searchParams.get('tokens') || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  ).slice(0, 30);
  const count = await guestActivityTeaserCount(tokens);
  return NextResponse.json({ count });
}
