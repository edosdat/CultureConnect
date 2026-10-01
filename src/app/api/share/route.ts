import { after, NextResponse } from 'next/server';
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
  seedSharerEnvie,
  toggleShareRsvp,
  toggleViewerEventRsvp,
} from '@/lib/shareStore';
import {
  firstNameFromDisplayName,
  isRsvpKind,
  RSVP_LOGIN_ERROR,
  type RsvpKind,
} from '@/lib/shareRsvp';
import { workIdForItemKey } from '@/lib/shareRsvpWork';
import {
  hasAuthSessionCookie,
  isShareToken,
  normalizeSeanceKey,
  normalizeShareToken,
  requestOrigin,
  sessionSharerEmail,
  shareCreateItemKey,
} from '@/lib/shareToken';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import { publicAppOrigin, scheduleShareOgWarm } from '@/lib/sharePreviewImage';

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
  const cookieHeader = req.headers.get('cookie');
  const ip = clientIpFromRequest(req);
  // Guest create has no session cookie. `auth()` would still decode and
  // hydrate tastes before we can return `{token,url}`.
  const session =
    incoming.kind === 'created' && !hasAuthSessionCookie(cookieHeader)
      ? null
      : await auth();
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
    const firstName = firstNameFromDisplayName(
      typeof session?.user?.name === 'string' ? session.user.name : '',
    );
    // Rate-limit and the token claim are independent Redis calls. Run them
    // together so the guest POST waits for one round trip, not two.
    const [limited, created] = await Promise.all([
      isShareCreateRateLimited({ ip, email: sharerEmail }),
      createShareToken({
        itemKey,
        seanceKey,
        sharerEmail,
        origin: requestOrigin(req),
        firstName,
        skipSharerSeed: true,
      }),
    ]);
    if (limited) return jsonError('Too many requests', 429);
    if (!created) return jsonError('Création impossible', 500);
    scheduleShareOgWarm(requestOrigin(req) || publicAppOrigin(), itemKey);
    const createdToken = created.token;
    const tasteUser = session?.user;
    // Seed, Matching A ingest, and the JWT refresh must not sit on the POST.
    // `after` keeps them alive once `{token,url}` is on the wire.
    after(async () => {
      if (sharerEmail) {
        try {
          await seedSharerEnvie({
            token: createdToken,
            itemKey,
            email: sharerEmail,
            firstName,
          });
        } catch {
          /* token is already stored */
        }
      }
      if (!tasteUser) return;
      try {
        const tasteState = await ingestAccountItemSignal({
          user: tasteUser,
          payload: trackPayloadForItemKey(itemKey, 'share'),
        });
        await unstable_update({
          user: {
            tastes: tasteState.tastesText ?? '',
            tastesSetAt: tasteState.tastesSetAt,
            tasteState,
          },
          tasteState,
        } as never);
      } catch {
        /* account row is the durable copy; cookie refresh is best-effort */
      }
    });
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
    const rawToken = typeof incoming.token === 'string' ? incoming.token.trim() : '';
    const itemKey = normalizeDeepLinkId(
      typeof incoming.itemKey === 'string' ? incoming.itemKey : '',
    );

    // Mother fiche: no `?t=`. Same RSVP rows, anchor token is not a share.
    if (!rawToken) {
      if (!itemKey) return jsonError('itemKey invalide', 400);
      if (!session?.user || !sharerEmail) {
        return NextResponse.json({ error: RSVP_LOGIN_ERROR, login: true }, { status: 401 });
      }
      if (await isShareRsvpRateLimited({ ip, email: sharerEmail })) {
        return jsonError('Too many requests', 429);
      }
      const firstName = firstNameFromDisplayName(
        typeof session.user.name === 'string' ? session.user.name : '',
      );
      const viewer = await toggleViewerEventRsvp({
        email: sharerEmail,
        firstName,
        itemKey,
        workId: workIdForItemKey(itemKey) || itemKey,
        kind,
        origin: requestOrigin(req),
      });
      if (!viewer.ok) {
        if (viewer.error === 'rate') return jsonError('Too many requests', 429);
        if (viewer.error === 'invalid') return jsonError('itemKey invalide', 400);
        return jsonError('Création impossible', 500);
      }
      return NextResponse.json({
        ok: true,
        kind: viewer.kind,
        envie: viewer.envie,
        going: viewer.going,
      });
    }

    const token = normalizeShareToken(rawToken);
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
