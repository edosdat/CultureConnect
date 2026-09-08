/**
 * Thumb-strip selection in CinemaCarousel (cine / théâtre / musique / …).
 * On a phone, overflow-x focus-scroll + mid-gesture hero scroll retarget
 * the tap onto a neighbor. Desktop-narrow mouse clicks do not reproduce it.
 * Hero identity is a stable group/item key — numeric index follows rows
 * when requestMore / densify / GPS / agenda refresh reorders the strip.
 */

/** Sticky search clearance — matches `scroll-mt-16` / HomeSection. */
export const HOME_STICKY_OFFSET_PX = 64;

/** Ignore a second activation from the same gesture (ghost / retargeted click). */
export const THUMB_SELECT_LOCK_MS = 500;

/**
 * Run scroll-to-hero and requestMore after the touch+click sequence.
 * setTimeout(0) still fires while the finger is down.
 */
export const HERO_SCROLL_DEFER_MS = 500;

export type CarouselHeroRow = {
  groupKey: string;
  itemKey: string;
  seanceKeys?: string[];
};

export function shouldIgnoreRepeatThumbSelect(
  lastAt: number | null,
  now: number,
  lockMs = THUMB_SELECT_LOCK_MS,
): boolean {
  return lastAt != null && now - lastAt < lockMs;
}

/**
 * The film under the finger at touchstart — not the click target after
 * the overflow strip jumped. Works for numeric index or groupKey.
 */
export function resolveThumbSelectIndex<T>(
  armed: T | null,
  eventValue: T,
): T {
  return armed ?? eventValue;
}

export function holdThumbFocus(el: {
  focus: (opts?: { preventScroll?: boolean }) => void;
}): void {
  el.focus({ preventScroll: true });
}

/**
 * Window Y to pin the hero under the sticky search, or `null` if the fiche
 * is already on-screen. Snapping a visible hero to `block: start` mid-tap
 * moves the strip under the finger.
 */
export function heroWindowScrollY(opts: {
  heroTop: number;
  heroBottom: number;
  scrollY: number;
  viewportHeight: number;
  stickyOffset?: number;
}): number | null {
  const sticky = opts.stickyOffset ?? HOME_STICKY_OFFSET_PX;
  const { heroTop, heroBottom, scrollY, viewportHeight } = opts;
  const sliver = sticky + 24;
  if (heroBottom > sliver && heroTop < viewportHeight) return null;
  return Math.max(0, scrollY + heroTop - sticky);
}

export function rowMatchesHeroKey(
  row: CarouselHeroRow,
  key: string | null | undefined,
): boolean {
  if (!key) return false;
  if (row.groupKey === key || row.itemKey === key) return true;
  return Boolean(row.seanceKeys?.includes(key));
}

/**
 * Index of the pinned film in the current `rows`, or `-1` when a key is set
 * but that work is no longer in the strip. `null` key → first row (`0`).
 */
export function resolveHeroIndex(
  rows: readonly CarouselHeroRow[],
  selectedKey: string | null | undefined,
): number {
  if (rows.length === 0) return -1;
  if (!selectedKey) return 0;
  return rows.findIndex((row) => rowMatchesHeroKey(row, selectedKey));
}

/**
 * After an async strip change: keep an explicit thumb pin on the same work.
 * `pendingAdvance` (swipe / next at the last fiche) steps to the next row
 * only when the user did not just pick a thumb.
 */
export function resolveHeroAfterRowsChange(opts: {
  rows: readonly CarouselHeroRow[];
  selectedKey: string | null;
  pendingAdvance: boolean;
  pinnedBySelect: boolean;
  hasMore: boolean;
  /** Load-more grew the strip. Reorder alone must not consume pendingAdvance. */
  rowsGrew?: boolean;
}): { index: number; key: string | null; pendingAdvance: boolean } {
  const { rows, pinnedBySelect, hasMore } = opts;
  const rowsGrew = opts.rowsGrew ?? true;
  let pending = opts.pendingAdvance;
  let key = opts.selectedKey;

  if (pinnedBySelect) {
    pending = false;
  } else if (pending) {
    const current = resolveHeroIndex(rows, key);
    const idx = current >= 0 ? current : 0;
    if (rowsGrew && idx < rows.length - 1) {
      key = rows[idx + 1]!.groupKey;
      pending = false;
    } else if (!hasMore) {
      pending = false;
    }
  }

  return {
    index: resolveHeroIndex(rows, key),
    key,
    pendingAdvance: pending,
  };
}
