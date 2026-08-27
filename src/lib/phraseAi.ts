/**
 * Phrase → tags via IA. Réseau seulement. Les règles vivent dans phraseTags.ts.
 */

import { loadCultureData } from './data';
import {
  emptyPhraseTags,
  hasPhraseSignal,
  parsePhraseRules,
  phraseMatchesTitleCatalog,
  sanitizeAiTags,
  type PhraseTags,
} from './phraseTags';

function aiEnv(): { url: string; key: string; model: string } | null {
  const openai = (process.env['OPENAI_API_KEY'] || '').trim();
  if (openai) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      key: openai,
      model: process.env['OPENAI_MODEL'] || 'gpt-4o-mini',
    };
  }
  const xai = process.env['XAI_API_KEY'];
  if (xai) {
    return {
      url: 'https://api.x.ai/v1/chat/completions',
      key: xai,
      model: process.env['XAI_MODEL'] || 'grok-2-latest',
    };
  }
  return null;
}

async function phraseTagsFromAi(
  phrase: string,
  dates: { date_from?: string; date_to?: string },
): Promise<PhraseTags> {
  const env = aiEnv();
  if (!env) {
    console.info('[phrase-tags]', { openaiStatus: null });
    return { ...emptyPhraseTags('ai'), ...dates };
  }

  const system = [
    'Tu convertis une phrase française en tags agenda. JSON strict, pas de prose.',
    'Vocabulaire:',
    'form: cine|theatre|concert|festival|enfants|autre ou null',
    'moods ⊆ rigolo,intense,tendre,cerveau,sortie',
    'genres: slugs courts (funk,humour,piano,techno,jazz_blues,rock_metal_punk,hiphop_rap,classique_lyrique…) max 4',
    'themes ⊆ feminisme,histoire,politique,guerre,ecologie,science,amour,famille,colonial,immigration,lgbt,religion,sport,mer,voyage',
    'entities: canon minuscule sans accents, max 3 (ex. "de gaulle","zeniter")',
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
    console.info('[phrase-tags]', { openaiStatus: res.status });
    if (!res.ok) return { ...emptyPhraseTags('ai'), ...dates };
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content) as unknown;
    return sanitizeAiTags(parsed, dates);
  } catch {
    console.info('[phrase-tags]', { openaiStatus: 0 });
    return { ...emptyPhraseTags('ai'), ...dates };
  }
}

let titleCatalog: string[] | null = null;

function catalogTitles(): string[] {
  if (titleCatalog) return titleCatalog;
  const data = loadCultureData();
  titleCatalog = [
    ...data.films.map((f) => f.titre),
    ...data.evenements.map((e) => e.titre),
    ...data.programme.map((p) => p.nom_item),
    ...data.artistes.map((a) => a.nom),
  ];
  return titleCatalog;
}

export async function parsePhraseWithAi(
  phrase: string,
  now = new Date(),
): Promise<PhraseTags> {
  if (phraseMatchesTitleCatalog(phrase, catalogTitles())) {
    console.info('[phrase-tags]', { titleHit: true, openaiStatus: 'skipped' });
    return emptyPhraseTags('rules');
  }
  const rules = parsePhraseRules(phrase, now);
  if (hasPhraseSignal(rules)) return rules;
  const dates = {
    date_from: rules.date_from,
    date_to: rules.date_to,
  };
  return phraseTagsFromAi(phrase, dates);
}
