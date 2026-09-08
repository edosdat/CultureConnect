import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CDN_REVALIDATE_CACHE_CONTROL,
  PRIVATE_NO_STORE_CACHE_CONTROL,
  PUBLIC_REVALIDATE_CACHE_CONTROL,
  agendaEtag,
  ifNoneMatchHits,
  privateNoStoreHeaders,
  publicRevalidateHeaders,
} from './httpCache';

describe('agenda cache headers', () => {
  it('lets the CDN cache 5 min but forces the browser to revalidate', () => {
    assert.match(PUBLIC_REVALIDATE_CACHE_CONTROL, /max-age=0/);
    assert.match(PUBLIC_REVALIDATE_CACHE_CONTROL, /must-revalidate/);
    assert.match(PUBLIC_REVALIDATE_CACHE_CONTROL, /s-maxage=300/);
    assert.match(PUBLIC_REVALIDATE_CACHE_CONTROL, /stale-while-revalidate=300/);
    assert.equal(CDN_REVALIDATE_CACHE_CONTROL.includes('s-maxage=300'), true);
    assert.equal(PRIVATE_NO_STORE_CACHE_CONTROL, 'private, no-store');
  });

  it('builds a catalogue-version ETag and honors If-None-Match', () => {
    const etag = agendaEtag('abc123def456', '?window=home');
    assert.equal(etag, '"abc123def456:?window=home"');
    assert.equal(ifNoneMatchHits(etag, etag), true);
    assert.equal(ifNoneMatchHits(`W/${etag}`, etag), true);
    assert.equal(ifNoneMatchHits(`"other", ${etag}`, etag), true);
    assert.equal(ifNoneMatchHits('"other"', etag), false);
    assert.equal(ifNoneMatchHits(null, etag), false);
  });

  it('sends CDN + Vercel CDN copies on public GET', () => {
    const headers = publicRevalidateHeaders('"v:home"') as Record<string, string>;
    assert.equal(headers['Cache-Control'], PUBLIC_REVALIDATE_CACHE_CONTROL);
    assert.equal(headers['CDN-Cache-Control'], CDN_REVALIDATE_CACHE_CONTROL);
    assert.equal(headers['Vercel-CDN-Cache-Control'], CDN_REVALIDATE_CACHE_CONTROL);
    assert.equal(headers.ETag, '"v:home"');
    const priv = privateNoStoreHeaders() as Record<string, string>;
    assert.equal(priv['Cache-Control'], PRIVATE_NO_STORE_CACHE_CONTROL);
  });
});
