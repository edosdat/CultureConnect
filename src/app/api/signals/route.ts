import { NextResponse } from 'next/server';
import { auth, unstable_update } from '@/auth';
import {
  hasPersistedTasteState,
  readAccountTaste,
  writeAccountTaste,
} from '@/lib/accountTasteStore';
import {
  COHORT_COOKIE,
  GUEST_ID_COOKIE,
  clientIpFromRequest,
  guestIdCookieOptions,
  isAllowedSignalOrigin,
  itemIdsOutOfBounds,
  payloadExceedsLimit,
  readCookieValue,
  resolveGuestIdFromCookie,
} from '@/lib/guestSignals';
import {
  commitGuestSignals,
  isSignalRateLimited,
  mirrorAuthedSignals,
} from '@/lib/guestSignalStore';
import {
  ACCOUNT_CAP,
  coerceProfile,
  commitTasteSignals,
  concatTastesText,
  ingestMapSignal,
  isKnownSignalKind,
  makeSignal,
  parseTasteState,
  rebuildTasteState,
  resolveLoginMerge,
  wipeProfileKey,
  type AccountTasteState,
  type ProfileBucket,
  type Signal,
  type TasteProfile,
  type TrackPayload,
} from '@/lib/signals';

function isTrackPayload(v: unknown): v is TrackPayload {
  return Boolean(
    v &&
      typeof v === 'object' &&
      typeof (v as TrackPayload).kind === 'string' &&
      isKnownSignalKind((v as TrackPayload).kind),
  );
}

function isSignalLike(v: unknown): v is Signal {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<Signal>;
  return (
    typeof s.kind === 'string' &&
    isKnownSignalKind(s.kind) &&
    typeof s.weight === 'number' &&
    Array.isArray(s.genres) &&
    Array.isArray(s.moods)
  );
}

function isWipe(
  v: unknown,
): v is { bucket: ProfileBucket; key: string } {
  if (!v || typeof v !== 'object') return false;
  const o = v as { bucket?: unknown; key?: unknown };
  return (
    (o.bucket === 'cats' || o.bucket === 'genres' || o.bucket === 'moods' || o.bucket === 'themes') &&
    typeof o.key === 'string' &&
    o.key.trim().length > 0
  );
}

function parseIncomingProfile(raw: unknown): TasteProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  return coerceProfile(raw);
}

function normalizeIncomingSignal(raw: Signal | TrackPayload): Signal {
  if (
    'id' in raw &&
    typeof raw.id === 'string' &&
    'ts' in raw &&
    typeof raw.ts === 'string' &&
    typeof raw.weight === 'number'
  ) {
    return ingestMapSignal({
      ...raw,
      genres: raw.genres ?? [],
      moods: raw.moods ?? [],
    } as Signal);
  }
  return makeSignal(raw);
}

function stateFromTokenUser(user: {
  tasteState?: AccountTasteState;
  tastes?: string;
  tastesSetAt?: string;
}): AccountTasteState {
  const parsed = parseTasteState(user.tasteState);
  if (parsed) {
    if (!parsed.tastesText && user.tastes) {
      parsed.tastesText = user.tastes;
      parsed.tastesSetAt = user.tastesSetAt ?? parsed.tastesSetAt;
      parsed.profile = rebuildTasteState(
        parsed.signalsRecent,
        parsed.tastesText,
        parsed.tastesSetAt,
        ACCOUNT_CAP,
        parsed.profile,
      ).profile;
    }
    return parsed;
  }
  const tastes = (user.tastes || '').trim();
  return rebuildTasteState([], tastes || undefined, user.tastesSetAt);
}

function collectIncomingSignals(incoming: {
  signal?: unknown;
  signals?: unknown;
}): Signal[] {
  const incomingSignals: Signal[] = [];
  if (Array.isArray(incoming.signals)) {
    incomingSignals.push(
      ...incoming.signals.filter(isSignalLike).map(normalizeIncomingSignal),
    );
  } else if (
    incoming.signal &&
    (isSignalLike(incoming.signal) || isTrackPayload(incoming.signal))
  ) {
    incomingSignals.push(
      normalizeIncomingSignal(incoming.signal as Signal | TrackPayload),
    );
  }
  return incomingSignals;
}

function guestCookieResponse(guestId: string): NextResponse {
  const res = NextResponse.json({ ok: true, guestId });
  res.cookies.set(GUEST_ID_COOKIE, guestId, guestIdCookieOptions());
  return res;
}

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

  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }

  const incoming = body as {
    signal?: unknown;
    signals?: unknown;
    merge?: unknown;
    tastesText?: unknown;
    wipe?: unknown;
    guestProfile?: unknown;
  };
  const isMerge = incoming.merge === true;

  if (!isMerge && payloadExceedsLimit(rawText)) {
    return NextResponse.json(
      { error: 'Payload trop volumineux' },
      { status: 413 },
    );
  }

  const incomingSignals = collectIncomingSignals(incoming);
  if (incomingSignals.some(itemIdsOutOfBounds)) {
    return NextResponse.json({ error: 'Identifiant trop long' }, { status: 400 });
  }

  const session = await auth();
  const cookieHeader = req.headers.get('cookie');
  const cohortCookie = readCookieValue(cookieHeader, COHORT_COOKIE);
  const ip = clientIpFromRequest(req);

  if (!session?.user) {
    const extraText =
      typeof incoming.tastesText === 'string' ? incoming.tastesText : undefined;
    const wipe = isWipe(incoming.wipe);
    const accountOnly = isMerge || wipe || Boolean((extraText || '').trim());
    if (accountOnly && incomingSignals.length === 0) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    if (incomingSignals.length === 0) {
      return NextResponse.json(
        { error: 'signal ou signals requis' },
        { status: 400 },
      );
    }

    const committed = await commitGuestSignals({
      signals: incomingSignals,
      cookieGuestId: resolveGuestIdFromCookie(
        readCookieValue(cookieHeader, GUEST_ID_COOKIE),
      ),
      cohortCookie,
      ip,
    });
    if (!committed.ok) {
      return NextResponse.json(
        { error: committed.error },
        { status: committed.status },
      );
    }
    return guestCookieResponse(committed.guestId);
  }

  if (await isSignalRateLimited({ ip })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const userRef = { id: session.user.id, email: session.user.email };
  const jwtState = stateFromTokenUser(session.user);
  const stored = await readAccountTaste(userRef);
  const extraText =
    typeof incoming.tastesText === 'string' ? incoming.tastesText : undefined;
  const wipe = isWipe(incoming.wipe) ? incoming.wipe : undefined;
  const guestProfile = parseIncomingProfile(incoming.guestProfile);

  // Login: empty guest / chip_cat-only must not overwrite JWT or store.
  if (isMerge) {
    const merged = resolveLoginMerge({
      stored,
      jwt: jwtState,
      guestSignals: incomingSignals,
      guestProfile,
      extraText,
    });
    let tasteState = merged.state;
    if (wipe) {
      tasteState = {
        ...tasteState,
        profile: wipeProfileKey(tasteState.profile, wipe.bucket, wipe.key),
      };
    }
    if (merged.wroteGuest || wipe || (extraText || '').trim()) {
      await writeAccountTaste(userRef, tasteState);
    }
    const updated = await unstable_update({
      user: {
        tastes: tasteState.tastesText ?? '',
        tastesSetAt: tasteState.tastesSetAt,
        tasteState,
      },
      tasteState,
    } as never);
    const nextUser = updated?.user as
      | { tasteState?: AccountTasteState; tastes?: string; tastesSetAt?: string }
      | undefined;
    void mirrorAuthedSignals({
      signals: incomingSignals,
      email: session.user.email ?? '',
      cohortCookie,
    }).catch(() => {
      /* analytics must not break Matching A */
    });
    return NextResponse.json({
      ok: true,
      wroteGuest: merged.wroteGuest,
      tasteState: nextUser?.tasteState ?? tasteState,
      tastes: nextUser?.tastes ?? tasteState.tastesText ?? '',
      tastesSetAt: nextUser?.tastesSetAt ?? tasteState.tastesSetAt,
    });
  }

  const current = hasPersistedTasteState(jwtState)
    ? jwtState
    : (stored ?? jwtState);
  const tastesText = concatTastesText(current.tastesText, extraText);
  const tastesSetAt =
    tastesText && tastesText !== current.tastesText
      ? new Date().toISOString()
      : current.tastesSetAt;

  if (!extraText && !wipe && incomingSignals.length === 0) {
    return NextResponse.json(
      { error: 'signal ou signals requis' },
      { status: 400 },
    );
  }

  // Same commit path as guest track — map ingest, collapse paired clicks.
  const committed = commitTasteSignals(
    { events: current.signalsRecent, profile: current.profile },
    incomingSignals,
    ACCOUNT_CAP,
  );

  let tasteState = rebuildTasteState(
    committed.events,
    tastesText,
    tastesSetAt,
    ACCOUNT_CAP,
    committed.profile,
  );

  if (wipe) {
    tasteState = {
      ...tasteState,
      profile: wipeProfileKey(tasteState.profile, wipe.bucket, wipe.key),
    };
  }

  await writeAccountTaste(userRef, tasteState);

  const updated = await unstable_update({
    user: {
      tastes: tasteState.tastesText ?? '',
      tastesSetAt: tasteState.tastesSetAt,
      tasteState,
    },
    tasteState,
  } as never);

  const nextUser = updated?.user as
    | { tasteState?: AccountTasteState; tastes?: string; tastesSetAt?: string }
    | undefined;

  void mirrorAuthedSignals({
    signals: incomingSignals,
    email: session.user.email ?? '',
    cohortCookie,
  }).catch(() => {
    /* analytics must not break Matching A */
  });

  return NextResponse.json({
    ok: true,
    tasteState: nextUser?.tasteState ?? tasteState,
    tastes: nextUser?.tastes ?? tasteState.tastesText ?? '',
    tastesSetAt: nextUser?.tastesSetAt ?? tasteState.tastesSetAt,
  });
}
