/** Wider than tall = still. Posters default to 2:3 until we know. */
export function isLandscapeStill(width: number, height: number): boolean {
  return width > 0 && height > 0 && width > height;
}
