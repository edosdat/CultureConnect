import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { readMailFlags, writeMailFlags } from '@/lib/mailConsentStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const times = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) {
    hits.set(ip, times);
    return true;
  }
  times.push(now);
  hits.set(ip, times);
  return false;
}

async function requireEmail(): Promise<
  { email: string } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  }
  const email = session.user.email;
  if (!email || typeof email !== 'string') {
    return { error: NextResponse.json({ error: 'Email requis' }, { status: 400 }) };
  }
  return { email };
}

export async function GET(req: Request) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const authz = await requireEmail();
  if ('error' in authz) return authz.error;
  const flags = await readMailFlags(authz.email);
  return NextResponse.json(flags);
}

export async function POST(req: Request) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const authz = await requireEmail();
  if ('error' in authz) return authz.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }
  const raw = body as { opted?: unknown; seen?: unknown };
  const patch: { opted?: boolean; seen?: boolean } = {};
  if (typeof raw.opted === 'boolean') patch.opted = raw.opted;
  if (typeof raw.seen === 'boolean') patch.seen = raw.seen;
  if (patch.opted === undefined && patch.seen === undefined) {
    return NextResponse.json({ error: 'opted ou seen requis' }, { status: 400 });
  }
  const flags = await writeMailFlags(authz.email, patch);
  return NextResponse.json(flags);
}
