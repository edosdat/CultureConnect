/**
 * GET /api/share/activity/teaser?tokens=&since=
 * Guest bell: `{ count }` only. 0 first names, 0 envie/going split.
 * Auth: none. Origin: isAllowedSignalOrigin.
 */
import { NextResponse } from 'next/server';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';
import { guestActivityTeaserCount } from '@/lib/shareStore';
import { parseGuestCreatedTokens } from '@/lib/guestShareTeaser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_CAP = 20;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function parseSince(raw: string | null): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export async function GET(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return jsonError('Origine non autorisée', 403);
  }
  const url = new URL(req.url);
  const rawTokens = (url.searchParams.get('tokens') || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (rawTokens.length === 0 || rawTokens.length > TOKEN_CAP) {
    return NextResponse.json({ count: 0 });
  }
  const tokens = parseGuestCreatedTokens(rawTokens);
  if (tokens.length === 0) {
    return NextResponse.json({ count: 0 });
  }
  const count = await guestActivityTeaserCount(
    tokens,
    parseSince(url.searchParams.get('since')),
  );
  return NextResponse.json({ count });
}
