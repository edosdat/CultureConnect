import { NextResponse } from 'next/server';
import { auth, unstable_update } from '@/auth';
import {
  ACCOUNT_CAP,
  concatTastesText,
  makeSignal,
  mergeSignalLists,
  parseTasteState,
  rebuildTasteState,
  type AccountTasteState,
  type Signal,
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
  };

  const current = stateFromTokenUser(session.user);
  const extraText =
    typeof incoming.tastesText === 'string' ? incoming.tastesText : undefined;
  const tastesText = concatTastesText(current.tastesText, extraText);
  const tastesSetAt =
    tastesText && tastesText !== current.tastesText
      ? new Date().toISOString()
      : current.tastesSetAt;

  let signals = current.signalsRecent;

  if (Array.isArray(incoming.signals)) {
    const guest = incoming.signals
      .filter(isSignalLike)
      .map(normalizeIncomingSignal);
    signals = mergeSignalLists(signals, guest, ACCOUNT_CAP);
  } else if (
    incoming.signal &&
    (isSignalLike(incoming.signal) || isTrackPayload(incoming.signal))
  ) {
    signals = mergeSignalLists(
      signals,
      [normalizeIncomingSignal(incoming.signal as Signal | TrackPayload)],
      ACCOUNT_CAP,
    );
  } else if (!extraText) {
    return NextResponse.json(
      { error: 'signal ou signals requis' },
      { status: 400 },
    );
  }

  const tasteState = rebuildTasteState(signals, tastesText, tastesSetAt);

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
