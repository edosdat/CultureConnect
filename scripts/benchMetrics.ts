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

/**
 * Banc 2 — inherited family (season mega-mood parents).
 *
 * A parent event is a family when it is cinema (`form` cine/cinema or
 * `categorie` cinema) AND it carries ≥ 8 closed taste moods. Those rows
 * (E003 / E003b / E006 today) store the union of child-film ambiances.
 *
 * A recommended work **belongs** to a family when its `event_id` is one of
 * those parents (or is the parent card itself). This is membership, not
 * “still inheriting moods” — P0 stops inheritance; children can still be
 * recommended on their own tags / fallback.
 */
export const INHERITED_FAMILY_MIN_PARENT_MOODS = 8;

export const INHERITED_FAMILY_DEFINITION =
  'Cinema parent event with ≥ 8 closed taste moods (season mega-tags). ' +
  'A recommended work belongs to the family when its event_id matches. ' +
  'Membership ≠ mood inheritance (P0). Catalogue peers of E003/E003b/E006.';

function isCinemaParent(form?: string, categorie?: string): boolean {
  const f = (form || '').trim().toLowerCase();
  const c = (categorie || '').trim().toLowerCase();
  return f === 'cine' || f === 'cinema' || c === 'cinema' || c.includes('cinema');
}

export function isSeasonMegaMoodParent(
  parentMoods: readonly string[],
  form?: string,
  categorie?: string,
): boolean {
  if (!isCinemaParent(form, categorie)) return false;
  const seen = new Set<string>();
  for (const raw of parentMoods) {
    const slug = raw.trim().toLowerCase();
    if (slug) seen.add(slug);
  }
  return seen.size >= INHERITED_FAMILY_MIN_PARENT_MOODS;
}
