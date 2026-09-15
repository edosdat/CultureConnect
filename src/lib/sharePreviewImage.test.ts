import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARE_OG_FALLBACK_ORIGIN,
  SHARE_OG_SIZE,
  fillEmptyCatalogueImageUrl,
  isOgGeneratorUrl,
  publicAppOrigin,
  shareOgFallbackUrl,
  sharePreviewImageUrl,
  sharePreviewOgImage,
  usableHttpsImageUrl,
} from './sharePreviewImage';

const ORIGIN = 'https://culture-connect.example';
const ODYSSEE_POSTER =
  'https://fr.web.img6.acsta.net/img/a7/70/a770a3822c90a655af05961cda53f3a1.jpg';
const DATA_SVG =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20300%20450'%3E%3C/svg%3E";

describe('usableHttpsImageUrl', () => {
  it('keeps an HTTPS catalogue photo (L’Odyssée / acsta)', () => {
    assert.equal(usableHttpsImageUrl(ODYSSEE_POSTER), ODYSSEE_POSTER);
  });

  it('rejects empty, relative, and data: placeholders', () => {
    assert.equal(usableHttpsImageUrl(''), '');
    assert.equal(usableHttpsImageUrl('   '), '');
    assert.equal(usableHttpsImageUrl('/api/og?e=p:P1866'), '');
    assert.equal(usableHttpsImageUrl(DATA_SVG), '');
    assert.equal(usableHttpsImageUrl('not a url'), '');
  });

  it('rejects http:// (crawlers drop mixed-content og:image)', () => {
    assert.equal(
      usableHttpsImageUrl('http://example.com/poster.jpg'),
      '',
    );
  });

  it('upgrades protocol-relative to https', () => {
    assert.equal(
      usableHttpsImageUrl('//cdn.example/p.jpg'),
      'https://cdn.example/p.jpg',
    );
  });
});

describe('fillEmptyCatalogueImageUrl', () => {
  it('keeps a present image_url (never overwrite)', () => {
    assert.equal(
      fillEmptyCatalogueImageUrl(ODYSSEE_POSTER, 'F0002', 'https://other/x.jpg'),
      ODYSSEE_POSTER,
    );
  });

  it('copies films.csv poster when image_url is blank and film_id is set', () => {
    assert.equal(
      fillEmptyCatalogueImageUrl('', 'F0002', ODYSSEE_POSTER),
      ODYSSEE_POSTER,
    );
  });

  it('stays blank without film_id (meta must still fall back to /api/og)', () => {
    assert.equal(fillEmptyCatalogueImageUrl('', '', ODYSSEE_POSTER), '');
    assert.equal(fillEmptyCatalogueImageUrl('', 'F0002', ''), '');
  });
});

describe('sharePreviewImageUrl', () => {
  it('prefers HTTPS event photo over the OG generator', () => {
    assert.equal(
      sharePreviewImageUrl({
        origin: ORIGIN,
        itemKey: 'p:P0280',
        candidates: [ODYSSEE_POSTER],
      }),
      ODYSSEE_POSTER,
    );
  });

  it('skips data: SVG placeholders and uses absolute /api/og', () => {
    assert.equal(
      sharePreviewImageUrl({
        origin: ORIGIN,
        itemKey: 'p:P1866',
        candidates: [DATA_SVG],
      }),
      `${ORIGIN}/api/og?e=${encodeURIComponent('p:P1866')}`,
    );
  });

  it('blank image_url → absolute /api/og?e= (never relative or empty)', () => {
    const url = sharePreviewImageUrl({
      origin: ORIGIN,
      itemKey: 'p:P1412',
      candidates: ['', '  '],
    });
    assert.equal(url.startsWith('https://'), true);
    assert.equal(url.includes('/api/og?e='), true);
    assert.equal(url.startsWith('/'), false);
    assert.ok(url.length > 0);
  });

  it('uses the next HTTPS candidate (films.csv fill-empty)', () => {
    assert.equal(
      sharePreviewImageUrl({
        origin: ORIGIN,
        itemKey: 'p:PTMP_L141_0_08271600',
        candidates: ['', DATA_SVG, ODYSSEE_POSTER],
      }),
      ODYSSEE_POSTER,
    );
  });

  it('encodes the item key on the OG fallback', () => {
    const url = sharePreviewImageUrl({
      origin: ORIGIN,
      itemKey: 'p:P1866',
    });
    assert.equal(url, `${ORIGIN}/api/og?e=p%3AP1866`);
  });
});

describe('sharePreviewOgImage', () => {
  it('sets 1200×630 only on the generated OG card', () => {
    const photo = sharePreviewOgImage({
      origin: ORIGIN,
      itemKey: 'p:P0280',
      candidates: [ODYSSEE_POSTER],
      alt: 'L’Odyssée',
    });
    assert.equal(photo.url, ODYSSEE_POSTER);
    assert.equal(photo.width, undefined);
    assert.equal(photo.height, undefined);
    assert.equal(photo.alt, 'L’Odyssée');

    const generated = sharePreviewOgImage({
      origin: ORIGIN,
      itemKey: 'p:P1866',
      candidates: [DATA_SVG],
    });
    assert.equal(generated.width, SHARE_OG_SIZE.width);
    assert.equal(generated.height, SHARE_OG_SIZE.height);
    assert.equal(isOgGeneratorUrl(generated.url), true);
  });
});

describe('publicAppOrigin', () => {
  it('prefers AUTH_URL then NEXTAUTH_URL then VERCEL_URL', () => {
    assert.equal(
      publicAppOrigin({ AUTH_URL: 'https://auth.example' }),
      'https://auth.example',
    );
    assert.equal(
      publicAppOrigin({ NEXTAUTH_URL: 'https://next.example' }),
      'https://next.example',
    );
    assert.equal(
      publicAppOrigin({ VERCEL_URL: 'preview.vercel.app' }),
      'https://preview.vercel.app',
    );
    assert.equal(publicAppOrigin({}), SHARE_OG_FALLBACK_ORIGIN);
  });

  it('forces https on public hosts', () => {
    assert.equal(
      publicAppOrigin({ NEXTAUTH_URL: 'http://culture-connect.example' }),
      'https://culture-connect.example',
    );
  });
});

describe('shareOgFallbackUrl', () => {
  it('never returns a relative path', () => {
    const url = shareOgFallbackUrl(ORIGIN, 'p:P1');
    assert.equal(url.startsWith('https://'), true);
    assert.match(url, /\/api\/og\?e=/);
  });
});
