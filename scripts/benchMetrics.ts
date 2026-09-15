/**
 * Bench-only metrics. Not used by Matching A scoring.
 *
 * Top 3 is 1+1+1 (cine + theatre + concert). vivantShare on that list is
 * almost always 2/3 — it measures the format. slotsFilled counts how many
 * of those three slots are actually present. Keep vivantShare for free lists.
 */
export type SlotLike = 'cine' | 'theatre' | 'concert';

const TOP3_SLOTS = new Set<SlotLike>(['cine', 'theatre', 'concert']);

function asTop3Slot(value: unknown): SlotLike | null {
  return value === 'cine' || value === 'theatre' || value === 'concert'
    ? value
    : null;
}

/** Distinct cine / theatre / concert slots actually present (0–3). */
export function slotsFilledOf(
  items: ReadonlyArray<{ slot?: string | null }>,
): number {
  const seen = new Set<SlotLike>();
  for (const row of items) {
    const slot = asTop3Slot(row.slot);
    if (slot) seen.add(slot);
  }
  return seen.size;
}
