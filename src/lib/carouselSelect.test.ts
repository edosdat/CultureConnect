import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_PIN_EPSILON_PX,
  HERO_SCROLL_DEFER_MS,
  HERO_SWIPE_LOCK_MS,
  HOME_STICKY_OFFSET_PX,
  THUMB_SELECT_LOCK_MS,
  adoptFirstPaintHero,
  appendOnlyStripRows,
  applyStoredStripOrder,
  clearPackHeroPins,
  clearPackStripKeys,
  holdThumbFocus,
  heroWindowScrollY,
  keysInsertedBefore,
  mergePinnedHeroRow,
  pinFromHeroRow,
  readPackHeroPin,
  readPackStripKeys,
  resolveHeroAfterRowsChange,
  resolveHeroIndex,
  resolveThumbSelectIndex,
  rowMatchesHeroPin,
  shouldIgnoreHeroSwipe,
  shouldIgnoreRepeatThumbSelect,
  stripScrollLeftToHoldThumb,
  writePackHeroPin,
  writePackStripKeys,
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
  it('does not snap when the fiche is already pinned under the sticky bar', () => {
    assert.ok(HERO_PIN_EPSILON_PX >= 12);
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

  it('pins a partially visible fiche (desktop: bottom still in view)', () => {
    assert.equal(
      heroWindowScrollY({
        heroTop: -180,
        heroBottom: 260,
        scrollY: 420,
        viewportHeight: 900,
      }),
      420 - 180 - HOME_STICKY_OFFSET_PX,
    );
  });

  it('pins a fully visible fiche that sits below the sticky bar', () => {
    assert.equal(
      heroWindowScrollY({
        heroTop: 220,
        heroBottom: 640,
        scrollY: 40,
        viewportHeight: 900,
      }),
      40 + 220 - HOME_STICKY_OFFSET_PX,
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

  it('does not treat a sliver under the sticky bar as pinned', () => {
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

  it('does not auto-advance after remount when only the module pin remains', () => {
    const pin = pinFromHeroRow(kyoto);
    const next = resolveHeroAfterRowsChange({
      rows: [triangle, kyoto, extra],
      selectedKey: kyoto.groupKey,
      pendingAdvance: true,
      pinnedBySelect: false,
      hasMore: true,
      rowsGrew: true,
      pin,
    });
    assert.equal(next.key, kyoto.groupKey);
    assert.equal(next.index, 1);
    assert.equal(next.pendingAdvance, false);
  });

  it('retargets the pin when densify remints groupKey (stub → full title)', () => {
    const stub = film('film:w:sous le ciel de', 'kyoto-1');
    const full = film('film:w:sous le ciel de kyoto', 'kyoto-1');
    const pin = pinFromHeroRow(stub);
    const next = resolveHeroAfterRowsChange({
      rows: [triangle, full],
      selectedKey: stub.groupKey,
      pendingAdvance: false,
      pinnedBySelect: true,
      hasMore: false,
      pin,
    });
    assert.equal(next.key, full.groupKey);
    assert.equal(next.index, 1);
  });
});

describe('adoptFirstPaintHero', () => {
  const film1 = film('film:w:la regle du jeu', 'regle-1');
  const film2 = film('film:w:l odyssee', 'odyssee-1');
  const film3 = film('film:w:the dog stars', 'dog-1');

  it('pins rows[0] on first paint', () => {
    const first = adoptFirstPaintHero([film1, film2, film3], null);
    assert.equal(first.key, film1.groupKey);
    assert.equal(first.pin?.groupKey, film1.groupKey);
  });

  it('does not follow a new rows[0] after densify / shuffle / reco hydrate', () => {
    const first = adoptFirstPaintHero([film1, film2, film3], null);
    const shuffled = [film3, film2, film1];
    const next = resolveHeroAfterRowsChange({
      rows: shuffled,
      selectedKey: first.key,
      pendingAdvance: false,
      pinnedBySelect: false,
      hasMore: false,
      pin: first.pin,
    });
    assert.equal(next.key, film1.groupKey);
    assert.equal(next.index, 2);
    assert.equal(resolveHeroIndex(shuffled, null), 0);
    assert.notEqual(shuffled[0]!.groupKey, film1.groupKey);
  });

  it('keeps the first-paint film when it drops out of the new strip', () => {
    const first = adoptFirstPaintHero([film1, film2], null);
    const next = resolveHeroAfterRowsChange({
      rows: [film2, film3],
      selectedKey: first.key,
      pendingAdvance: false,
      pinnedBySelect: true,
      hasMore: false,
      pin: first.pin,
    });
    assert.equal(next.key, film1.groupKey);
    assert.equal(next.index, -1);
  });
});

describe('rowMatchesHeroPin / remount restore', () => {
  beforeEach(() => clearPackHeroPins());

  it('matches a reminted groupKey via seance identity', () => {
    const pin = pinFromHeroRow(film('film:w:c', 'caire-stub'), 'film:w:c');
    const full = {
      groupKey: 'film:w:le caire confidentiel',
      itemKey: 'caire-full',
      seanceKeys: ['caire-stub', 'caire-full'],
    };
    assert.equal(rowMatchesHeroPin(full, pin), true);
    assert.equal(resolveHeroIndex([film('film:w:other'), full], pin.key, pin), 1);
  });

  it('survives a remount: store → resolveHeroIndex, not rows[0]', () => {
    const kyoto = film('film:w:sous le ciel de kyoto', 'kyoto-1');
    const triangle = film('film:w:triangle d or', 'triangle-1');
    writePackHeroPin('cine', pinFromHeroRow(kyoto));
    const restored = readPackHeroPin('cine');
    assert.ok(restored);
    assert.equal(
      resolveHeroIndex([triangle, kyoto], null, restored),
      1,
    );
  });

  it('does not snap to index 0 when the pin misses the visible slice', () => {
    const kyoto = film('film:w:sous le ciel de kyoto', 'kyoto-1');
    const triangle = film('film:w:triangle d or', 'triangle-1');
    assert.equal(
      resolveHeroIndex([triangle], kyoto.groupKey, pinFromHeroRow(kyoto)),
      -1,
    );
  });
});

describe('mergePinnedHeroRow', () => {
  it('appends the pinned work when cineLimit dropped it', () => {
    const kyoto = film('film:w:sous le ciel de kyoto', 'kyoto-1');
    const triangle = film('film:w:triangle d or', 'triangle-1');
    const cairo = film('film:w:le caire', 'caire-1');
    const merged = mergePinnedHeroRow(
      [triangle],
      [triangle, cairo, kyoto],
      pinFromHeroRow(kyoto),
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[1]?.groupKey, kyoto.groupKey);
  });
});

describe('appendOnlyStripRows', () => {
  const a = film('film:w:a', 'a-1');
  const b = film('film:w:b', 'b-1');
  const c = film('film:w:c', 'c-1');
  const x = film('film:w:x', 'x-1');
  const y = film('film:w:y', 'y-1');
  const z = film('film:w:z', 'z-1');

  it('uses incoming order on first paint', () => {
    const out = appendOnlyStripRows([], [x, y, a]);
    assert.deepEqual(
      out.map((row) => row.groupKey),
      [x, y, a].map((row) => row.groupKey),
    );
  });

  it('never inserts densify/requestMore keys to the left of shown thumbs', () => {
    const incoming = [x, y, a, b, c, z];
    const out = appendOnlyStripRows([a, b, c], incoming, b.groupKey);
    assert.deepEqual(
      out.map((row) => row.groupKey),
      [a, b, c, x, y, z].map((row) => row.groupKey),
    );
    assert.equal(
      keysInsertedBefore(
        [a, b, c].map((row) => row.groupKey),
        out.map((row) => row.groupKey),
        b.groupKey,
      ),
      0,
    );
  });

  it('keeps the pinned thumb when the new slice dropped it (mobile cap)', () => {
    const out = appendOnlyStripRows([a, b, c], [x, y, z], pinFromHeroRow(b));
    assert.equal(out[0]?.groupKey, b.groupKey);
    assert.deepEqual(
      out.map((row) => row.groupKey),
      [b, x, y, z].map((row) => row.groupKey),
    );
  });

  it('keeps a reminted pin (DenseRow item.key) instead of inserting left', () => {
    const stub = {
      groupKey: 'film:w:sous le ciel de',
      item: { key: 'kyoto-1' },
      seances: [{ key: 'kyoto-1' }],
    };
    const full = {
      groupKey: 'film:w:sous le ciel de kyoto',
      item: { key: 'kyoto-1' },
      seances: [{ key: 'kyoto-1' }, { key: 'kyoto-2' }],
    };
    const extra = {
      groupKey: 'film:w:new',
      item: { key: 'new-1' },
      seances: [{ key: 'new-1' }],
    };
    const out = appendOnlyStripRows(
      [stub],
      [extra, full],
      pinFromHeroRow({
        groupKey: stub.groupKey,
        itemKey: stub.item.key,
        seanceKeys: ['kyoto-1'],
      }),
    );
    assert.equal(out[0]?.groupKey, full.groupKey);
    assert.equal(out[1]?.groupKey, extra.groupKey);
  });

  it('appends only on remount via stored browse keys', () => {
    const stored = applyStoredStripOrder([x, a, b, y], [a.groupKey, b.groupKey]);
    assert.deepEqual(
      stored.map((row) => row.groupKey),
      [a, b, x, y].map((row) => row.groupKey),
    );
  });
});

describe('stripScrollLeftToHoldThumb', () => {
  it('shifts scrollLeft by the width inserted before the selected thumb', () => {
    assert.equal(
      stripScrollLeftToHoldThumb({
        prevScrollLeft: 80,
        prevThumbOffset: 240,
        nextThumbOffset: 480,
      }),
      320,
    );
  });

  it('does not go negative when earlier thumbs are removed', () => {
    assert.equal(
      stripScrollLeftToHoldThumb({
        prevScrollLeft: 40,
        prevThumbOffset: 40,
        nextThumbOffset: 0,
      }),
      0,
    );
  });
});

describe('pack strip key store', () => {
  beforeEach(() => clearPackStripKeys());

  it('round-trips browse keys', () => {
    writePackStripKeys('cine|d', ['film:w:a', 'film:w:b']);
    assert.deepEqual(readPackStripKeys('cine|d'), ['film:w:a', 'film:w:b']);
  });
});

describe('shouldIgnoreHeroSwipe', () => {
  const base = {
    startX: 200,
    startY: 400,
    endX: 80,
    endY: 400,
    didMove: true,
    lockUntil: 1_000,
    now: 3_000,
  };

  it('accepts a real horizontal swipe after the lock', () => {
    assert.equal(shouldIgnoreHeroSwipe(base), false);
  });

  it('ignores touchend without touchmove (scrollIntoView / layout shift)', () => {
    assert.equal(shouldIgnoreHeroSwipe({ ...base, didMove: false }), true);
  });

  it('ignores swipe during the programmatic-scroll lock', () => {
    assert.equal(shouldIgnoreHeroSwipe({ ...base, now: 999 }), true);
    assert.ok(HERO_SWIPE_LOCK_MS >= 1_500);
  });

  it('ignores a vertical-dominant gesture', () => {
    assert.equal(
      shouldIgnoreHeroSwipe({ ...base, endX: 180, endY: 280 }),
      true,
    );
  });
});
