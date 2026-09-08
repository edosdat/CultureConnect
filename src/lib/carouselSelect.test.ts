import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_STICKY_OFFSET_PX,
  THUMB_SELECT_LOCK_MS,
  heroWindowScrollY,
  shouldIgnoreRepeatThumbSelect,
} from './carouselSelect';

describe('shouldIgnoreRepeatThumbSelect', () => {
  it('allows the first tap', () => {
    assert.equal(shouldIgnoreRepeatThumbSelect(null, 1_000), false);
  });

  it('blocks a second activation in the same gesture', () => {
    assert.equal(
      shouldIgnoreRepeatThumbSelect(1_000, 1_000 + THUMB_SELECT_LOCK_MS - 1),
      true,
    );
  });

  it('allows a later tap on another film', () => {
    assert.equal(
      shouldIgnoreRepeatThumbSelect(1_000, 1_000 + THUMB_SELECT_LOCK_MS),
      false,
    );
  });
});

describe('heroWindowScrollY', () => {
  it('does not snap when the fiche is already on-screen', () => {
    assert.equal(
      heroWindowScrollY({
        heroTop: HOME_STICKY_OFFSET_PX + 12,
        heroBottom: 420,
        scrollY: 80,
        viewportHeight: 740,
      }),
      null,
    );
  });

  it('scrolls when the fiche sat above the viewport (thumbs filled the screen)', () => {
    assert.equal(
      heroWindowScrollY({
        heroTop: -380,
        heroBottom: -20,
        scrollY: 900,
        viewportHeight: 740,
      }),
      900 - 380 - HOME_STICKY_OFFSET_PX,
    );
  });

  it('scrolls when the fiche is entirely below the fold', () => {
    assert.equal(
      heroWindowScrollY({
        heroTop: 800,
        heroBottom: 1_200,
        scrollY: 0,
        viewportHeight: 740,
      }),
      800 - HOME_STICKY_OFFSET_PX,
    );
  });

  it('does not treat a sliver under the sticky bar as on-screen', () => {
    assert.equal(
      heroWindowScrollY({
        heroTop: -400,
        heroBottom: HOME_STICKY_OFFSET_PX + 8,
        scrollY: 500,
        viewportHeight: 740,
      }),
      500 - 400 - HOME_STICKY_OFFSET_PX,
    );
  });
});
