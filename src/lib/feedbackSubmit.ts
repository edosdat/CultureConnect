/**
 * Accept a short avis / idée, ask for a bounded reply, persist it.
 * OpenAI sees the redacted text only. The row stores one actor, never both.
 */
import 'server-only';
import { replyToFeedback, type FeedbackAiReply } from '@/lib/feedbackAi';
import {
  feedbackImageErrorCopy,
  prepareFeedbackImage,
  type PreparedFeedbackImage,
} from '@/lib/feedbackImage';
import {
  FEEDBACK_ACK,
  FEEDBACK_IP_RATE_PER_HOUR,
  FEEDBACK_RATE_PER_HOUR,
  FEEDBACK_RATE_WINDOW_MS,
  assertFeedbackActorExclusive,
  feedbackActor,
  feedbackActorBucket,
  feedbackIpBucket,
  feedbackKind,
  feedbackRateLimited,
  sanitizeFeedbackBody,
} from '@/lib/feedbackNote';
import {
  countRecentFeedback,
  insertFeedbackNote,
  purgeExpiredFeedback,
} from '@/lib/feedbackStore';

const TOO_MANY = 'Trop de messages d’un coup. Réessaie plus tard.';
const WRITE_FAIL = 'Ça n’est pas parti. Réessaie.';
const TOO_SHORT = 'Écris quelques mots.';

export type SubmitFeedbackInput = {
  text: string;
  email?: string | null;
  cookieVid?: string | null;
  ip: string;
  now?: number;
  /** Chip or client hint. Unknown values are dropped. */
  kind?: unknown;
  /** One user-picked image. Never forwarded to the model. */
  image?: Uint8Array | null;
};

export type SubmitFeedbackResult =
  | { ok: true; reply: string }
  | { ok: false; status: 400 | 413 | 429 | 503; error: string };

export async function submitFeedback(
  input: SubmitFeedbackInput,
  deps?: {
    reply?: (text: string) => Promise<FeedbackAiReply | null>;
  },
): Promise<SubmitFeedbackResult> {
  let image: PreparedFeedbackImage | null = null;
  if (input.image && input.image.byteLength > 0) {
    const prepared = prepareFeedbackImage(input.image);
    if ('error' in prepared) {
      const status = prepared.error === 'size' ? 413 : 400;
      return { ok: false, status, error: feedbackImageErrorCopy(prepared.error) };
    }
    image = prepared;
  }

  const body = sanitizeFeedbackBody(input.text);
  if (!body && !image) return { ok: false, status: 400, error: TOO_SHORT };
  const chosen = feedbackKind(input.kind);

  const now = input.now ?? Date.now();
  const actor = feedbackActor({
    email: input.email,
    cookieVid: input.cookieVid,
  });
  assertFeedbackActorExclusive(actor);

  const ip = (input.ip || 'unknown').slice(0, 64);
  if (
    feedbackRateLimited(feedbackIpBucket(ip), FEEDBACK_IP_RATE_PER_HOUR, now) ||
    feedbackRateLimited(
      feedbackActorBucket(actor, ip),
      FEEDBACK_RATE_PER_HOUR,
      now,
    )
  ) {
    return { ok: false, status: 429, error: TOO_MANY };
  }

  if (actor.userKey || actor.ccVid) {
    try {
      const since = new Date(now - FEEDBACK_RATE_WINDOW_MS).toISOString();
      const recent = await countRecentFeedback(actor, since);
      if (recent >= FEEDBACK_RATE_PER_HOUR) {
        return { ok: false, status: 429, error: TOO_MANY };
      }
    } catch {
      return { ok: false, status: 503, error: WRITE_FAIL };
    }
  }

  const replyFn = deps?.reply ?? ((text: string) => replyToFeedback(text));
  let ai: FeedbackAiReply | null = null;
  if (body) {
    try {
      // Text only. The image stays in Neon and is not sent to the model.
      ai = await replyFn(body);
    } catch {
      ai = null;
    }
  }

  const reply = ai?.reply || FEEDBACK_ACK;
  try {
    await insertFeedbackNote({
      kind: chosen ?? ai?.kind ?? 'autre',
      body: body ?? '',
      userKey: actor.userKey,
      ccVid: actor.ccVid,
      reply,
      createdAt: new Date(now).toISOString(),
      image: image?.bytes ?? null,
    });
    try {
      // Backstop if the daily cron (GET /api/feedback/purge) did not run.
      // A missed cron leaves expired rows until the next write or admin open.
      await purgeExpiredFeedback(now);
    } catch {
      /* the new row is already stored */
    }
  } catch {
    return { ok: false, status: 503, error: WRITE_FAIL };
  }

  return { ok: true, reply };
}
