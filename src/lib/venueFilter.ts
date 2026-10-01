/**
 * Conditional Salles filter (Plan C): hide until a QUOI category is on;
 * options come from agenda venues for that category (upcoming events),
 * not from inventing lieu.type mappings.
 */

export type VenueOptionId = { lieu_id: string };

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

/** Salles chip is shown only when at least one QUOI category is selected. */
export function venueFilterVisible(selectedMains: string[]): boolean {
  return selectedMains.length > 0;
}
