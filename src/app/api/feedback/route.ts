import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  IMAGE_TOO_HEAVY,
} from '@/lib/feedbackImage';
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
  let kind: unknown;
  let image: Uint8Array | null = null;
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const declared = Number(req.headers.get('content-length') || 0);
      if (Number.isFinite(declared) && declared > FEEDBACK_IMAGE_MAX_BYTES + 64_000) {
        return NextResponse.json({ error: IMAGE_TOO_HEAVY }, { status: 413 });
      }
      const form = await req.formData();
      const rawText = form.get('text');
      text = typeof rawText === 'string' ? rawText : '';
      kind = form.get('kind');
      const file = form.get('image');
      if (file instanceof File && file.size > 0) {
        if (file.size > FEEDBACK_IMAGE_MAX_BYTES) {
          return NextResponse.json({ error: IMAGE_TOO_HEAVY }, { status: 413 });
        }
        image = new Uint8Array(await file.arrayBuffer());
      }
    } else {
      const raw = await req.text();
      if (raw.length > 8_000) {
        return NextResponse.json({ error: 'Écris quelques mots.' }, { status: 400 });
      }
      const body = JSON.parse(raw) as { text?: unknown; kind?: unknown };
      text = typeof body.text === 'string' ? body.text : '';
      kind = body.kind;
    }
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
    kind,
    image,
    email,
    cookieVid: vid,
    ip: clientIpFromRequest(req),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ reply: result.reply });
}
