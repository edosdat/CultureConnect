import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogueImageSrc } from './catalogueImage';
import { homePackShellVisible } from './displayHome';
import { agendaGetIsAddressed } from './agendaParams';

const FROG =
  'https://web.archive.org/web/20260823025556im_/https://frogpubs.com/wp-content/uploads/2025/11/Frog-Social-Main.jpg';

describe('catalogueImageSrc', () => {
  it('drops the dead archive.org Frog poster so the rail never requests it', () => {
    assert.equal(catalogueImageSrc(FROG), '');
    assert.equal(
      catalogueImageSrc('https://archive.org/download/x/Frog-Social-Main.jpg'),
      '',
    );
    assert.equal(catalogueImageSrc('  '), '');
  });

  it('keeps a normal poster', () => {
    const src = 'https://fr.web.img6.acsta.net/pictures/x.jpg';
    assert.equal(catalogueImageSrc(src), src);
  });

  it('a failed poster does not hold the Ciné shell', () => {
    assert.equal(catalogueImageSrc(FROG), '');
    assert.equal(
      homePackShellVisible({
        sectionAllowed: true,
        rowCount: 0,
        packTotal: 0,
        cataloguePending: false,
      }),
      false,
    );
  });
});

describe('agenda GET addressing', () => {
  it('bare /api/agenda is not a list query', () => {
    assert.equal(agendaGetIsAddressed(new URLSearchParams()), false);
    assert.equal(agendaGetIsAddressed(new URLSearchParams('q=jazz')), false);
    assert.equal(
      agendaGetIsAddressed(new URLSearchParams('window=home')),
      true,
    );
    assert.equal(
      agendaGetIsAddressed(new URLSearchParams('scope=soir&date=2026-09-28')),
      true,
    );
    assert.equal(agendaGetIsAddressed(new URLSearchParams('id=p:1')), true);
  });

  it('the route refuses an unscoped GET before the list query', async () => {
    const route = await readFile(
      new URL('../app/api/agenda/route.ts', import.meta.url),
      'utf8',
    );
    const guard = route.indexOf('agendaGetIsAddressed');
    const heavy = route.indexOf('queryAgendaListCached');
    assert.ok(guard > 0 && heavy > guard);
  });

  it('home client fetches pass window, scope, or id', async () => {
    const files = [
      '../components/CultureConnectApp.tsx',
      '../components/CinemaCarousel.tsx',
      '../components/ShareVisitProvider.tsx',
      './agendaItemPrefetch.ts',
    ];
    for (const file of files) {
      const src = await readFile(new URL(file, import.meta.url), 'utf8');
      assert.equal(
        /fetch\(\s*[`'"]\/api\/agenda[`'"]/.test(src),
        false,
        file,
      );
    }
  });
});
