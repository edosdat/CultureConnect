import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import path from 'node:path';
import { MAIL_IDEAS_LABEL } from './mailConsent';
import { DIGEST_OPT_IN_GATE_AT } from './digestTestWindow';
import {
  DIGEST_TEST_INTRO_COPY,
  digestIntroPreviewRequested,
  digestIntroSeenLocally,
  digestTestWindowOpen,
  withIntroSeen,
} from './digestTestIntro';

const DURING = new Date('2026-10-01T12:00:00+02:00');
const AFTER = new Date('2026-12-01T00:00:00+01:00');

describe('digest test intro window and local flag', () => {
  it('stays open until the same Paris instant as the opt-in gate', () => {
    assert.equal(
      DIGEST_OPT_IN_GATE_AT,
      Date.parse('2026-12-01T00:00:00+01:00'),
    );
    assert.equal(digestTestWindowOpen(DURING), true);
    assert.equal(digestTestWindowOpen(AFTER), false);
  });

  it('remembers one email without marking the next account', () => {
    const stored = withIntroSeen('Ada@Example.com', null);
    assert.equal(digestIntroSeenLocally('ada@example.com', stored), true);
    assert.equal(digestIntroSeenLocally('bea@example.com', stored), false);
    const both = withIntroSeen('bea@example.com', stored);
    assert.equal(digestIntroSeenLocally('ada@example.com', both), true);
    assert.equal(digestIntroSeenLocally('bea@example.com', both), true);
  });

  it('keeps the twelve most recent emails', () => {
    let raw: string | null = null;
    for (let i = 0; i < 14; i += 1) raw = withIntroSeen(`u${i}@example.com`, raw);
    const list = JSON.parse(raw || '[]') as string[];
    assert.equal(list.length, 12);
    assert.equal(list.includes('u0@example.com'), false);
    assert.equal(list.includes('u13@example.com'), true);
  });

  it('reads the design preview query and ignores other values', () => {
    assert.equal(digestIntroPreviewRequested('?apercu=digeste'), true);
    assert.equal(digestIntroPreviewRequested('apercu=digeste&x=1'), true);
    assert.equal(digestIntroPreviewRequested('?apercu=1'), false);
    assert.equal(digestIntroPreviewRequested(''), false);
  });
});

describe('digest test intro copy', () => {
  it('explains the Thursday test mail, natural use, and one-click unsub', () => {
    const text = Object.values(DIGEST_TEST_INTRO_COPY).join('\n');
    assert.match(text, /jeudi/);
    assert.match(text, /au naturel/);
    assert.match(text, /un clic/);
    assert.match(text, /1er décembre/);
    assert.match(text, /Plan C est en test/);
    assert.ok(text.includes(MAIL_IDEAS_LABEL));
    assert.equal(text.includes("'"), false);
  });
});

describe('digest test intro wiring', () => {
  it('shows a soft card, marks seen only, and leaves LoginNudge guest-only', async () => {
    const root = process.cwd();
    const intro = await readFile(
      path.join(root, 'src/components/DigestTestIntro.tsx'),
      'utf8',
    );
    const footer = await readFile(
      path.join(root, 'src/components/SiteFooter.tsx'),
      'utf8',
    );
    const nudge = await readFile(
      path.join(root, 'src/components/LoginNudge.tsx'),
      'utf8',
    );
    const app = await readFile(
      path.join(root, 'src/components/CultureConnectApp.tsx'),
      'utf8',
    );
    const providers = await readFile(
      path.join(root, 'src/components/Providers.tsx'),
      'utf8',
    );
    const relance = await readFile(
      path.join(root, 'docs/relance-digest.md'),
      'utf8',
    );
    const design = await readFile(
      path.join(root, 'docs/design-brief.md'),
      'utf8',
    );

    assert.match(intro, /useSearchParams/);
    assert.match(intro, /previewQuery/);
    assert.match(intro, /aria-modal="false"/);
    assert.match(intro, /\[aria-modal="true"\]/);
    assert.match(footer, /Suspense/);
    assert.match(intro, /pointer-events-none/);
    assert.match(intro, /JSON\.stringify\(\{ seen: true \}\)/);
    assert.equal(intro.includes('opted'), false);
    assert.equal(intro.includes('MailIdeasCheckbox'), false);
    assert.equal(intro.includes('FirstLoginModal'), false);
    assert.equal(intro.includes('document.body.style.overflow'), false);
    assert.match(footer, /<DigestTestIntro/);
    assert.match(nudge, /session\?\.user/);
    assert.match(app, /<LoginNudge/);
    assert.equal(providers.includes('FirstLoginModal'), false);
    assert.match(relance, /mail_consent\.seen/);
    assert.match(relance, /apercu=digeste/);
    assert.match(design, /apercu=digeste/);
    assert.match(design, /aria-modal="false"/);
  });
});
