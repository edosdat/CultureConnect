import { NextResponse } from 'next/server';
import { bearerAuthorizesDigest } from '@/lib/mailDigest';
import { purgeExpiredFeedback } from '@/lib/feedbackStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

/**
 * Daily TTL purge for `feedback_notes` (90 days).
 * Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`
 * (`vercel.json`). Wrong or missing secret → 401.
 * Submit and the admin list also purge. If the cron misses and nobody
 * writes or opens the admin list, an expired row can sit until the next run.
 */
export async function GET(req: Request) {
  const secret = (process.env['CRON_SECRET'] || '').trim();
  if (!bearerAuthorizesDigest(req.headers.get('authorization'), secret ? [secret] : [])) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: NO_STORE });
  }
  try {
    const deleted = await purgeExpiredFeedback();
    return NextResponse.json({ ok: true, deleted }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: 'Purge indisponible' },
      { status: 503, headers: NO_STORE },
    );
  }
}
