import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

describe('cine fiche web split + compact action row', () => {
  /**
   * Live ref FAIL (`briefs/v1-beta/mocks/fiche-cine-live-ref.png`):
   * desktop full-bleed stack + full-width Réserver.
   * Target: mock `fiche-cine-web-split-1280` — 1/4|3/4 + compact Réserver.
   */
  it('web ≥900 is 1/4 | 3/4 (KEEP — do not change)', async () => {
    const frame = await readFile(
      new URL('../components/CineFicheFrame.tsx', import.meta.url),
      'utf8',
    );
    const detail = await readFile(
      new URL('../components/EventDetail.tsx', import.meta.url),
      'utf8',
    );
    const carousel = await readFile(
      new URL('../components/CinemaCarousel.tsx', import.meta.url),
      'utf8',
    );
    const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

    assert.match(frame, /data-testid="cine-fiche-split"/);
    assert.match(frame, /min-\[900px\]:grid-cols-\[1fr_3fr\]/);
    assert.equal(frame.includes('md:grid-cols'), false);

    assert.match(detail, /<CineFicheFrame/);
    assert.match(detail, /min-\[900px\]:max-w-6xl/);
    assert.match(detail, /<FicheCast/);

    assert.match(carousel, /cine-fiche-split/);
    assert.match(carousel, /min-\[900px\]:grid-cols-\[1fr_3fr\]/);
    assert.match(carousel, /pack === 'cine' \? <FicheCast item=\{detailItem \?\? item\}/);
    assert.equal(carousel.includes("pack === 'theatre' ? <FicheCast"), false);

    assert.match(css, /min-width: 900px/);
    assert.match(css, /\.cine-fiche-split \.cine-hero-frame/);
    assert.match(css, /max-height: none/);
    assert.match(css, /portrait column beside text/);
  });

  it('action row is salle · horaire · compact Réserver · share · ⋯', async () => {
    const picker = await readFile(
      new URL('../components/CineSeancePicker.tsx', import.meta.url),
      'utf8',
    );
    const cta = await readFile(
      new URL('../components/EventCtaRow.tsx', import.meta.url),
      'utf8',
    );
    const share = await readFile(
      new URL('../components/ShareButton.tsx', import.meta.url),
      'utf8',
    );

    assert.match(picker, /data-testid="cine-action-row"/);
    assert.match(picker, /grid-cols-2/);
    assert.match(picker, /min-\[900px\]:contents/);
    assert.match(picker, /min-\[900px\]:flex-row/);
    assert.match(picker, /<EventCtaRow/);
    assert.equal(picker.includes('hidden md:'), false);
    assert.equal(picker.includes('inline'), false);

    assert.match(cta, /shrink-0/);
    assert.match(cta, /Réserver/);
    assert.match(cta, /<ShareButton/);
    assert.match(cta, /<MoreActionsMenu/);
    assert.equal(cta.includes('flex-1'), false);
    assert.equal(cta.includes('w-full'), false);

    assert.match(share, /share-icon/);
    assert.match(share, /M18 16\.08/);
    assert.equal(/>Partager</.test(share), false);
  });

  it('keeps live-ref before vs web-split mock after', async () => {
    const mocks = fileURLToPath(new URL('../../briefs/v1-beta/mocks/', import.meta.url));
    const brief = await readFile(
      new URL('../../briefs/v1-beta/fiche-cine-web-split.md', import.meta.url),
      'utf8',
    );
    assert.equal(existsSync(`${mocks}fiche-cine-live-ref.png`), true);
    assert.equal(existsSync(`${mocks}fiche-cine-web-split-1280.html`), true);
    assert.match(brief, /fiche-cine-live-ref\.png/);
    assert.match(brief, /full-bleed/i);
    assert.match(brief, /Réserver full-width = FAIL/);
    assert.match(brief, /1\/4 image/);
  });
});

describe('cine fiche mobile split essai (~380, ciné only)', () => {
  /**
   * Eloi GO 15/09 — override Design KEEP stack.
   * QA LOCK: readable contain frame · max W+H · height ≤ useful text · ciné only.
   */
  it('mobile is ~32% constrained contain frame | ~68% text', async () => {
    const frame = await readFile(
      new URL('../components/CineFicheFrame.tsx', import.meta.url),
      'utf8',
    );
    const carousel = await readFile(
      new URL('../components/CinemaCarousel.tsx', import.meta.url),
      'utf8',
    );
    const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

    assert.match(frame, /data-cine-mobile-split="1"/);
    assert.match(frame, /grid-cols-\[minmax\(0,32%\)_minmax\(0,1fr\)\]/);
    assert.equal(frame.includes('flex flex-col'), false);

    assert.match(carousel, /grid-cols-\[minmax\(0,32%\)_minmax\(0,1fr\)\]/);
    assert.match(carousel, /data-cine-mobile-split=\{pack === 'cine' \? '1'/);
    assert.equal(carousel.includes('flex flex-col min-[900px]:grid'), false);

    assert.match(css, /max-width: 899\.98px/);
    assert.match(css, /max-width: 7\.25rem/);
    assert.match(css, /max-height: 10rem/);
    assert.match(css, /object-fit: contain/);
    assert.match(css, /height: 0/);
    assert.match(css, /min-height: 100%/);
    assert.match(css, /constrained contain frame/);
  });

  it('théâtre / musique stay stacked — cine-fiche-split is ciné only', async () => {
    const carousel = await readFile(
      new URL('../components/CinemaCarousel.tsx', import.meta.url),
      'utf8',
    );
    const detail = await readFile(
      new URL('../components/EventDetail.tsx', import.meta.url),
      'utf8',
    );

    assert.match(carousel, /pack === 'cine'/);
    assert.match(carousel, /cine-fiche-split/);
    assert.equal(carousel.includes("pack === 'theatre'"), true);
    assert.equal(
      /pack === 'theatre'[\s\S]{0,80}cine-fiche-split/.test(carousel),
      false,
    );
    assert.match(detail, /cinemaFiche \? \(/);
    assert.match(detail, /<CineFicheFrame/);
    assert.equal(detail.includes('<CineFicheFrame'), true);
    const theatreStack =
      detail.includes('cinemaFiche ?') &&
      !detail.includes("pack === 'theatre' ? <CineFicheFrame");
    assert.equal(theatreStack, true);
  });

  it('locks essai brief + 380 mock', async () => {
    const mocks = fileURLToPath(new URL('../../briefs/v1-beta/mocks/', import.meta.url));
    const brief = await readFile(
      new URL('../../briefs/v1-beta/fiche-cine-mobile-split-essai.md', import.meta.url),
      'utf8',
    );
    assert.equal(existsSync(`${mocks}fiche-cine-mobile-split-essai-380.html`), true);
    assert.match(brief, /~32%/);
    assert.match(brief, /ciné only/);
    assert.match(brief, /object-fit|contain/i);
    assert.match(brief, /théâtre|theatre/i);
  });
});
