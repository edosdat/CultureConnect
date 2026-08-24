import { NextResponse } from 'next/server';
import { auth, unstable_update } from '@/auth';

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

  const tastes =
    body &&
    typeof body === 'object' &&
    'tastes' in body &&
    typeof (body as { tastes: unknown }).tastes === 'string'
      ? (body as { tastes: string }).tastes.trim()
      : null;

  if (tastes === null) {
    return NextResponse.json(
      { error: 'Champ tastes (string) requis' },
      { status: 400 },
    );
  }

  if (tastes.length > 4000) {
    return NextResponse.json(
      { error: 'Texte trop long (max 4000 caractères)' },
      { status: 400 },
    );
  }

  const tastesSetAt = new Date().toISOString();
  const updated = await unstable_update({
    user: {
      tastes,
      tastesSetAt,
    },
  });

  return NextResponse.json({
    ok: true,
    tastes: updated?.user?.tastes ?? tastes,
    tastesSetAt: updated?.user?.tastesSetAt ?? tastesSetAt,
  });
}
