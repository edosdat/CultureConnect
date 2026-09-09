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
 *
 * Product lock: while browsing, pack rails are append-only to the right.
 * densify / requestMore / GPS reorder must not insert thumbs to the LEFT.
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

/** Touch keeps the #85 defer; mouse / keyboard pin immediately. */
export function heroScrollDeferMs(pointerType?: string): number {
  return pointerType === 'touch' ? HERO_SCROLL_DEFER_MS : 0;
}

/**
 * Ignore hero-card swipe while scroll-to-hero / layout shift is in flight.
 * Smooth scrollIntoView plus fiche growth after /api/agenda?id= can move
 * the card under a leftover finger and synthesize a dx ≥ 40 touchend.
 */
export const HERO_SWIPE_LOCK_MS = 1_500;

export const HERO_SWIPE_MIN_DX = 40;

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

/** Treat the fiche as already pinned if it is this close to the sticky offset. */
export const HERO_PIN_EPSILON_PX = 16;

/**
 * Window Y to pin the hero under the sticky search.
 * Returns `null` only when already aligned (within epsilon). A thumb tap
 * must still scroll a partially visible fiche — "any pixel on-screen" used
 * to no-op on desktop. Mid-tap strip jump is avoided by
 * `HERO_SCROLL_DEFER_MS`, not by skipping a visible hero.
 */
export function heroWindowScrollY(opts: {
  heroTop: number;
  heroBottom: number;
  scrollY: number;
  viewportHeight: number;
  stickyOffset?: number;
}): number | null {
  const sticky = opts.stickyOffset ?? HOME_STICKY_OFFSET_PX;
  const { heroTop, scrollY } = opts;
  const target = Math.max(0, scrollY + heroTop - sticky);
  if (Math.abs(target - scrollY) <= HERO_PIN_EPSILON_PX) return null;
  return target;
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
 * Once any row has painted, heroKey must be that work — never left null
 * so a later cineRows / top3 / GPS rewrite cannot follow the new rows[0].
 */
export function ensureHeroKey(
  rows: readonly CarouselHeroRow[],
  selectedKey: string | null | undefined,
  pin?: HeroPin | null,
): string | null {
  if (selectedKey) return selectedKey;
  if (pin?.key) return pin.key;
  return rows[0]?.groupKey ?? null;
}

/**
 * Index of the pinned film in the current `rows`, or `-1` when a key/pin is
 * set but that work is no longer in the strip. `null` key and no pin → `0`.
 * Callers must `ensureHeroKey` after first paint so this 0-fallback is
 * only the first empty→non-empty frame.
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

function scopeGenreKey(genres?: readonly string[]): string {
  return [...(genres ?? [])]
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
}

function scopeTitleKey(titleQuery?: string | null): string {
  return (titleQuery || '').trim().toLocaleLowerCase('fr');
}

/**
 * Browse/pin scope must include genre chips and title leftover so Jazz /
 * « Balkan » reset the painted rail (chip-only keys must not leak).
 * Empty title keeps today's chip-only scope (append-only / scrollLeft locks).
 */
export function packCarouselBrowseScope(input: {
  pack: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  selectedLieuId?: string | null;
  soir?: boolean;
  genres?: readonly string[];
  titleQuery?: string | null;
}): string {
  const parts = [
    input.pack,
    input.dateFrom ?? '',
    input.dateTo ?? '',
    input.selectedLieuId ?? '',
    input.soir ? '1' : '0',
    scopeGenreKey(input.genres),
  ];
  const title = scopeTitleKey(input.titleQuery);
  if (title) parts.push(title);
  return parts.join('|');
}

export function packCarouselPinScope(input: {
  pack: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  selectedCommune?: string | null;
  selectedLieuId?: string | null;
  soir?: boolean;
  genres?: readonly string[];
  titleQuery?: string | null;
}): string {
  const parts = [
    input.pack,
    input.dateFrom ?? '',
    input.dateTo ?? '',
    input.selectedCommune ?? '',
    input.selectedLieuId ?? '',
    input.soir ? '1' : '0',
    scopeGenreKey(input.genres),
  ];
  const title = scopeTitleKey(input.titleQuery);
  if (title) parts.push(title);
  return parts.join('|');
}

/**
 * Product lock: pack rails never insert to the LEFT while browsing.
 * `pruneMissing` drops painted works that left `incoming`
 * (genre chips / title leftover).
 */
export function appendOnlyStripRows<T extends { groupKey: string }>(
  previous: readonly T[],
  incoming: readonly T[],
  pin?: HeroPin | string | null,
  opts?: { pruneMissing?: boolean },
): T[] {
  if (previous.length === 0) return [...incoming];
  const pinObj: HeroPin | null =
    typeof pin === 'string'
      ? { key: pin, groupKey: pin, itemKey: pin, seanceKeys: [pin] }
      : pin ?? null;

  const incomingByKey = new Map<string, T>();
  for (const row of incoming) incomingByKey.set(row.groupKey, row);

  const kept: T[] = [];
  const keptKeys = new Set<string>();

  const asHero = (row: T): CarouselHeroRow => {
    const rec = row as T & {
      itemKey?: string;
      item?: { key?: string };
      seanceKeys?: string[];
      seances?: Array<{ key: string }>;
    };
    return {
      groupKey: row.groupKey,
      itemKey: rec.itemKey || rec.item?.key || row.groupKey,
      seanceKeys: rec.seanceKeys ?? rec.seances?.map((s) => s.key),
    };
  };

  for (const old of previous) {
    const fresh = incomingByKey.get(old.groupKey);
    if (fresh) {
      kept.push(fresh);
      keptKeys.add(fresh.groupKey);
      continue;
    }
    const remint =
      pinObj &&
      incoming.find(
        (row) =>
          !keptKeys.has(row.groupKey) && rowMatchesHeroPin(asHero(row), pinObj),
      );
    if (remint) {
      kept.push(remint);
      keptKeys.add(remint.groupKey);
    } else if (!opts?.pruneMissing) {
      // Keep the painted slot even when reco/top3/GPS dropped the work
      // from `incoming`. Index 0 must not thrash A → B → C on first load.
      // Genre chips prune instead — Jazz must not keep jam/karaoke thumbs.
      kept.push(old);
      keptKeys.add(old.groupKey);
    }
  }

  for (const row of incoming) {
    if (keptKeys.has(row.groupKey)) continue;
    kept.push(row);
    keptKeys.add(row.groupKey);
  }
  return kept;
}

/** How many slots the selected thumb moved (positive = inserted on its left). */
export function keysInsertedBefore(
  prevKeys: readonly string[],
  nextKeys: readonly string[],
  selectedKey: string,
): number {
  const prevIdx = prevKeys.indexOf(selectedKey);
  const nextIdx = nextKeys.indexOf(selectedKey);
  if (prevIdx < 0 || nextIdx < 0) return 0;
  return nextIdx - prevIdx;
}

/**
 * Keep the selected thumb in the same viewport slot after the rail rewrites.
 * `slot = prevThumbOffset - prevScrollLeft`, then restore that slot.
 */
export function stripScrollLeftToHoldThumb(opts: {
  prevScrollLeft: number;
  prevThumbOffset: number;
  nextThumbOffset: number;
}): number {
  const slot = opts.prevThumbOffset - opts.prevScrollLeft;
  return Math.max(0, opts.nextThumbOffset - slot);
}

/** Survives remount so a hydrate cannot reshuffle an in-progress browse. */
const packStripKeys = new Map<string, string[]>();

export function readPackStripKeys(scope: string): string[] | null {
  const keys = packStripKeys.get(scope);
  return keys?.length ? [...keys] : null;
}

export function writePackStripKeys(scope: string, keys: readonly string[]): void {
  if (!keys.length) packStripKeys.delete(scope);
  else packStripKeys.set(scope, [...keys]);
}

/** Test helper — do not use from UI. */
export function clearPackStripKeys(): void {
  packStripKeys.clear();
}

/**
 * Re-apply a stored browse order, then append-only against `incoming`.
 */
export function applyStoredStripOrder<T extends { groupKey: string }>(
  incoming: readonly T[],
  storedKeys: readonly string[] | null | undefined,
  pin?: HeroPin | string | null,
): T[] {
  if (!storedKeys?.length) return [...incoming];
  const incomingByKey = new Map(incoming.map((row) => [row.groupKey, row]));
  const previous = storedKeys
    .map((key) => incomingByKey.get(key))
    .filter((row): row is T => Boolean(row));
  return appendOnlyStripRows(previous, incoming, pin);
}

/**
 * Keep a thumb that fell outside the first-paint slice (mobile cap = 3)
 * so remount / cineLimit shrink cannot hide the pinned work.
 */
export function mergePinnedHeroRow<T extends CarouselHeroRow>(
  visible: readonly T[],
  all: readonly T[],
  pin: HeroPin | string | null | undefined,
): T[] {
  const resolved: HeroPin | null =
    typeof pin === 'string'
      ? { key: pin, groupKey: pin, itemKey: pin, seanceKeys: [pin] }
      : pin ?? null;
  if (!resolved) return [...visible];
  if (visible.some((row) => rowMatchesHeroPin(row, resolved))) {
    return [...visible];
  }
  const extra = all.find((row) => rowMatchesHeroPin(row, resolved));
  return extra ? [...visible, extra] : [...visible];
}

/**
 * True when the hero touchend is not a deliberate horizontal swipe.
 * Missing touchmove = scrollIntoView / layout shift moved the card.
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
}): boolean {
  if (opts.startX == null) return true;
  if (opts.now < opts.lockUntil) return true;
  if (!opts.didMove) return true;
  const dx = opts.endX - opts.startX;
  const dy = opts.endY - (opts.startY ?? opts.endY);
  const min = opts.minDx ?? HERO_SWIPE_MIN_DX;
  if (Math.abs(dx) < min) return true;
  if (Math.abs(dx) <= Math.abs(dy)) return true;
  return false;
}
