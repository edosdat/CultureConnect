import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_SCROLL_DEFER_MS,
  HOME_STICKY_OFFSET_PX,
  THUMB_SELECT_LOCK_MS,
  holdThumbFocus,
  heroWindowScrollY,
  resolveHeroAfterRowsChange,
  resolveHeroIndex,
  resolveThumbSelectIndex,
  shouldIgnoreRepeatThumbSelect,
  type CarouselHeroRow,
} from './carouselSelect';

function film(groupKey: string, itemKey = groupKey): CarouselHeroRow {
  return { groupKey, itemKey, seanceKeys: [itemKey] };
}

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

  it('covers a delayed iOS click (~300ms) plus slack', () => {
    assert.ok(THUMB_SELECT_LOCK_MS >= 500);
    assert.equal(HERO_SCROLL_DEFER_MS, THUMB_SELECT_LOCK_MS);
  });
});

describe('resolveThumbSelectIndex', () => {
  it('keeps the touchstart film when the click lands on a neighbor', () => {
    assert.equal(resolveThumbSelectIndex(4, 5), 4);
  });

  it('uses the event index when nothing was armed (keyboard / mouse)', () => {
    assert.equal(resolveThumbSelectIndex(null, 2), 2);
  });

  it('keeps the touchstart groupKey when the click lands on a neighbor', () => {
    assert.equal(
      resolveThumbSelectIndex('film:w:kyoto', 'film:w:triangle'),
      'film:w:kyoto',
    );
  });
});

describe('holdThumbFocus', () => {
  it('focuses with preventScroll so the overflow strip does not jump', () => {
    const calls: unknown[] = [];
    holdThumbFocus({
      focus: (opts) => {
        calls.push(opts);
      },
    });
    assert.deepEqual(calls, [{ preventScroll: true }]);
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

describe('resolveHeroIndex', () => {
  const kyoto = film('film:w:sous le ciel de kyoto', 'kyoto-1');
  const triangle = film('film:w:triangle d or', 'triangle-1');
  const cairo = film('film:w:le caire', 'caire-1');

  it('follows the same work after densify / GPS reorder', () => {
    const before = [kyoto, triangle, cairo];
    const after = [cairo, kyoto, triangle];
    const key = before[0]!.groupKey;
    assert.equal(resolveHeroIndex(before, key), 0);
    assert.equal(resolveHeroIndex(after, key), 1);
  });

  it('keeps the pin when requestMore appends rows', () => {
    const first = [kyoto, triangle];
    const grown = [kyoto, triangle, cairo, film('film:w:extra')];
    assert.equal(resolveHeroIndex(first, triangle.groupKey), 1);
    assert.equal(resolveHeroIndex(grown, triangle.groupKey), 1);
  });

  it('matches a seance / item key from a press deeplink', () => {
    const row = {
      groupKey: 'film:w:sous le ciel de kyoto',
      itemKey: 'kyoto-rep',
      seanceKeys: ['kyoto-1', 'kyoto-2'],
    };
    assert.equal(resolveHeroIndex([row, triangle], 'kyoto-2'), 0);
  });

  it('returns -1 when the pinned work dropped out of the strip', () => {
    assert.equal(resolveHeroIndex([triangle], kyoto.groupKey), -1);
  });
});

describe('resolveHeroAfterRowsChange', () => {
  const kyoto = film('film:w:sous le ciel de kyoto', 'kyoto-1');
  const triangle = film('film:w:triangle d or', 'triangle-1');
  const extra = film('film:w:extra', 'extra-1');

  it('does not auto-advance after an explicit thumb select', () => {
    const next = resolveHeroAfterRowsChange({
      rows: [triangle, kyoto, extra],
      selectedKey: kyoto.groupKey,
      pendingAdvance: true,
      pinnedBySelect: true,
      hasMore: true,
    });
    assert.equal(next.key, kyoto.groupKey);
    assert.equal(next.index, 1);
    assert.equal(next.pendingAdvance, false);
  });

  it('advances to the next work only for swipe-at-end after load-more', () => {
    const next = resolveHeroAfterRowsChange({
      rows: [kyoto, extra],
      selectedKey: kyoto.groupKey,
      pendingAdvance: true,
      pinnedBySelect: false,
      hasMore: true,
    });
    assert.equal(next.key, extra.groupKey);
    assert.equal(next.index, 1);
    assert.equal(next.pendingAdvance, false);
  });

  it('stays on the tapped film when the strip reorders (Sous le ciel → not Triangle)', () => {
    const next = resolveHeroAfterRowsChange({
      rows: [triangle, kyoto],
      selectedKey: kyoto.groupKey,
      pendingAdvance: false,
      pinnedBySelect: true,
      hasMore: false,
    });
    assert.equal(next.key, kyoto.groupKey);
    assert.equal(next.index, 1);
  });

  it('does not consume pendingAdvance on reorder without growth', () => {
    const next = resolveHeroAfterRowsChange({
      rows: [extra, kyoto],
      selectedKey: kyoto.groupKey,
      pendingAdvance: true,
      pinnedBySelect: false,
      hasMore: true,
      rowsGrew: false,
    });
    assert.equal(next.key, kyoto.groupKey);
    assert.equal(next.pendingAdvance, true);
  });
});
