/**
 * Thumb-strip selection in CinemaCarousel (cine / théâtre / musique / …).
 * On a phone, overflow-x focus-scroll + mid-gesture hero scroll retarget
 * the tap onto a neighbor. Desktop-narrow mouse clicks do not reproduce it.
 * Hero identity is a stable group/item key — numeric index follows rows
 * when requestMore / densify / GPS / agenda refresh reorders the strip.
 *
 * Selection is also stored outside the carousel's useState so a remount
 * (parent data refresh, Suspense, conditional pack unmount) cannot snap
 * back to rows[0].
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

/**
 * Ignore hero-card swipe while scroll-to-hero / layout shift is in flight.
 * Smooth scrollIntoView plus fiche growth after /api/agenda?id= can move
 * the card under a leftover finger and synthesize a dx ≥ 40 touchend.
 */
export const HERO_SWIPE_LOCK_MS = 1_500;

/** Real-device page scroll often drifts ~40px sideways — require a clear flick. */
export const HERO_SWIPE_MIN_DX = 72;

/** |dx| must beat |dy| by this factor (page scroll is mostly vertical). */
export const HERO_SWIPE_AXIS_RATIO = 2;

/** Same threshold as densify `STEM_PREFIX_MIN` — truncated catalogue titles. */
const STEM_PREFIX_MIN = 20;

export type CarouselHeroRow = {
  groupKey: string;
  itemKey: string;
  seanceKeys?: string[];
};

export type HeroPin = {
  key: string;
  groupKey: string;
  itemKey: string;
  seanceKeys: string[];
};

/** Survives CinemaCarousel remount in the same JS realm (not a full reload). */
const packHeroPins = new Map<string, HeroPin>();

export function readPackHeroPin(pack: string): HeroPin | null {
  return packHeroPins.get(pack) ?? null;
}

export function writePackHeroPin(pack: string, pin: HeroPin | null): void {
  if (!pin) packHeroPins.delete(pack);
  else packHeroPins.set(pack, pin);
}

/** Test helper — do not use from UI. */
export function clearPackHeroPins(): void {
  packHeroPins.clear();
}

export function pinFromHeroRow(
  row: CarouselHeroRow,
  key = row.groupKey,
): HeroPin {
  return {
    key,
    groupKey: row.groupKey,
    itemKey: row.itemKey,
    seanceKeys: row.seanceKeys?.length ? [...row.seanceKeys] : [row.itemKey],
  };
}

/**
 * First paint: lock onto the film already on screen (`rows[0]` / deeplink).
 * Later densify / displayShuffle / reco-top3 / list hydrate must not
 * follow the new `rows[0]` — only an explicit tap/swipe replaces this.
 */
export function adoptFirstPaintHero(
  rows: readonly CarouselHeroRow[],
  selectedKey: string | null | undefined,
  pin?: HeroPin | null,
): { key: string | null; pin: HeroPin | null } {
  if (pin) {
    const idx = resolveHeroIndex(rows, selectedKey ?? pin.key, pin);
    if (idx >= 0) {
      const row = rows[idx]!;
      return { key: row.groupKey, pin: pinFromHeroRow(row, row.groupKey) };
    }
    return { key: selectedKey ?? pin.key, pin };
  }
  if (selectedKey) {
    const idx = resolveHeroIndex(rows, selectedKey);
    const row = idx >= 0 ? rows[idx]! : rows[0];
    return {
      key: selectedKey,
      pin: row ? pinFromHeroRow(row, selectedKey) : null,
    };
  }
  const first = rows[0];
  if (!first) return { key: null, pin: null };
  return { key: first.groupKey, pin: pinFromHeroRow(first) };
}

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
 * Window Y to pin the pack hero under the sticky search.
 * Always a number — thumb select must scroll even when the fiche is
 * already partially visible (desktop). Phone still defers the call so
 * mid-gesture strip retarget does not apply.
 */
export function heroWindowScrollY(opts: {
  heroTop: number;
  heroBottom?: number;
  scrollY: number;
  viewportHeight?: number;
  stickyOffset?: number;
}): number {
  const sticky = opts.stickyOffset ?? HOME_STICKY_OFFSET_PX;
  return Math.max(0, opts.scrollY + opts.heroTop - sticky);
}

/** Desktop mouse: scroll immediately. Coarse pointer: wait out the tap. */
export function heroScrollDeferMs(coarsePointer: boolean): number {
  return coarsePointer ? HERO_SCROLL_DEFER_MS : 0;
}

export function rowMatchesHeroKey(
  row: CarouselHeroRow,
  key: string | null | undefined,
): boolean {
  if (!key) return false;
  if (row.groupKey === key || row.itemKey === key) return true;
  return Boolean(row.seanceKeys?.includes(key));
}

function groupStem(groupKey: string): string {
  if (groupKey.startsWith('film:w:')) return groupKey.slice('film:w:'.length);
  if (groupKey.startsWith('t:')) return groupKey.slice(2);
  return '';
}

function stemsCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < STEM_PREFIX_MIN) return false;
  return long.startsWith(short);
}

/**
 * Same work after densify remints `groupKey` (stub « C… » → full title)
 * or merges seances into a sibling group's key.
 */
export function rowMatchesHeroPin(
  row: CarouselHeroRow,
  pin: HeroPin | null | undefined,
): boolean {
  if (!pin) return false;
  if (rowMatchesHeroKey(row, pin.key)) return true;
  if (rowMatchesHeroKey(row, pin.groupKey)) return true;
  if (row.itemKey === pin.itemKey) return true;
  if (pin.seanceKeys.includes(row.itemKey)) return true;
  if (row.seanceKeys?.some((k) => k === pin.itemKey || pin.seanceKeys.includes(k))) {
    return true;
  }
  return stemsCompatible(groupStem(row.groupKey), groupStem(pin.groupKey));
}

/**
 * Index of the pinned film in the current `rows`, or `-1` when a key/pin is
 * set but that work is no longer in the strip. `null` key and no pin → `0`.
 */
export function resolveHeroIndex(
  rows: readonly CarouselHeroRow[],
  selectedKey: string | null | undefined,
  pin?: HeroPin | null,
): number {
  if (rows.length === 0) return -1;
  if (pin) {
    const fromPin = rows.findIndex((row) => rowMatchesHeroPin(row, pin));
    if (fromPin >= 0) return fromPin;
    if (!selectedKey) return -1;
  }
  if (!selectedKey) return 0;
  return rows.findIndex((row) => rowMatchesHeroKey(row, selectedKey));
}

/**
 * After an async strip change: keep an explicit thumb pin on the same work.
 * `pendingAdvance` (swipe / next at the last fiche) steps to the next row
 * only when the user did not just pick a thumb.
 *
 * A module-level `pin` counts as pinned even after remount reset
 * `pinnedBySelect` to false.
 */
export function resolveHeroAfterRowsChange(opts: {
  rows: readonly CarouselHeroRow[];
  selectedKey: string | null;
  pendingAdvance: boolean;
  pinnedBySelect: boolean;
  hasMore: boolean;
  /** Load-more grew the strip. Reorder alone must not consume pendingAdvance. */
  rowsGrew?: boolean;
  pin?: HeroPin | null;
}): { index: number; key: string | null; pendingAdvance: boolean } {
  const { rows, hasMore } = opts;
  const pin = opts.pin ?? null;
  const pinned = opts.pinnedBySelect || Boolean(pin);
  const rowsGrew = opts.rowsGrew ?? true;
  let pending = opts.pendingAdvance;
  let key = opts.selectedKey;

  if (pinned) {
    pending = false;
    const idx = resolveHeroIndex(rows, key, pin);
    if (idx >= 0) key = rows[idx]!.groupKey;
    return { index: idx, key, pendingAdvance: false };
  }

  if (pending) {
    const current = resolveHeroIndex(rows, key, pin);
    const idx = current >= 0 ? current : 0;
    if (rowsGrew && idx < rows.length - 1) {
      key = rows[idx + 1]!.groupKey;
      pending = false;
    } else if (!hasMore) {
      pending = false;
    }
  }

  return {
    index: resolveHeroIndex(rows, key, pin),
    key,
    pendingAdvance: pending,
  };
}

/**
 * Keep a thumb that fell outside the first-paint slice (mobile cap = 3)
 * so remount / cineLimit shrink cannot hide the pinned work.
 */
export function mergePinnedHeroRow<T extends { groupKey: string }>(
  visible: readonly T[],
  all: readonly T[],
  pin: HeroPin | string | null | undefined,
): T[] {
  if (!pin) return [...visible];
  const key = typeof pin === 'string' ? pin : pin.key;
  const matches = (row: T) => {
    if (row.groupKey === key) return true;
    if (typeof pin === 'string') return false;
    return rowMatchesHeroPin(
      {
        groupKey: row.groupKey,
        itemKey:
          'itemKey' in row && typeof row.itemKey === 'string' ? row.itemKey : '',
        seanceKeys:
          'seanceKeys' in row && Array.isArray(row.seanceKeys)
            ? (row.seanceKeys as string[])
            : undefined,
      },
      pin,
    );
  };
  if (visible.some(matches)) return [...visible];
  const extra = all.find(matches);
  return extra ? [...visible, extra] : [...visible];
}

/**
 * True when the hero touchend is not a deliberate horizontal swipe.
 * Missing touchmove = scrollIntoView / layout shift moved the card.
 * A changing window scrollY / visualViewport means the page moved, not the finger.
 */
export function shouldIgnoreHeroSwipe(opts: {
  startX: number | null;
  startY: number | null;
  endX: number;
  endY: number;
  didMove: boolean;
  lockUntil: number;
  now: number;
  minDx?: number;
  axisRatio?: number;
  startScrollY?: number | null;
  endScrollY?: number | null;
  startVisualTop?: number | null;
  endVisualTop?: number | null;
}): boolean {
  if (opts.startX == null) return true;
  if (opts.now < opts.lockUntil) return true;
  if (!opts.didMove) return true;
  const startScroll = opts.startScrollY ?? 0;
  const endScroll = opts.endScrollY ?? startScroll;
  if (Math.abs(endScroll - startScroll) > 8) return true;
  const startVV = opts.startVisualTop ?? 0;
  const endVV = opts.endVisualTop ?? startVV;
  if (Math.abs(endVV - startVV) > 8) return true;
  const dx = opts.endX - opts.startX;
  const dy = opts.endY - (opts.startY ?? opts.endY);
  const min = opts.minDx ?? HERO_SWIPE_MIN_DX;
  const ratio = opts.axisRatio ?? HERO_SWIPE_AXIS_RATIO;
  if (Math.abs(dx) < min) return true;
  if (Math.abs(dx) < Math.abs(dy) * ratio) return true;
  return false;
}
