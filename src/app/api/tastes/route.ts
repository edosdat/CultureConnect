import { NextResponse } from 'next/server';
import { auth, unstable_update } from '@/auth';
import {
  hasPersistedTasteState,
  readAccountTaste,
  writeAccountTaste,
} from '@/lib/accountTasteStore';
import {
  concatTastesText,
  extractMoods,
  makeSignal,
  mergeSignalLists,
  parseTasteState,
  rebuildTasteState,
  type AccountTasteState,
} from '@/lib/signals';

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

  const incoming =
    body &&
    typeof body === 'object' &&
    'tastes' in body &&
    typeof (body as { tastes: unknown }).tastes === 'string'
      ? (body as { tastes: string }).tastes.trim()
      : null;

  if (incoming === null) {
    return NextResponse.json(
      { error: 'Champ tastes (string) requis' },
      { status: 400 },
    );
  }

  if (incoming.length > 4000) {
    return NextResponse.json(
      { error: 'Texte trop long (max 4000 caractères)' },
      { status: 400 },
    );
  }

  const userRef = { id: session.user.id, email: session.user.email };
  const jwtState =
    parseTasteState(session.user.tasteState) ??
    rebuildTasteState(
      [],
      session.user.tastes,
      session.user.tastesSetAt,
    );
  const stored = await readAccountTaste(userRef);
  const current = hasPersistedTasteState(jwtState)
    ? jwtState
    : (stored ?? jwtState);

  const tastes = concatTastesText(current.tastesText, incoming) ?? incoming;
  const tastesSetAt =
    tastes !== current.tastesText
      ? new Date().toISOString()
      : current.tastesSetAt ?? new Date().toISOString();

  const textSignal = makeSignal({
    kind: 'tastes_text',
    moods: extractMoods(incoming),
    query: incoming.slice(0, 200),
  });
  const signals = mergeSignalLists(current.signalsRecent, [textSignal], 40);
  const tasteState: AccountTasteState = rebuildTasteState(
    signals,
    tastes,
    tastesSetAt,
    40,
    current.profile,
  );

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
    | { tastes?: string; tastesSetAt?: string; tasteState?: AccountTasteState }
    | undefined;

  return NextResponse.json({
    ok: true,
    tastes: nextUser?.tastes ?? tasteState.tastesText ?? tastes,
    tastesSetAt: nextUser?.tastesSetAt ?? tasteState.tastesSetAt,
    tasteState: nextUser?.tasteState ?? tasteState,
  });
}
