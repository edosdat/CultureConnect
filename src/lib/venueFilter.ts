/**
 * Salle filter (Plan C): a chip after a QUOI category opens a dropdown
 * of every venue that has an upcoming event in that category.
 * Not a horizontal rail of salle chips. Not behind the mobile Filtres gate.
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
