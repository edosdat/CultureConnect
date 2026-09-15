import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('S1 header 380 — avatar + cloche, Mes goûts in menu', () => {
  it('drops the Mes goûts chip from the header; menu + Artistes stay', async () => {
    const auth = await readFile(
      new URL('../components/AuthButtons.tsx', import.meta.url),
      'utf8',
    );
    assert.equal(auth.includes('data-account-control="mes-gouts"'), false);
    assert.equal(auth.includes('data-account-control="mes-gouts-pending"'), false);
    assert.match(auth, /data-account-control="mes-gouts-menu"/);
    assert.match(auth, /bg-culture-cream/);
    assert.match(auth, /bg-culture-ink/);
    assert.match(auth, /<ActivityInbox \/>/);
    assert.match(auth, /aria-label="Menu compte"/);
    assert.match(auth, /data-account-control="avatar-pending"/);
    assert.match(auth, /h-\[34px\]/);

    const nav = await readFile(
      new URL('../components/SiteNav.tsx', import.meta.url),
      'utf8',
    );
    assert.match(nav, /href: '\/artistes', label: 'Artistes'/);
    assert.match(nav, /<AuthButtons \/>/);
    assert.match(nav, /bg-white/);

    const inbox = await readFile(
      new URL('../components/ActivityInbox.tsx', import.meta.url),
      'utf8',
    );
    assert.match(inbox, /h-\[34px\]/);
  });
});

describe('S1 home loading — cine + theatre shells, never silent more', () => {
  it('first HTML ships theatre with cine; boot fallback paints both shells', async () => {
    const query = await readFile(
      new URL('./agendaQuery.ts', import.meta.url),
      'utf8',
    );
    assert.match(query, /HOME_FIRST_PAINT_THEATRE_CAP/);
    assert.match(query, /vivantItems: theatrePage/);
    assert.match(query, /home-first-paint-v3/);
    assert.equal(
      /function assembleHomeFirstPaint[\s\S]*?vivantItems: \[\]/.test(query),
      false,
    );

    const slim = await readFile(new URL('./slim.ts', import.meta.url), 'utf8');
    assert.match(slim, /HOME_FIRST_PAINT_THEATRE_CAP = 6/);

    const boot = await readFile(
      new URL('../components/HomeTop3BootFallback.tsx', import.meta.url),
      'utf8',
    );
    assert.match(boot, /id="cine"/);
    assert.match(boot, /id="theatre"/);
    assert.match(boot, /title="Cinéma"/);
    assert.match(boot, /title="Théâtre"/);
    assert.match(boot, /PackRailSkeleton/);

    const shell = await readFile(
      new URL('../components/PackRailSkeleton.tsx', import.meta.url),
      'utf8',
    );
    assert.match(shell, /grid-cols-2/);
    assert.match(shell, /cc-s1-ph-cine/);
    assert.match(shell, /cc-s1-ph-theatre/);
    assert.match(shell, /cc-s1-skel/);
    assert.match(shell, /HOME_PACK_MORE_ELLIPSIS/);

    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    assert.match(app, /homePackShellVisible/);
    assert.match(app, /PackRailSkeleton/);
    assert.match(app, /loadingMore=\{Boolean\(packMorePending.cine\)\}/);
    assert.match(app, /loadingMore=\{Boolean\(packMorePending.theatre\)\}/);
    assert.match(app, /where === 'bottom'/);

    const carousel = await readFile(
      new URL('../components/CinemaCarousel.tsx', import.meta.url),
      'utf8',
    );
    assert.match(carousel, /loadingMore/);
    assert.match(carousel, /data-pack-more-skeleton/);
    assert.match(carousel, /HOME_PACK_MORE_ELLIPSIS/);
  });
});

describe('S1 deep-link share — fiche + photo first, social skeleton', () => {
  it('paints fiche/photo before catalogue; social is blur until data', async () => {
    const page = await readFile(
      new URL('../app/page.tsx', import.meta.url),
      'utf8',
    );
    assert.match(page, /HomePageGate/);
    assert.match(page, /DeepLinkFicheFallback/);
    assert.match(page, /loadHomeFirstPaint/);
    const gate = page.slice(page.indexOf('async function HomePageGate'));
    assert.ok(gate.indexOf('queryAgendaDetail') < gate.indexOf('HomePageApp'));
    assert.ok(gate.indexOf('DeepLinkFicheFallback') < gate.indexOf('loadHomeFirstPaint()'));

    const fallback = await readFile(
      new URL('../components/DeepLinkFicheFallback.tsx', import.meta.url),
      'utf8',
    );
    assert.match(fallback, /data-deeplink-fiche-boot/);
    assert.match(fallback, /className="hero/);
    assert.match(fallback, /share-social-pending/);
    assert.match(fallback, /cc-s1-skbtn/);
    assert.match(fallback, /showCatalogueShell = true/);
    assert.match(fallback, /showCatalogueShell \? <HomeTop3BootFallback/);

    const social = await readFile(
      new URL('../components/ShareSocial.tsx', import.meta.url),
      'utf8',
    );
    assert.match(social, /share-social-pending/);
    assert.match(social, /cc-s1-skbtn/);
    assert.match(social, /if \(!settled\) return <SocialSkeleton/);
    assert.equal(/Matching A/i.test(social), false);

    const detail = await readFile(
      new URL('../components/EventDetail.tsx', import.meta.url),
      'utf8',
    );
    const cineFrameCount = detail.split('<CineFicheFrame').length - 1;
    const filmPosterCount = detail.split('<FilmPoster').length - 1;
    assert.ok(
      cineFrameCount >= 2,
      `cine fiche still paints photo first via CineFicheFrame (${cineFrameCount})`,
    );
    assert.ok(
      filmPosterCount >= 2,
      `fiche paints photo on living-arts too (${filmPosterCount})`,
    );
    assert.equal(/S5|#121/i.test(detail + social + page), false);
  });
});
