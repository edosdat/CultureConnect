/**
 * Exact-commune display filter. Chip « Toulouse » = Toulouse only, not métropole.
 */

export function normalizeCommune(c: string | null | undefined): string {
  return (c || '').trim().toLocaleLowerCase('fr');
}

export function itemMatchesCommune(
  item: { lieu?: { commune?: string } | null },
  commune: string | null | undefined,
): boolean {
  if (!commune) return true;
  return normalizeCommune(item.lieu?.commune) === normalizeCommune(commune);
}

export function filterItemsByCommune<
  T extends { lieu?: { commune?: string } | null },
>(items: T[], commune: string | null | undefined): T[] {
  if (!commune) return items;
  const target = normalizeCommune(commune);
  return items.filter(
    (item) => normalizeCommune(item.lieu?.commune) === target,
  );
}
