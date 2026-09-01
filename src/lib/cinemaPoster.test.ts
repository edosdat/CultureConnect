import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLandscapeStill } from './cinemaPoster';

describe('isLandscapeStill', () => {
  it('treats 2:3 posters as portrait', () => {
    assert.equal(isLandscapeStill(400, 600), false);
  });

  it('treats wider-than-tall stills as landscape', () => {
    assert.equal(isLandscapeStill(1920, 1080), true);
  });

  it('does not treat square or empty as landscape', () => {
    assert.equal(isLandscapeStill(800, 800), false);
    assert.equal(isLandscapeStill(0, 100), false);
    assert.equal(isLandscapeStill(100, 0), false);
  });
});
