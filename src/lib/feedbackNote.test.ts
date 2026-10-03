import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { hashEmailKey } from './adminAnalytics';
import { FEEDBACK_MAX_TOKENS, replyToFeedback } from './feedbackAi';
import {
  BUG_QUESTION,
  BUG_STUB,
  BUG_SUBTYPES,
  SUGGESTION_QUESTION,
  SUGGESTION_STUB,
  SUGGESTION_SUBTYPES,
  clearStub,
  fieldForTrack,
} from './feedbackChips';
import {
  FEEDBACK_ACK,
  FEEDBACK_IP_RATE_PER_HOUR,
  FEEDBACK_KINDS,
  FEEDBACK_RATE_PER_HOUR,
  feedbackActor,
  feedbackKind,
  feedbackUserKey,
  parseFeedbackAiContent,
  resetFeedbackRateForTests,
  sanitizeFeedbackBody,
  sanitizeFeedbackReply,
  toAdminFeedbackNote,
} from './feedbackNote';
import {
  ATTACH_LABEL,
  FEEDBACK_IMAGE_MAX_BYTES,
  IMAGE_PERMISSION,
  IMAGE_SEND_FAIL,
  IMAGE_TOO_HEAVY,
  prepareFeedbackImage,
} from './feedbackImage';
import {
  deleteFeedbackForEmail,
  insertFeedbackNote,
  listFeedbackForAdmin,
  readFeedbackImageForAdmin,
  resetFeedbackStoreForTests,
} from './feedbackStore';
import { submitFeedback, type SubmitFeedbackInput } from './feedbackSubmit';
import { GET as purgeFeedback } from '../app/api/feedback/purge/route';

const noopReply = async () => null;

function input(patch: Partial<SubmitFeedbackInput> & Pick<SubmitFeedbackInput, 'text' | 'ip'>): SubmitFeedbackInput {
  return {
    email: null,
    cookieVid: null,
    ...patch,
  };
}

describe('feedback text', () => {
  it('fingerprints the e-mail the same way as admin, and drops the address', () => {
    assert.equal(feedbackUserKey('  Ada@Example.com '), hashEmailKey('ada@example.com'));
    assert.equal(feedbackUserKey('ada@example.com')?.includes('@'), false);
    assert.equal(feedbackUserKey('pas-un-mail'), null);
    assert.equal(feedbackUserKey(''), null);
  });

  it('keeps an account fingerprint or cc_vid, never both', () => {
    const account = feedbackActor({
      email: 'ada@example.com',
      cookieVid: 'v_abcdef12',
    });
    assert.equal(account.ccVid, null);
    assert.equal(account.userKey, feedbackUserKey('ada@example.com'));

    const guest = feedbackActor({ email: null, cookieVid: 'v_guest1234' });
    assert.equal(guest.userKey, null);
    assert.equal(guest.ccVid, 'v_guest1234');

    const anon = feedbackActor({ email: null, cookieVid: 'not-a-vid' });
    assert.deepEqual(anon, { userKey: null, ccVid: null });
  });

  it('redacts contact details and drops replies that claim training or add a link', () => {
    const body = sanitizeFeedbackBody(
      'Écris-moi à ada@example.com ou au 06 12 34 56 78. Le calendrier bug.',
    );
    assert.match(body || '', /\[courriel\]/);
    assert.match(body || '', /\[téléphone\]/);
    assert.equal((body || '').includes('ada@example.com'), false);
    assert.equal((body || '').includes('0612345678'), false);
    assert.equal(sanitizeFeedbackBody('  a '), null);
    assert.equal(sanitizeFeedbackBody(12), null);
    // FR-centric: a US number is not the phone shape we strip.
    const us = sanitizeFeedbackBody('call 212-555-0199 please');
    assert.equal(us?.includes('[téléphone]'), false);
    assert.match(us || '', /212-555-0199/);

    assert.equal(sanitizeFeedbackReply('On entraîne le modèle avec ça.'), null);
    assert.equal(sanitizeFeedbackReply('Voir https://example.com'), null);
    assert.equal(sanitizeFeedbackReply('Bien noté.'), 'Bien noté.');
  });

  it('locks the hourly caps so a short thread is not blocked', () => {
    assert.equal(FEEDBACK_RATE_PER_HOUR, 10);
    assert.equal(FEEDBACK_IP_RATE_PER_HOUR, 20);
  });

  it('accepts bug next to the older kinds and drops an unknown label', () => {
    assert.deepEqual([...FEEDBACK_KINDS], ['avis', 'idee', 'bug', 'autre']);
    assert.equal(feedbackKind('bug'), 'bug');
    assert.equal(feedbackKind('BUG'), 'bug');
    assert.equal(feedbackKind('idée'), 'idee');
    assert.equal(feedbackKind('suggestion'), null);
    assert.equal(feedbackKind(''), null);
    assert.equal(feedbackKind(12), null);
    assert.deepEqual(parseFeedbackAiContent('{"kind":"bug","reply":"Bien noté."}'), {
      kind: 'bug',
      reply: 'Bien noté.',
    });
  });

  it('parses a bounded JSON reply and ignores prose', () => {
    assert.deepEqual(
      parseFeedbackAiContent('{"kind":"idée","reply":"On regarde ça."}'),
      { kind: 'idee', reply: 'On regarde ça.' },
    );
    assert.equal(parseFeedbackAiContent('pas du json'), null);
    assert.deepEqual(
      parseFeedbackAiContent('{"kind":"avis","reply":"On entraîne un modèle."}'),
      { kind: 'avis', reply: null },
    );
  });
});

describe('feedback ai bounds', () => {
  it('calls the chat API with a tight cap and the text only', async () => {
    let seenUrl = '';
    let seenAuth = '';
    let seenBody = '';
    const result = await replyToFeedback('le calendrier est confus', {
      env: { OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-4o-mini' },
      fetchImpl: async (url, init) => {
        seenUrl = String(url);
        seenAuth = new Headers(init?.headers).get('authorization') || '';
        seenBody = String(init?.body || '');
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ kind: 'avis', reply: 'Bien noté.' }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    });
    assert.equal(result?.kind, 'avis');
    assert.equal(result?.reply, 'Bien noté.');
    assert.match(seenUrl, /api\.openai\.com\/v1\/chat\/completions/);
    assert.equal(seenAuth, 'Bearer sk-test');
    const payload = JSON.parse(seenBody) as {
      temperature: number;
      max_tokens: number;
      messages: Array<{ content: string }>;
    };
    assert.equal(payload.temperature, 0);
    assert.equal(payload.max_tokens, FEEDBACK_MAX_TOKENS);
    assert.equal(FEEDBACK_MAX_TOKENS, 80);
    assert.equal(payload.messages[1]?.content, 'le calendrier est confus');
    assert.equal(seenBody.includes('sk-test'), false);
    assert.equal(seenBody.includes('@'), false);
    assert.equal(seenBody.includes('cc_vid'), false);
  });

  it('skips the network when no key is set', async () => {
    let called = false;
    const result = await replyToFeedback('une idée de filtre', {
      env: {},
      fetchImpl: async () => {
        called = true;
        return new Response('no', { status: 500 });
      },
    });
    assert.equal(result, null);
    assert.equal(called, false);
  });
});

describe('feedback store', { concurrency: 1 }, () => {
  let dir = '';

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cc-feedback-'));
    process.env.FEEDBACK_STORE = 'file';
    process.env.FEEDBACK_STORE_DIR = dir;
    resetFeedbackStoreForTests();
  });

  beforeEach(() => {
    resetFeedbackRateForTests();
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stores the account fingerprint and drops cc_vid on the same row', async () => {
    const res = await submitFeedback(
      input({
        text: 'Mon mail est ada@example.com et le filtre salles manque',
        email: 'Ada@Example.com',
        cookieVid: 'v_abcdef12',
        ip: '203.0.113.10',
      }),
      {
        reply: async (text) => {
          assert.equal(text.includes('ada@example.com'), false);
          assert.match(text, /\[courriel\]/);
          return { kind: 'idee', reply: 'Noté, merci.' };
        },
      },
    );
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.reply, 'Noté, merci.');

    const notes = await listFeedbackForAdmin();
    const row = notes.find((note) => note.body.includes('filtre salles'));
    assert.equal(row?.actor, 'compte');
    assert.equal(row?.kind, 'idee');
    assert.equal(row?.ref, hashEmailKey('ada@example.com'));
    assert.equal(row?.ref?.includes('@'), false);

    const raw = await readFile(path.join(dir, 'notes.json'), 'utf8');
    assert.equal(raw.includes('v_abcdef12'), false);
    assert.equal(raw.includes('Ada@Example.com'), false);
    assert.equal(raw.includes('ada@example.com'), false);
  });

  it('stores cc_vid alone for a guest and nothing for an unknown visitor', async () => {
    const guest = await submitFeedback(
      input({
        text: 'la carte est trop petite',
        cookieVid: 'v_guest1234',
        ip: '203.0.113.11',
      }),
      { reply: noopReply },
    );
    assert.equal(guest.ok, true);
    if (guest.ok) assert.equal(guest.reply, FEEDBACK_ACK);

    const anon = await submitFeedback(
      input({
        text: 'juste un passage',
        cookieVid: 'nope',
        ip: '203.0.113.12',
      }),
      { reply: noopReply },
    );
    assert.equal(anon.ok, true);

    const notes = await listFeedbackForAdmin();
    const guestRow = notes.find((note) => note.body.includes('trop petite'));
    const anonRow = notes.find((note) => note.body.includes('passage'));
    assert.equal(guestRow?.actor, 'visiteur');
    assert.equal(guestRow?.ref, 'v_guest1234');
    assert.equal(anonRow?.actor, 'anonyme');
    assert.equal(anonRow?.ref, null);
  });

  it('refuses a row that joins cc_vid with an account key', async () => {
    await assert.rejects(() =>
      insertFeedbackNote({
        kind: 'avis',
        body: 'les deux identités',
        userKey: 'abcdabcdabcdabcd',
        ccVid: 'v_both12345',
        reply: null,
      }),
    );
  });

  it('rate-limits the next note for the same account, even after a memory reset', async () => {
    const email = 'durable@example.com';
    for (let i = 0; i < FEEDBACK_RATE_PER_HOUR; i += 1) {
      const res = await submitFeedback(
        input({
          text: `note durable ${i} merci`,
          email,
          ip: '203.0.113.20',
        }),
        { reply: noopReply },
      );
      assert.equal(res.ok, true);
    }
    resetFeedbackRateForTests();
    let called = false;
    const blocked = await submitFeedback(
      input({
        text: 'encore une note merci',
        email,
        ip: '203.0.113.21',
      }),
      {
        reply: async () => {
          called = true;
          return null;
        },
      },
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.status, 429);
    assert.equal(called, false);
  });

  it('rate-limits one IP across several accounts', async () => {
    for (let i = 0; i < FEEDBACK_IP_RATE_PER_HOUR; i += 1) {
      const res = await submitFeedback(
        input({
          text: `idée ip ${i} merci`,
          email: `ip${i}@example.com`,
          ip: '198.51.100.8',
        }),
        { reply: noopReply },
      );
      assert.equal(res.ok, true);
    }
    const blocked = await submitFeedback(
      input({
        text: 'une idée de trop merci',
        email: 'nouveau@example.com',
        ip: '198.51.100.8',
      }),
      { reply: noopReply },
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.status, 429);
  });

  it('hides notes older than 90 days and deletes account notes with the compte', async () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    await insertFeedbackNote({
      kind: 'avis',
      body: 'trop vieux pour rester ici',
      userKey: null,
      ccVid: 'v_oldvid123',
      reply: null,
      createdAt: old,
    });
    await deleteFeedbackForEmail('Ada@Example.com');
    const notes = await listFeedbackForAdmin();
    assert.equal(
      notes.some((note) => note.body.includes('trop vieux')),
      false,
    );
    assert.equal(
      notes.some((note) => note.ref === hashEmailKey('ada@example.com')),
      false,
    );
    assert.equal(
      notes.some((note) => note.ref === 'v_guest1234'),
      true,
    );
  });

  it('purges expired rows only with the cron bearer', async () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const missing = await purgeFeedback(
        new Request('http://127.0.0.1/api/feedback/purge'),
      );
      assert.equal(missing.status, 401);

      process.env.CRON_SECRET = 'cron-test-secret';
      const wrong = await purgeFeedback(
        new Request('http://127.0.0.1/api/feedback/purge', {
          headers: { authorization: 'Bearer nope' },
        }),
      );
      assert.equal(wrong.status, 401);

      const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      await insertFeedbackNote({
        kind: 'avis',
        body: 'ligne cron a effacer',
        userKey: null,
        ccVid: 'v_cronvid12',
        reply: null,
        createdAt: old,
      });
      const ok = await purgeFeedback(
        new Request('http://127.0.0.1/api/feedback/purge', {
          headers: { authorization: 'Bearer cron-test-secret' },
        }),
      );
      assert.equal(ok.status, 200);
      const body = (await ok.json()) as { deleted?: number };
      assert.equal((body.deleted ?? 0) >= 1, true);
      const notes = await listFeedbackForAdmin();
      assert.equal(
        notes.some((note) => note.body.includes('ligne cron')),
        false,
      );
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  it('keeps a chip kind and lets the model classify an unknown one', async () => {
    const bug = await submitFeedback(
      input({
        text: 'le bouton date bloque',
        ip: '203.0.113.50',
        kind: 'bug',
      }),
      { reply: async () => null },
    );
    assert.equal(bug.ok, true);

    const idea = await submitFeedback(
      input({
        text: 'une piste pour le filtre',
        ip: '203.0.113.51',
        kind: 'idee',
      }),
      { reply: async () => ({ kind: 'avis', reply: 'Bien noté.' }) },
    );
    assert.equal(idea.ok, true);

    const junk = await submitFeedback(
      input({
        text: 'classe moi ailleurs merci',
        ip: '203.0.113.52',
        kind: 'suggestion',
      }),
      { reply: async () => ({ kind: 'avis', reply: 'Bien noté.' }) },
    );
    assert.equal(junk.ok, true);

    const notes = await listFeedbackForAdmin();
    assert.equal(notes.find((note) => note.body.includes('bouton date'))?.kind, 'bug');
    assert.equal(notes.find((note) => note.body.includes('piste pour'))?.kind, 'idee');
    assert.equal(notes.find((note) => note.body.includes('ailleurs'))?.kind, 'avis');
  });

  it('does not put an e-mail on the admin shape', () => {
    const note = toAdminFeedbackNote({
      id: '1',
      kind: 'avis',
      body: 'court',
      userKey: hashEmailKey('ada@example.com'),
      ccVid: null,
      reply: FEEDBACK_ACK,
      createdAt: new Date().toISOString(),
    });
    assert.equal(JSON.stringify(note).includes('@'), false);
    assert.equal(note.actor, 'compte');
  });

  it('strips EXIF and refuses anything that is not a jpeg', () => {
    const token = 'GPS-SECRET-TOKEN';
    const prepared = prepareFeedbackImage(jpegWithExif(token));
    assert.equal('error' in prepared, false);
    if (!('error' in prepared)) {
      assert.equal(prepared.mime, 'image/jpeg');
      assert.equal(new TextDecoder().decode(prepared.bytes).includes(token), false);
    }
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
    const refused = prepareFeedbackImage(gif);
    assert.equal('error' in refused && refused.error, 'type');
    const huge = new Uint8Array(FEEDBACK_IMAGE_MAX_BYTES + 1);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    const heavy = prepareFeedbackImage(huge);
    assert.equal('error' in heavy && heavy.error, 'size');
  });

  it('stores one jpeg with the note, keeps it off the model and the admin list', async () => {
    const token = 'GPS-SECRET-TOKEN';
    let seen = '';
    const res = await submitFeedback(
      input({
        text: 'le titre deborde sur mobile',
        ip: '203.0.113.80',
        kind: 'bug',
        image: jpegWithExif(token),
      }),
      {
        reply: async (text) => {
          seen = text;
          return { kind: 'avis', reply: 'Bien noté.' };
        },
      },
    );
    assert.equal(res.ok, true);
    assert.equal(seen.includes(token), false);
    assert.match(seen, /titre deborde/);

    const notes = await listFeedbackForAdmin();
    const row = notes.find((note) => note.body.includes('titre deborde'));
    assert.equal(row?.hasImage, true);
    assert.equal(row?.kind, 'bug');
    assert.equal(JSON.stringify(row).includes(token), false);
    const image = row ? await readFeedbackImageForAdmin(row.id) : null;
    assert.equal(image?.mime, 'image/jpeg');
    assert.equal(new TextDecoder().decode(image?.bytes || new Uint8Array()).includes(token), false);

    const raw = await readFile(path.join(dir, 'notes.json'), 'utf8');
    assert.equal(raw.includes(token), false);

    let called = false;
    const alone = await submitFeedback(
      input({
        text: '',
        ip: '203.0.113.81',
        image: jpegWithExif('OTHER-TOKEN'),
      }),
      {
        reply: async () => {
          called = true;
          return null;
        },
      },
    );
    assert.equal(alone.ok, true);
    if (alone.ok) assert.equal(alone.reply, FEEDBACK_ACK);
    assert.equal(called, false);
    const again = await listFeedbackForAdmin();
    assert.equal(again.some((note) => note.hasImage && note.body === ''), true);
  });

  it('refuses a non-image and drops the jpeg when the account or the 90 days go', async () => {
    let called = false;
    const gif = await submitFeedback(
      input({
        text: 'pas une image merci',
        ip: '203.0.113.82',
        image: new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
      }),
      {
        reply: async () => {
          called = true;
          return null;
        },
      },
    );
    assert.equal(gif.ok, false);
    if (!gif.ok) {
      assert.equal(gif.status, 400);
      assert.equal(gif.error, IMAGE_SEND_FAIL);
    }
    assert.equal(called, false);

    const heavy = await submitFeedback(
      input({
        text: 'trop lourd merci',
        ip: '203.0.113.83',
        image: (() => {
          const bytes = new Uint8Array(FEEDBACK_IMAGE_MAX_BYTES + 1);
          bytes[0] = 0xff;
          bytes[1] = 0xd8;
          bytes[2] = 0xff;
          return bytes;
        })(),
      }),
      { reply: async () => null },
    );
    assert.equal(heavy.ok, false);
    if (!heavy.ok) {
      assert.equal(heavy.status, 413);
      assert.equal(heavy.error, IMAGE_TOO_HEAVY);
    }

    const email = 'photo@example.com';
    const kept = await submitFeedback(
      input({
        text: 'capture a effacer',
        email,
        ip: '203.0.113.84',
        image: jpegWithExif('ACCOUNT-TOKEN'),
      }),
      { reply: async () => null },
    );
    assert.equal(kept.ok, true);
    const before = await listFeedbackForAdmin();
    const row = before.find((note) => note.body.includes('capture a effacer'));
    assert.equal(row?.hasImage, true);
    await deleteFeedbackForEmail(email);
    assert.equal(row ? await readFeedbackImageForAdmin(row.id) : null, null);

    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const expired = await insertFeedbackNote({
      kind: 'bug',
      body: 'vieille capture',
      userKey: null,
      ccVid: 'v_imgold123',
      reply: null,
      createdAt: old,
      image: jpegWithExif('OLD-TOKEN'),
    });
    assert.equal(await readFeedbackImageForAdmin(expired.id), null);
    const notes = await listFeedbackForAdmin();
    assert.equal(notes.some((note) => note.id === expired.id), false);
  });
});

describe('feedback surfaces', () => {
  it('mounts the widget, gates admin lecture, and states the RGPD notice', () => {
    const widget = readFileSync(
      new URL('../components/FeedbackChat.tsx', import.meta.url),
      'utf8',
    );
    const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
    const page = readFileSync(
      new URL('../app/admin/feedback/page.tsx', import.meta.url),
      'utf8',
    );
    const adminApi = readFileSync(
      new URL('../app/api/admin/feedback/route.ts', import.meta.url),
      'utf8',
    );
    const post = readFileSync(
      new URL('../app/api/feedback/route.ts', import.meta.url),
      'utf8',
    );
    const submit = readFileSync(new URL('./feedbackSubmit.ts', import.meta.url), 'utf8');
    const ai = readFileSync(new URL('./feedbackAi.ts', import.meta.url), 'utf8');
    const del = readFileSync(
      new URL('../app/api/account-tastes/route.ts', import.meta.url),
      'utf8',
    );
    const conf = readFileSync(
      new URL('../app/confidentialite/page.tsx', import.meta.url),
      'utf8',
    );
    const purgeRoute = readFileSync(
      new URL('../app/api/feedback/purge/route.ts', import.meta.url),
      'utf8',
    );
    const vercel = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');

    assert.match(layout, /FeedbackChat/);
    assert.equal(
      widget.includes(
        'Bienvenue sur Plan C — on est en phase de test. Ce robot est là pour recueillir tes impressions (suggestion ou bug). Dis-moi ce que tu penses.',
      ),
      true,
    );
    assert.equal(widget.includes('Une phrase suffit'), false);
    assert.equal(widget.includes('phase de test…'), false);
    assert.equal(widget.includes('line-clamp'), false);
    assert.equal(widget.includes('truncate'), false);
    assert.equal(widget.includes('balance'), false);
    assert.match(widget, /id: 'greet', role: 'bot', text: GREETING/);
    assert.match(widget, /feedback-welcome-c-wink\.svg/);
    assert.match(widget, /hidden h-12 w-12 shrink-0 sm:block/);
    assert.match(widget, /Un avis \?/);
    assert.match(widget, /aria-label=\{LAUNCHER_LABEL\}/);
    assert.match(widget, /plan-c-icon-LOCK-v3-violet\.jpg/);
    assert.match(widget, /Suggestion/);
    assert.match(widget, /Bug/);
    assert.ok(widget.indexOf("label: 'Bug'") < widget.indexOf("label: 'Suggestion'"));
    assert.match(widget, /kind: 'idee'/);
    assert.match(widget, /kind: 'bug'/);
    assert.match(widget, /fieldForTrack/);
    assert.match(widget, /clearStub/);
    assert.match(widget, /bg-culture-terracotta text-planc-nuit/);
    assert.match(widget, /BUG_QUESTION/);
    assert.match(widget, /SUGGESTION_QUESTION/);
    assert.ok(
      widget.indexOf('aria-label="Type de message"') <
        widget.indexOf("aria-label={active.kind === 'bug' ? 'Type de bug' : 'Type de suggestion'}"),
    );
    assert.match(widget, /listRef/);
    assert.match(widget, /data-feedback-end/);
    assert.match(widget, /pwa-install-sheet/);
    assert.match(widget, /data-consent-banner/);
    assert.match(widget, /90 jours/);
    assert.match(widget, /N’écris pas ton e-mail/);
    assert.match(widget, /modèle \(US\)/);
    assert.equal(widget.includes('OPENAI'), false);
    assert.equal(widget.includes('feedbackAi'), false);
    assert.equal(widget.includes('cc_vid'), false);
    assert.match(widget, /\/admin/);
    assert.doesNotMatch(widget, /entraîn|training|fine-?tun/i);

    assert.match(page, /isAdminSession/);
    assert.match(page, /notFound\(\)/);
    assert.match(page, /bug: 'bug'/);
    assert.match(adminApi, /isAdminSession/);
    assert.match(adminApi, /status: 404/);
    assert.match(post, /submitFeedback/);
    assert.match(post, /cookieVid: vid/);
    assert.match(post, /kind/);
    assert.match(submit, /feedbackKind\(input\.kind\)/);
    assert.match(submit, /chosen \?\? ai\?\.kind/);
    assert.match(ai, /import 'server-only'/);
    assert.match(ai, /avis \| idee \| bug \| autre/);
    assert.match(ai, /OPENAI_API_KEY/);
    assert.match(ai, /max_tokens: FEEDBACK_MAX_TOKENS/);
    assert.equal(ai.includes('XAI_API_KEY'), false);
    assert.equal(ai.includes('x.ai'), false);
    assert.match(del, /deleteFeedbackForEmail/);
    assert.match(purgeRoute, /CRON_SECRET/);
    assert.match(purgeRoute, /bearerAuthorizesDigest/);
    assert.match(purgeRoute, /status: 401/);
    assert.match(vercel, /\/api\/feedback\/purge/);

    assert.match(conf, /Un avis/);
    assert.match(conf, /90&nbsp;jours/);
    assert.match(conf, /empreinte/);
    assert.match(conf, /Avis et idées/);
    assert.match(conf, /Neon \(Paris\)/);
    assert.match(conf, /OpenAI \(États-Unis\)/);
    assert.match(conf, /garanties adaptées/);
    assert.match(conf, /\(DPA\)/);
    assert.match(conf, /\(SCC\)/);
    assert.match(conf, /ne sert pas à entraîner/);
    assert.match(conf, /intérêt légitime/);
    assert.match(conf, /pas un consentement séparé/);
    assert.match(conf, /seulement en écrivant/);
    assert.match(conf, /Intérêt légitime/);
    assert.match(conf, /Elle n’est pas envoyée à OpenAI/);

    const capture = readFileSync(new URL('./feedbackCapture.ts', import.meta.url), 'utf8');
    const imageRoute = readFileSync(
      new URL('../app/api/admin/feedback/[id]/image/route.ts', import.meta.url),
      'utf8',
    );
    assert.equal(ATTACH_LABEL, 'Joindre une capture');
    assert.equal(IMAGE_TOO_HEAVY, 'Image trop lourde (max 5 Mo)');
    assert.equal(IMAGE_SEND_FAIL, 'Impossible d’envoyer l’image — réessaie');
    assert.equal(IMAGE_PERMISSION, 'Tu peux autoriser dans Réglages');
    assert.equal(FEEDBACK_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
    assert.match(widget, /data-feedback="attach"/);
    assert.match(widget, /aria-label=\{ATTACH_LABEL\}/);
    assert.match(widget, /accept="image\/\*"/);
    assert.match(widget, /type="file"/);
    assert.equal(widget.includes('capture='), false);
    assert.equal(widget.includes('multiple'), false);
    assert.equal(widget.includes('getDisplayMedia'), false);
    assert.equal(capture.includes('getDisplayMedia'), false);
    assert.equal(/MediaRecorder|tesseract|webkitNotifications/i.test(widget + capture + submit), false);
    assert.match(capture, /image\/jpeg/);
    assert.match(submit, /replyFn\(body\)/);
    assert.match(submit, /if \(body\)/);
    assert.match(page, /note\.hasImage/);
    assert.match(page, /\/api\/admin\/feedback\//);
    assert.match(imageRoute, /isAdminSession/);
    assert.match(imageRoute, /status: 404/);
    assert.match(post, /formData/);
    assert.equal(ai.includes('image_bytes'), false);
    assert.equal(ai.includes('prepareFeedbackImage'), false);
  });
});

describe('feedback chip prefill', () => {
  it('locks the subtype lists and the follow-up questions', () => {
    assert.deepEqual([...BUG_SUBTYPES], ['Affichage', 'Filtres', 'Connexion', 'Autre']);
    assert.deepEqual(
      [...SUGGESTION_SUBTYPES],
      ['Idée produit', 'Contenu manquant', 'Amélioration', 'Autre'],
    );
    assert.equal(BUG_SUBTYPES.at(-1), 'Autre');
    assert.equal(SUGGESTION_SUBTYPES.at(-1), 'Autre');
    assert.equal(BUG_QUESTION, 'Quel type de bug ?');
    assert.equal(SUGGESTION_QUESTION, 'Quel type de suggestion ?');
    assert.equal(BUG_STUB, 'J’ai repéré un bug : ');
    assert.equal(SUGGESTION_STUB, 'Voici une suggestion : ');
    assert.equal(BUG_STUB.endsWith(' '), true);
    assert.equal(SUGGESTION_STUB.endsWith(' '), true);
  });

  it('swaps the stub only when the field is empty or still the previous stub', () => {
    assert.equal(fieldForTrack('', null, BUG_STUB), BUG_STUB);
    assert.equal(fieldForTrack('   ', null, SUGGESTION_STUB), SUGGESTION_STUB);
    assert.equal(fieldForTrack(BUG_STUB, BUG_STUB, SUGGESTION_STUB), SUGGESTION_STUB);
    assert.equal(fieldForTrack('', BUG_STUB, SUGGESTION_STUB), SUGGESTION_STUB);
    const edited = `${BUG_STUB}le titre déborde`;
    assert.equal(fieldForTrack(edited, BUG_STUB, SUGGESTION_STUB), edited);
    assert.equal(clearStub(BUG_STUB, BUG_STUB), '');
    assert.equal(clearStub(edited, BUG_STUB), edited);
  });
});

function jpegWithExif(token: string): Uint8Array {
  const payload = new TextEncoder().encode(`EXIF\0\0${token}`);
  const len = 2 + payload.length;
  const bytes = new Uint8Array(2 + 2 + 2 + payload.length + 2);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe1;
  bytes[4] = (len >> 8) & 0xff;
  bytes[5] = len & 0xff;
  bytes.set(payload, 6);
  bytes[bytes.length - 2] = 0xff;
  bytes[bytes.length - 1] = 0xd9;
  return bytes;
}
