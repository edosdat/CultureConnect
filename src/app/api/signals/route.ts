import { NextResponse } from 'next/server';
import { auth, unstable_update } from '@/auth';
import {
  hasPersistedTasteState,
  readAccountTaste,
  writeAccountTaste,
} from '@/lib/accountTasteStore';
import {
  ACCOUNT_CAP,
  coerceProfile,
  concatTastesText,
  ingestMapSignal,
  isTasteWritingSignal,
  makeSignal,
  mergeSignalLists,
  parseTasteState,
  rebuildTasteState,
  resolveLoginMerge,
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
  const extraText =
    typeof incoming.tastesText === 'string' ? incoming.tastesText : undefined;
  const wipe = isWipe(incoming.wipe) ? incoming.wipe : undefined;
  const guestProfile = parseIncomingProfile(incoming.guestProfile);

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

  // Login: empty guest / chip_cat-only must not overwrite JWT or store.
  if (incoming.merge === true) {
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
    return NextResponse.json({
      ok: true,
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

  // chip_cat stays on the wire (Cinéma grid filter). L() does not increment cats.
  const signals = mergeSignalLists(
    current.signalsRecent,
    incomingSignals,
    ACCOUNT_CAP,
  );

  // Overlay-prev: unzero keys the user is adding back, then keep remaining 0s.
  let overlayPrev = current.profile;
  for (const s of incomingSignals.filter(isTasteWritingSignal)) {
    overlayPrev = unzeroKeysTouchedBySignal(overlayPrev, s);
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
