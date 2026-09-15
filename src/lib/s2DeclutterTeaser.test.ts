import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HOME_ACCROCHE_H1, HOME_ACCROCHE_H2 } from './displayHome';

const APOSTROPHE = '’';

describe('S2 header accroche LOCK', () => {
  it('uses typographic apostrophe and locked H1/H2', () => {
    assert.equal(HOME_ACCROCHE_H1, 'L’agenda culturel de Toulouse.');
    assert.equal(HOME_ACCROCHE_H2, 'Trouvez une sortie, partagez, voyez qui vient.');
    assert.ok(HOME_ACCROCHE_H1.includes(APOSTROPHE));
    assert.equal(HOME_ACCROCHE_H1.includes("'"), false);
    assert.equal(HOME_ACCROCHE_H2.includes("'"), false);
    assert.equal(/Je cherche/.test(HOME_ACCROCHE_H1 + HOME_ACCROCHE_H2), false);
    assert.equal(/vous venez/.test(HOME_ACCROCHE_H1 + HOME_ACCROCHE_H2), false);
  });

  it('paints H1+H2 on home + boot, 0 onboarding screens', async () => {
    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    const boot = await readFile(
      new URL('../components/HomeTop3BootFallback.tsx', import.meta.url),
      'utf8',
    );
    const accroche = await readFile(
      new URL('../components/HomeAccroche.tsx', import.meta.url),
      'utf8',
    );
    assert.match(app, /<HomeAccroche/);
    assert.match(boot, /<HomeAccroche/);
    assert.match(accroche, /HOME_ACCROCHE_H1/);
    assert.match(accroche, /HOME_ACCROCHE_H2/);
    assert.match(accroche, /home-accroche-h2/);
    assert.equal(app.includes('sr-only">Agenda CultureConnect'), false);
    assert.equal(boot.includes('sr-only">Agenda CultureConnect'), false);
    assert.equal(/Je cherche/.test(app), false);
    assert.equal(/onboarding/i.test(accroche), false);
    assert.equal(/3 steps|étape 1/i.test(app), false);
  });
});

describe('declutter cartes/fiche LOCK', () => {
  it('Réserver is the only primary text CTA; share is icon-only', async () => {
    const share = await readFile(
      new URL('../components/ShareButton.tsx', import.meta.url),
      'utf8',
    );
    const cta = await readFile(
      new URL('../components/EventCtaRow.tsx', import.meta.url),
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
    const more = await readFile(
      new URL('../components/MoreActionsMenu.tsx', import.meta.url),
      'utf8',
    );
    assert.match(share, /share-icon/);
    assert.match(share, /aria-label=\{copied \? 'Lien copié'/);
    assert.match(share, /M18 16\.08/);
    assert.match(share, /h-10 w-10/);
    assert.equal(/>Partager</.test(share), false);
    assert.match(cta, /Réserver/);
    assert.match(cta, /shrink-0/);
    assert.equal(cta.includes('flex-1'), false);
    assert.equal(cta.includes('w-full'), false);
    assert.match(cta, /<ShareButton/);
    assert.match(cta, /<MoreActionsMenu/);
    assert.equal(/inline\?:/.test(cta), false);
    assert.equal(/inline\s*=/.test(cta), false);
    assert.match(detail, /<EventCtaRow/);
    assert.match(carousel, /<EventCtaRow/);
    assert.equal(detail.includes('<FavoriteButton'), false);
    assert.equal(carousel.includes('<FavoriteButton'), false);
    assert.equal(detail.includes('Google Agenda'), false);
    assert.equal(carousel.includes('Google Agenda'), false);
    assert.match(more, /Ajouter à mes goûts \/ favori/);
    assert.match(more, /Google Agenda/);
    assert.match(more, /Télécharger \.ics/);
    assert.equal(/j[’']aime artiste/i.test(detail), false);
    assert.equal(/onboarding/i.test(detail), false);
    const picker = await readFile(
      new URL('../components/CineSeancePicker.tsx', import.meta.url),
      'utf8',
    );
    const providers = await readFile(
      new URL('../components/Providers.tsx', import.meta.url),
      'utf8',
    );
    assert.match(picker, /<EventCtaRow/);
    assert.match(picker, /grid-cols-2/);
    assert.equal(picker.includes('inline'), false);
    assert.equal(providers.includes('FirstLoginModal'), false);
    assert.equal(providers.includes('welcome'), false);
  });

  it('inventory CUTs: no welcome sheet, no cine chrome Partager/Agenda/ics/♥', async () => {
    const componentsDir = fileURLToPath(
      new URL('../components/', import.meta.url),
    );
    assert.equal(existsSync(`${componentsDir}FirstLoginModal.tsx`), false);
    assert.equal(existsSync(`${componentsDir}FavoriteButton.tsx`), false);
    const names = (await readdir(componentsDir)).filter((n) => n.endsWith('.tsx'));
    const files = await Promise.all(
      names.map(async (n) => ({
        n,
        src: await readFile(`${componentsDir}${n}`, 'utf8'),
      })),
    );
    for (const { n, src } of files) {
      assert.equal(/C[’']est bon, j[’']y vais/.test(src), false, n);
      assert.equal(src.includes('Ajouter aux à voir'), false, n);
      assert.equal(/>Partager</.test(src), false, n);
      if (n !== 'MoreActionsMenu.tsx') {
        assert.equal(src.includes('Google Agenda'), false, n);
        assert.equal(src.includes('Télécharger .ics'), false, n);
      }
    }
    const social = files.find((f) => f.n === 'ShareSocial.tsx')?.src || '';
    assert.match(social, /if \(token\) \{\s*return <DaughterRsvp/);
    const cta = files.find((f) => f.n === 'EventCtaRow.tsx')?.src || '';
    assert.match(cta, /<ShareButton/);
    assert.match(cta, /<MoreActionsMenu/);
    assert.match(cta, /Réserver/);
  });

  it('grid cards demote favori; Envie/J’y vais stay on daughter fiche only', async () => {
    const card = await readFile(
      new URL('../components/SeanceCard.tsx', import.meta.url),
      'utf8',
    );
    const live = await readFile(
      new URL('../components/LiveCarousel.tsx', import.meta.url),
      'utf8',
    );
    const social = await readFile(
      new URL('../components/ShareSocial.tsx', import.meta.url),
      'utf8',
    );
    assert.equal(card.includes('FavoriteButton'), false);
    assert.equal(live.includes('FavoriteButton'), false);
    assert.match(social, /Envie/);
    assert.match(social, /J’y vais/);
    assert.match(social, /share-rsvp-daughter/);
    assert.match(social, /visibleMotherStats/);
  });
});

describe('guest teaser cloche KEEP + connected inbox', () => {
  it('guest bell is a separate teaser; signed-in inbox stays #123', async () => {
    const auth = await readFile(
      new URL('../components/AuthButtons.tsx', import.meta.url),
      'utf8',
    );
    const teaser = await readFile(
      new URL('../components/GuestTeaserBell.tsx', import.meta.url),
      'utf8',
    );
    const inbox = await readFile(
      new URL('../components/ActivityInbox.tsx', import.meta.url),
      'utf8',
    );
    assert.match(auth, /<ActivityInbox \/>/);
    assert.equal(auth.split('<ActivityInbox').length - 1, 1);
    assert.match(auth, /<GuestTeaserBell \/>/);
    const guestUi = auth.slice(auth.indexOf('data-account-control="login"'));
    assert.equal(guestUi.includes('ActivityInbox'), false);
    assert.match(teaser, /guest-teaser-bell/);
    assert.match(teaser, /guest-teaser-sheet/);
    assert.match(teaser, /guestTeaserTitle/);
    assert.match(teaser, /GUEST_TEASER_SHEET_SUB/);
    assert.match(teaser, /readGuestCreatedTokens/);
    assert.match(teaser, /fetchGuestTeaserCount/);
    assert.equal(teaser.includes('fetchTokenReactions'), false);
    assert.equal(/Ludo/.test(teaser), false);
    assert.equal(/firstName/.test(teaser), false);
    assert.equal(/y va/.test(teaser), false);
    assert.match(inbox, /share-activity-bell/);
    assert.match(inbox, /Mes partages/);
    assert.match(inbox, /if \(!signedIn\) return null/);
  });
});
