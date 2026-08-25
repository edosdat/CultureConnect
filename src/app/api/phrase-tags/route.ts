import { NextResponse } from 'next/server';
import { parsePhraseWithAi } from '@/lib/phraseAi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
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
