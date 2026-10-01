import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/adminGate';
import {
  applyColdResetCookieDeletes,
  coldResetCookieDeletes,
  coldResetSecureFlag,
} from '@/lib/coldReset';
import { isAllowedSignalOrigin } from '@/lib/guestSignals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

/**
 * POST /api/admin/cold-reset — admin session only.
 * Expires Plan C cookies. Does not read `cc_vid`, does not write Neon,
 * does not purge KV `cc:vs:*`, does not mint a new visitor id.
 * Call this while the admin session is still valid, then `signOut`.
 * Anyone else → 404.
 */
export async function POST(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return NextResponse.json(
      { error: 'Origine non autorisée' },
      { status: 403, headers: PRIVATE },
    );
  }
  if (!(await isAdminSession())) {
    return new NextResponse(null, { status: 404, headers: PRIVATE });
  }

  const names = coldResetCookieDeletes().map((cookie) => cookie.name);
  const res = NextResponse.json(
    {
      ok: true,
      cold: 'client',
      kv: 'cc:vs:* untouched',
      cookies: names,
    },
    { headers: PRIVATE },
  );
  applyColdResetCookieDeletes(res.cookies, coldResetSecureFlag());
  return res;
}
