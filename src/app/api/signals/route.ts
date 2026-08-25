import { NextResponse } from 'next/server';
import { auth, unstable_update } from '@/auth';
import {
  hasPersistedTasteState,
  readAccountTaste,
  writeAccountTaste,
} from '@/lib/accountTasteStore';
import {
  ACCOUNT_CAP,
  concatTastesText,
  makeSignal,
  mergeSignalLists,
  overlayZeroWeights,
  parseGuestStore,
  parseTasteState,
  rebuildTasteState,
  unzeroKeysTouchedBySignal,
  wipeProfileKey,
  type AccountTasteState,
  type ProfileBucket,
  type Signal,
  type TasteProfile,
  type TrackPayload,
} from '@/lib/signals';

function isTrackPayload(v: unknown): v is TrackPayload {
  return Boolean(
    v && typeof v === 'object' && typeof (v as TrackPayload).kind === 'string',
  );
}

function isSignalLike(v: unknown): v is Signal {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<Signal>;
  return (
    typeof s.kind === 'string' &&
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
    (o.bucket === 'cats' || o.bucket === 'genres' || o.bucket === 'moods') &&
    typeof o.key === 'string' &&
    o.key.trim().length > 0
  );
}

function parseIncomingProfile(raw: unknown): TasteProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  return parseGuestStore({ events: [], profile: raw }).profile;
}

function normalizeIncomingSignal(raw: Signal | TrackPayload): Signal {
  if (
    'id' in raw &&
    typeof raw.id === 'string' &&
    'ts' in raw &&
    typeof raw.ts === 'string' &&
    typeof raw.weight === 'number'
  ) {
    return {
      ...raw,
      genres: raw.genres ?? [],
      moods: raw.moods ?? [],
    } as Signal;
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
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

  const userRef = { id: session.user.id, email: session.user.email };
  const jwtState = stateFromTokenUser(session.user);
  const stored = await readAccountTaste(userRef);
  // Login merge: 1) account store 2) guest additive 3) overlay 0 last.
  const current =
    incoming.merge === true
      ? (stored ?? jwtState)
      : hasPersistedTasteState(jwtState)
        ? jwtState
        : (stored ?? jwtState);
  const extraText =
    typeof incoming.tastesText === 'string' ? incoming.tastesText : undefined;
  const tastesText = concatTastesText(current.tastesText, extraText);
  const tastesSetAt =
    tastesText && tastesText !== current.tastesText
      ? new Date().toISOString()
      : current.tastesSetAt;
  const wipe = isWipe(incoming.wipe) ? incoming.wipe : undefined;
  const guestProfile = parseIncomingProfile(incoming.guestProfile);

  let signals = current.signalsRecent;
  const incomingSignals: Signal[] = [];

  if (Array.isArray(incoming.signals)) {
    incomingSignals.push(
      ...incoming.signals.filter(isSignalLike).map(normalizeIncomingSignal),
    );
    signals = mergeSignalLists(signals, incomingSignals, ACCOUNT_CAP);
  } else if (
    incoming.signal &&
    (isSignalLike(incoming.signal) || isTrackPayload(incoming.signal))
  ) {
    incomingSignals.push(
      normalizeIncomingSignal(incoming.signal as Signal | TrackPayload),
    );
    signals = mergeSignalLists(signals, incomingSignals, ACCOUNT_CAP);
  } else if (!extraText && !wipe && !guestProfile) {
    return NextResponse.json(
      { error: 'signal ou signals requis' },
      { status: 400 },
    );
  }

  // Overlay-prev: unzero keys the user is adding back, then keep remaining 0s.
  let overlayPrev = current.profile;
  if (incomingSignals.length > 0) {
    for (const s of incomingSignals) {
      overlayPrev = unzeroKeysTouchedBySignal(overlayPrev, s);
    }
  }

  let tasteState = rebuildTasteState(
    signals,
    tastesText,
    tastesSetAt,
    ACCOUNT_CAP,
    overlayPrev,
  );

  if (wipe) {
    tasteState = {
      ...tasteState,
      profile: wipeProfileKey(tasteState.profile, wipe.bucket, wipe.key),
    };
  }

  // Guest wipe wins last on login merge.
  if (guestProfile) {
    tasteState = {
      ...tasteState,
      profile: overlayZeroWeights(tasteState.profile, guestProfile),
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

  return NextResponse.json({
    ok: true,
    tasteState: nextUser?.tasteState ?? tasteState,
    tastes: nextUser?.tastes ?? tasteState.tastesText ?? '',
    tastesSetAt: nextUser?.tastesSetAt ?? tasteState.tastesSetAt,
  });
}
