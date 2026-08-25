import { NextResponse } from 'next/server';
import { parsePhraseWithAi } from '@/lib/phraseAi';

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

export async function POST(req: Request) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  console.info('[phrase-tags]', { hasKey: Boolean(process.env['OPENAI_API_KEY']) });

  let phrase = '';
  try {
    const body = (await req.json()) as { phrase?: unknown };
    phrase = typeof body.phrase === 'string' ? body.phrase : '';
  } catch {
    phrase = '';
  }
  const tags = await parsePhraseWithAi(phrase);
  return NextResponse.json(tags);
}
