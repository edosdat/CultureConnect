import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { submitFeedback } from '@/lib/feedbackSubmit';
import { VID_COOKIE } from '@/lib/guestId';
import {
  clientIpFromRequest,
  isAllowedSignalOrigin,
  readCookieValue,
  resolveVidFromCookie,
} from '@/lib/guestSignals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/feedback
 * Short avis / idée. Session e-mail wins over `cc_vid` — the store keeps one.
 */
export async function POST(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  let text = '';
  try {
    const raw = await req.text();
    if (raw.length > 8_000) {
      return NextResponse.json({ error: 'Écris quelques mots.' }, { status: 400 });
    }
    const body = JSON.parse(raw) as { text?: unknown };
    text = typeof body.text === 'string' ? body.text : '';
  } catch {
    return NextResponse.json({ error: 'Écris quelques mots.' }, { status: 400 });
  }

  const session = await auth();
  const email =
    typeof session?.user?.email === 'string' ? session.user.email : null;
  const vid = resolveVidFromCookie(
    readCookieValue(req.headers.get('cookie'), VID_COOKIE),
  );
  const result = await submitFeedback({
    text,
    email,
    cookieVid: vid,
    ip: clientIpFromRequest(req),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ reply: result.reply });
}
