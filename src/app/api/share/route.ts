import { NextResponse } from 'next/server';
import { auth, unstable_update } from '@/auth';
import {
  COHORT_COOKIE,
  VID_COOKIE,
  clientIpFromRequest,
  isAllowedSignalOrigin,
  readCookieValue,
  resolveVidFromCookie,
  vidCookieOptions,
} from '@/lib/guestSignals';
import { commitGuestSignals } from '@/lib/guestSignalStore';
import { makeSignal, type AccountTasteState } from '@/lib/signals';
import { ingestAccountItemSignal, trackPayloadForItemKey } from '@/lib/shareIngest';
import {
  createShareToken,
  emailHash,
  isShareCreateRateLimited,
  isShareRsvpRateLimited,
  logShareOrphan,
  readShareToken,
  recordShareVisit,
  toggleShareRsvp,
} from '@/lib/shareStore';
import {
  firstNameFromDisplayName,
  isRsvpKind,
  RSVP_LOGIN_ERROR,
  type RsvpKind,
} from '@/lib/shareRsvp';
import { workIdForItemKey } from '@/lib/shareRsvpWork';
import {
  isShareToken,
  normalizeSeanceKey,
  normalizeShareToken,
  requestOrigin,
  sessionSharerEmail,
  shareCreateItemKey,
} from '@/lib/shareToken';
import { normalizeDeepLinkId } from '@/lib/deepLink';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function withTasteUpdate(
  res: NextResponse,
  tasteState: AccountTasteState,
): Promise<NextResponse> {
  await unstable_update({
    user: {
      tastes: tasteState.tastesText ?? '',
      tastesSetAt: tasteState.tastesSetAt,
      tasteState,
    },
    tasteState,
  } as never);
  return res;
}

function visitBody(record: { itemKey: string; seanceKey?: string }) {
  const body: { ok: true; itemKey: string; seanceKey?: string } = {
    ok: true,
    itemKey: record.itemKey,
  };
  if (record.seanceKey) body.seanceKey = record.seanceKey;
  return body;
}

export async function POST(req: Request) {
  if (!isAllowedSignalOrigin(req)) {
    return jsonError('Origine non autorisée', 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('JSON invalide', 400);
  }
  if (!body || typeof body !== 'object') {
    return jsonError('Corps invalide', 400);
  }

  const incoming = body as {
    kind?: unknown;
    itemKey?: unknown;
    seanceKey?: unknown;
    token?: unknown;
  };
  const session = await auth();
  const cookieHeader = req.headers.get('cookie');
  const ip = clientIpFromRequest(req);
  const sharerEmail = sessionSharerEmail(session?.user);

  if (incoming.kind === 'created') {
    const seanceKey = normalizeSeanceKey(
      typeof incoming.seanceKey === 'string' ? incoming.seanceKey : '',
    );
    const itemKey = shareCreateItemKey(
      typeof incoming.itemKey === 'string' ? incoming.itemKey : '',
      seanceKey,
    );
    if (!itemKey) return jsonError('itemKey invalide', 400);
    if (await isShareCreateRateLimited({ ip, email: sharerEmail })) {
      return jsonError('Too many requests', 429);
    }
    const created = await createShareToken({
      itemKey,
      seanceKey,
      sharerEmail,
      origin: requestOrigin(req),
    });
    if (!created) return jsonError('Création impossible', 500);

    if (session?.user) {
      const tasteState = await ingestAccountItemSignal({
        user: session.user,
        payload: trackPayloadForItemKey(itemKey, 'share'),
      });
      return withTasteUpdate(NextResponse.json(created), tasteState);
    }
    return NextResponse.json(created);
  }

  if (incoming.kind === 'visit') {
    const token = normalizeShareToken(
      typeof incoming.token === 'string' ? incoming.token : '',
    );
    if (!token || !isShareToken(token)) {
      logShareOrphan(typeof incoming.token === 'string' ? incoming.token : '');
      return new NextResponse(null, { status: 204 });
    }
    const record = await readShareToken(token);
    if (!record) {
      logShareOrphan(token);
      return new NextResponse(null, { status: 204 });
    }

    const signalKey = record.seanceKey || record.itemKey;
    const payload = trackPayloadForItemKey(signalKey, 'open_shared');

    if (session?.user && sharerEmail) {
      await recordShareVisit({
        token,
        visit: {
          ts: new Date().toISOString(),
          token,
          emailHash: emailHash(sharerEmail),
        },
      });
      const tasteState = await ingestAccountItemSignal({
        user: session.user,
        payload,
      });
      return withTasteUpdate(NextResponse.json(visitBody(record)), tasteState);
    }

    const committed = await commitGuestSignals({
      signals: [makeSignal(payload)],
      cookieVid: resolveVidFromCookie(readCookieValue(cookieHeader, VID_COOKIE)),
      cohortCookie: readCookieValue(cookieHeader, COHORT_COOKIE),
      ip,
    });
    if (!committed.ok) {
      return jsonError(committed.error, committed.status);
    }
    await recordShareVisit({
      token,
      visit: {
        ts: new Date().toISOString(),
        token,
        vid: committed.vid,
      },
    });
    const res = NextResponse.json(visitBody(record));
    if (committed.created) {
      res.cookies.set(VID_COOKIE, committed.vid, vidCookieOptions());
    }
    return res;
  }

  if (isRsvpKind(incoming.kind)) {
    const kind = incoming.kind as RsvpKind;
    const token = normalizeShareToken(
      typeof incoming.token === 'string' ? incoming.token : '',
    );
    const itemKey = normalizeDeepLinkId(
      typeof incoming.itemKey === 'string' ? incoming.itemKey : '',
    );
    if (!token || !isShareToken(token)) {
      return jsonError('token invalide', 400);
    }
    if (!itemKey) return jsonError('itemKey invalide', 400);
    if (!session?.user || !sharerEmail) {
      return NextResponse.json({ error: RSVP_LOGIN_ERROR, login: true }, { status: 401 });
    }
    const record = await readShareToken(token);
    if (!record) return jsonError('Lien introuvable', 404);
    if (await isShareRsvpRateLimited({ ip, email: sharerEmail })) {
      return jsonError('Too many requests', 429);
    }
    const firstName = firstNameFromDisplayName(
      typeof session.user.name === 'string' ? session.user.name : '',
    );
    const result = await toggleShareRsvp({
      token,
      itemKey,
      workId: workIdForItemKey(record.itemKey || itemKey),
      emailHash: emailHash(sharerEmail),
      firstName,
      kind,
    });
    return NextResponse.json({
      ok: true,
      kind: result.kind,
      envie: result.rsvps.filter((r) => r.kind === 'envie').length,
      going: result.rsvps.filter((r) => r.kind === 'going').length,
    });
  }

  return jsonError('kind invalide', 400);
}
