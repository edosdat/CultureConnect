/**
 * Salle filter (Plan C): a chip after QUOI in the column band (#221)
 * opens a dropdown of every venue with an upcoming event in that category.
 * Shown only once a category is on (#205). Not a rail of salle chips.
 * The home band keeps the chip inside the Filtres disclosure (one row
 * with GENRES) so a category does not add two facet rows at once.
 * Menu flip (space below) unchanged.
 *
 * Ciné / Théâtre stay visible while the list loads. Musique and the other
 * cats appear only when that category actually has salles.
 * The menu is scoped to the active commune (Toulouse stays Toulouse).
 * It does not shrink with Quand, genre chips, or the salle already picked.
 */

export const SALLE_CHIP_LABEL = 'Salle';
export const SALLE_ALL_LABEL = 'Toutes les salles';

/** Categories that always get the chip as soon as they are on. */
const SALLE_CHIP_WHILE_LOADING = new Set(['cinema', 'theatre_danse']);

export type VenueOptionId = { lieu_id: string };

/**
 * Chip visibility. `filtersOpen` is intentionally absent: mobile Filtres
 * must not hide Salle once a QUOI category is selected.
 */
export function venueChipShown(opts: {
  selectedMains: readonly string[];
  venueCount: number;
  loading?: boolean;
}): boolean {
  if (opts.selectedMains.length === 0) return false;
  if (opts.venueCount > 0) return true;
  if (!opts.loading) return false;
  return opts.selectedMains.some((id) => SALLE_CHIP_WHILE_LOADING.has(id));
}

/**
 * Keep the selected salle only while a QUOI category is active and the salle
 * is still in the category-adapted options. Empty options (in-flight fetch)
 * keep the selection so a brief [] does not wipe a sticky salle mid-paint;
 * callers that clear on category change should null the id themselves.
 */
export function retainSelectedLieuId(
  selectedLieuId: string | null,
  selectedMains: string[],
  venueOptions: VenueOptionId[],
): string | null {
  if (!selectedLieuId) return null;
  if (selectedMains.length === 0) return null;
  if (venueOptions.length === 0) return selectedLieuId;
  return venueOptions.some((v) => v.lieu_id === selectedLieuId)
    ? selectedLieuId
    : null;
}

/** Salle chip is shown only when at least one QUOI category is selected. */
export function venueFilterVisible(selectedMains: string[]): boolean {
  return selectedMains.length > 0;
}

/** Preferred menu height (16rem). Below this, the side with more room wins. */
export const VENUE_MENU_MAX_PX = 256;
const VENUE_MENU_GAP_PX = 4;
const VENUE_MENU_EDGE_PX = 8;
/**
 * Open menu stacks above the cookie banner (z-60) and the digest intro (z-70)
 * so the list stays clickable. Page chrome stays lower (sticky z-20, chat z-40).
 */
export const VENUE_MENU_Z = 80;

export type VenueMenuBox = {
  left: number;
  width: number;
  maxHeight: number;
  /** Set when the menu opens under the chip. */
  top: number | null;
  /** Set when the menu flips above the chip. Distance from the viewport bottom. */
  bottom: number | null;
};

/**
 * Fixed position for the Salle menu. Flips above the chip when the space
 * below is tighter than the preferred height and the space above is larger.
 * maxHeight is the room on the chosen side. Left/width stay inside the viewport.
 */
export function placeVenueMenu(args: {
  rect: { top: number; bottom: number; left: number };
  viewportWidth: number;
  viewportHeight: number;
}): VenueMenuBox {
  const edge = VENUE_MENU_EDGE_PX;
  const gap = VENUE_MENU_GAP_PX;
  const width = Math.min(320, Math.max(0, args.viewportWidth - edge * 2));
  let left = args.rect.left;
  if (left + width > args.viewportWidth - edge) {
    left = args.viewportWidth - width - edge;
  }
  if (left < edge) left = edge;

  const spaceBelow = args.viewportHeight - args.rect.bottom - gap;
  const spaceAbove = args.rect.top - gap;
  const flipUp = spaceBelow < VENUE_MENU_MAX_PX && spaceAbove > spaceBelow;
  const room = Math.max(0, (flipUp ? spaceAbove : spaceBelow) - edge);
  const maxHeight = Math.min(VENUE_MENU_MAX_PX, room);

  if (flipUp) {
    return {
      left,
      width,
      maxHeight,
      top: null,
      bottom: args.viewportHeight - args.rect.top + gap,
    };
  }
  return {
    left,
    width,
    maxHeight,
    top: args.rect.bottom + gap,
    bottom: null,
  };
}
