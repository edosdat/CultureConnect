/**
 * Short reply for an avis / idée. Network only.
 * The key stays in this server module. The prompt receives the redacted
 * text and nothing else — no e-mail, no user id, no `cc_vid`.
 */
import 'server-only';
import { parseFeedbackAiContent, type FeedbackKind } from '@/lib/feedbackNote';

export const FEEDBACK_MAX_TOKENS = 80;

export type FeedbackAiEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

export type FeedbackAiReply = {
  kind: FeedbackKind;
  reply: string | null;
};

function aiEnv(env: FeedbackAiEnv): { url: string; key: string; model: string } | null {
  const openai = (env.OPENAI_API_KEY || '').trim();
  if (!openai) return null;
  return {
    url: 'https://api.openai.com/v1/chat/completions',
    key: openai,
    model: (env.OPENAI_MODEL || '').trim() || 'gpt-4o-mini',
  };
}

const SYSTEM = [
  'Tu réponds à un avis ou une idée sur Plan C, agenda culturel à Toulouse.',
  'JSON strict, pas de prose hors JSON.',
  'kind: avis | idee | autre.',
  'reply: une seule phrase, tutoiement, français, 140 caractères max, sans lien, sans e-mail, sans promesse.',
  'N’invente pas une fonctionnalité. N’évoque pas l’entraînement d’un modèle.',
].join(' ');

export async function replyToFeedback(
  text: string,
  deps?: {
    fetchImpl?: typeof fetch;
    env?: FeedbackAiEnv;
  },
): Promise<FeedbackAiReply | null> {
  const env = aiEnv(
    deps?.env ?? {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
    },
  );
  if (!env) {
    console.info('[feedback]', { openaiStatus: null });
    return null;
  }

  const fetchImpl = deps?.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(env.url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${env.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.model,
        temperature: 0,
        max_tokens: FEEDBACK_MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: text },
        ],
      }),
    });
    console.info('[feedback]', { openaiStatus: res.status });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || '';
    return parseFeedbackAiContent(content);
  } catch {
    console.info('[feedback]', { openaiStatus: 0 });
    return null;
  }
}
