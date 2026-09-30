import { NextResponse } from 'next/server';
import {
  COHORT_COOKIE,
  VID_COOKIE,
  clientIpFromRequest,
  isAllowedSignalOrigin,
  payloadExceedsLimit,
  readCookieValue,
  resolveVidFromCookie,
  vidCookieOptions,
} from '@/lib/guestSignals';
import { commitImpression } from '@/lib/impressionStore';
import {
  IMPRESSION_PAYLOAD_MAX_BYTES,
  validateImpressionClientPayload,
} from '@/lib/impressions';
import {
  SIGNALS_CONSENT_COOKIE,
  parseSignalsConsent,
} from '@/lib/signalsConsent';

/**
 * P2 — List impression append.
 * Consent gate = P8 (`cc_signals_consent=accepted`). Refuse / undecided → 204, no persist.
 * Storage = dedicated KV `cc:imp:${vid}` (never `cc_signals_v1` / `cc:vs:*`).
 */
export async function POST(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  if (payloadExceedsLimit(rawText) || rawText.length > IMPRESSION_PAYLOAD_MAX_BYTES) {
    return NextResponse.json(
      { error: 'Payload trop volumineux' },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const payload = validateImpressionClientPayload(body);
  if (!payload) {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }

  const cookieHeader = req.headers.get('cookie');
  const consent = parseSignalsConsent(
    readCookieValue(cookieHeader, SIGNALS_CONSENT_COOKIE),
  );
  if (consent !== 'accepted') {
    // Same gate as P8 taste tracer: no persist without accept.
    return new NextResponse(null, { status: 204 });
  }

  const cookieVid = resolveVidFromCookie(
    readCookieValue(cookieHeader, VID_COOKIE),
  );
  const ip = clientIpFromRequest(req);
  // cohort cookie read kept for parity / future; not on impression schema.
  void readCookieValue(cookieHeader, COHORT_COOKIE);

  const result = await commitImpression({
    payload,
    cookieVid,
    ip,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const res = NextResponse.json({ ok: true, vid: result.vid });
  if (result.created) {
    res.cookies.set(VID_COOKIE, result.vid, vidCookieOptions());
  }
  return res;
}
