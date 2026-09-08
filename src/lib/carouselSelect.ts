/**
 * Thumb-strip selection in CinemaCarousel (cine / théâtre / musique / …).
 * Touch + overflow-x + scroll-to-hero used to retarget the tap onto a neighbor.
 */

/** Sticky search clearance — matches `scroll-mt-16` / HomeSection. */
export const HOME_STICKY_OFFSET_PX = 64;

/** Ignore a second activation from the same gesture (ghost / retargeted click). */
export const THUMB_SELECT_LOCK_MS = 400;

export function shouldIgnoreRepeatThumbSelect(
  lastAt: number | null,
  now: number,
  lockMs = THUMB_SELECT_LOCK_MS,
): boolean {
  return lastAt != null && now - lastAt < lockMs;
}

/**
 * Window Y to pin the hero under the sticky search, or `null` if the fiche
 * is already on-screen. Snapping a visible hero to `block: start` scrolls
 * the page mid-tap and the strip jump lands on a second film.
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
