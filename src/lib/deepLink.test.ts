import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearDeepLinkUrlParams,
  hrefWithoutDeepLinkParams,
  normalizeDeepLinkId,
} from './deepLink';

describe('normalizeDeepLinkId', () => {
  it('accepts classic P/E bare ids', () => {
    assert.equal(normalizeDeepLinkId('P1847'), 'p:P1847');
    assert.equal(normalizeDeepLinkId('p1847'), 'p:P1847');
    assert.equal(normalizeDeepLinkId('E496'), 'e:E496');
    assert.equal(normalizeDeepLinkId('e496'), 'e:E496');
  });

  it('accepts letter-prefix P/E formats bare (B1b)', () => {
    assert.equal(normalizeDeepLinkId('PRIOP0022'), 'p:PRIOP0022');
    assert.equal(
      normalizeDeepLinkId('PTMP_L127_0_08241620'),
      'p:PTMP_L127_0_08241620',
    );
    assert.equal(normalizeDeepLinkId('PHG0005'), 'p:PHG0005');
    assert.equal(
      normalizeDeepLinkId('ETMP_L127_1000027856_0824'),
      'e:ETMP_L127_1000027856_0824',
    );
    assert.equal(normalizeDeepLinkId('EHG003'), 'e:EHG003');
  });

  it('leaves prefixed p:/e: paths unchanged (B1)', () => {
    assert.equal(normalizeDeepLinkId('p:PRIOP0022'), 'p:PRIOP0022');
    assert.equal(normalizeDeepLinkId('p:P1847'), 'p:P1847');
    assert.equal(normalizeDeepLinkId('e:E496'), 'e:E496');
    assert.equal(
      normalizeDeepLinkId('e:ETMP_L127_1000027856_0824'),
      'e:ETMP_L127_1000027856_0824',
    );
    assert.equal(normalizeDeepLinkId('p:TMPP0988'), 'p:TMPP0988');
    assert.equal(normalizeDeepLinkId('p:T90P2111'), 'p:T90P2111');
    assert.equal(normalizeDeepLinkId('p:FEP0023'), 'p:FEP0023');
    assert.equal(normalizeDeepLinkId('p:BARP0027'), 'p:BARP0027');
    assert.equal(normalizeDeepLinkId('p:UTPP0768'), 'p:UTPP0768');
    assert.equal(normalizeDeepLinkId('e:TMP0403'), 'e:TMP0403');
  });

  it('requires p:/e: when the id does not start with P/E', () => {
    assert.equal(normalizeDeepLinkId('TMPP0988'), null);
    assert.equal(normalizeDeepLinkId('T90P2111'), null);
    assert.equal(normalizeDeepLinkId('FEP0023'), null);
    assert.equal(normalizeDeepLinkId('BARP0027'), null);
    assert.equal(normalizeDeepLinkId('UTPP0768'), null);
    assert.equal(normalizeDeepLinkId('TMP0403'), null);
    assert.equal(normalizeDeepLinkId('p:TMPP0988'), 'p:TMPP0988');
    assert.equal(normalizeDeepLinkId('p:T90P2111'), 'p:T90P2111');
  });

  it('rejects XSS / unsafe charset (SAFE intact)', () => {
    assert.equal(normalizeDeepLinkId('<script>'), null);
    assert.equal(normalizeDeepLinkId('P1847/../x'), null);
    assert.equal(normalizeDeepLinkId('P1847?x=1'), null);
    assert.equal(normalizeDeepLinkId('javascript:alert(1)'), null);
    assert.equal(normalizeDeepLinkId('p:P1847<script>'), null);
    assert.equal(normalizeDeepLinkId('PRIOP0022%3Cimg'), null);
    assert.equal(normalizeDeepLinkId("P1847';DROP"), null);
  });

  it('rejects empty, prefix-only, and oversized input', () => {
    assert.equal(normalizeDeepLinkId(''), null);
    assert.equal(normalizeDeepLinkId('   '), null);
    assert.equal(normalizeDeepLinkId('p:'), null);
    assert.equal(normalizeDeepLinkId('e:'), null);
    assert.equal(normalizeDeepLinkId(`P${'1'.repeat(64)}`), null);
  });

  it('trims whitespace around a valid id', () => {
    assert.equal(normalizeDeepLinkId('  PRIOP0022  '), 'p:PRIOP0022');
    assert.equal(normalizeDeepLinkId('  p:T90P2111  '), 'p:T90P2111');
  });
});

describe('hrefWithoutDeepLinkParams / clearDeepLinkUrlParams', () => {
  it('strips e, t, and id while keeping other query params and hash', () => {
    assert.equal(
      hrefWithoutDeepLinkParams({
        pathname: '/',
        search: '?e=p%3AP1847&t=k7f2m9aa',
      }),
      '/',
    );
    assert.equal(
      hrefWithoutDeepLinkParams({
        pathname: '/',
        search: '?id=p:P1847&e=p%3AP1847&t=abcd1234&foo=1',
        hash: '#cine',
      }),
      '/?foo=1#cine',
    );
    assert.equal(
      hrefWithoutDeepLinkParams({
        pathname: '/artistes',
        search: '?e=p%3AP1847',
      }),
      '/artistes',
    );
    assert.equal(
      hrefWithoutDeepLinkParams({ pathname: '/', search: '?scope=soir' }),
      '/?scope=soir',
    );
    assert.equal(
      hrefWithoutDeepLinkParams({ pathname: '/', search: '' }),
      '/',
    );
  });

  it('replaceState writes the stripped path and no-ops when already clean', () => {
    const calls: string[] = [];
    const location = {
      pathname: '/',
      search: '?e=p%3AP1847&t=abcd1234&foo=bar',
      hash: '',
    };
    const history = {
      state: { keep: true },
      replaceState(_state: unknown, _title: string, url: string) {
        calls.push(url);
      },
    };
    const prev = (globalThis as { window?: unknown }).window;
    (globalThis as { window: unknown }).window = { location, history };
    try {
      clearDeepLinkUrlParams();
      assert.deepEqual(calls, ['/?foo=bar']);
      location.search = '?foo=bar';
      clearDeepLinkUrlParams();
      assert.deepEqual(calls, ['/?foo=bar']);
    } finally {
      if (prev === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = prev;
      }
    }
  });
});
