import { NextResponse } from 'next/server';
import {
  emptyPhraseTags,
  hasPhraseSignal,
  parsePhraseRules,
  sanitizeAiTags,
  type PhraseTags,
} from '@/lib/phraseTags';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function aiEnv(): { url: string; key: string; model: string } | null {
  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      key: openai,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }
  const xai = process.env.XAI_API_KEY;
  if (xai) {
    return {
      url: 'https://api.x.ai/v1/chat/completions',
      key: xai,
      model: process.env.XAI_MODEL || 'grok-2-latest',
    };
  }
  return null;
}

async function phraseTagsFromAi(
  phrase: string,
  dates: { date_from?: string; date_to?: string },
): Promise<PhraseTags> {
  const env = aiEnv();
  if (!env) return { ...emptyPhraseTags('ai'), ...dates };

  const system = [
    'Tu convertis une phrase française en tags agenda. JSON strict, pas de prose.',
    'Vocabulaire:',
    'form: cine|theatre|concert|festival|enfants|autre ou null',
    'moods ⊆ rigolo,intense,tendre,cerveau,sortie',
    'genres: slugs courts (funk,humour,piano,techno,jazz_blues,rock_metal_punk,hiphop_rap,classique_lyrique…) max 4',
    'date_from/date_to: YYYY-MM-DD ou null',
    '« philosophique mais léger » → moods ["cerveau","tendre"], léger ≠ rigolo.',
  ].join(' ');

  try {
    const res = await fetch(env.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: phrase },
        ],
      }),
    });
    if (!res.ok) return { ...emptyPhraseTags('ai'), ...dates };
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content) as unknown;
    return sanitizeAiTags(parsed, dates);
  } catch {
    return { ...emptyPhraseTags('ai'), ...dates };
  }
}

async function parsePhraseWithAi(
  phrase: string,
  now = new Date(),
): Promise<PhraseTags> {
  const rules = parsePhraseRules(phrase, now);
  if (hasPhraseSignal(rules)) return rules;
  const dates = {
    date_from: rules.date_from,
    date_to: rules.date_to,
  };
  return phraseTagsFromAi(phrase, dates);
}

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
