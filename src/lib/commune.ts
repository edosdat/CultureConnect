/**
 * Exact-commune display filter. Chip « Toulouse » = Toulouse only, not métropole.
 */

export function normalizeCommune(c: string | null | undefined): string {
  return (c || '').trim().toLocaleLowerCase('fr');
}

function filmIdOf(item: {
  kind?: string;
  programme?: { film_id?: string };
}): string {
  if (item.kind && item.kind !== 'programme') return '';
  return (item.programme?.film_id || '').trim();
}

export function itemMatchesCommune(
  item: {
    lieu?: { commune?: string } | null;
    kind?: string;
    programme?: { film_id?: string };
  },
  commune: string | null | undefined,
): boolean {
  if (!commune) return true;
  const itemCommune = (item.lieu?.commune || '').trim();
  if (!itemCommune) {
    // Don't drop a film_id when commune is missing. Filter when lieu has one.
    return Boolean(filmIdOf(item));
  }
  return normalizeCommune(itemCommune) === normalizeCommune(commune);
}

export function filterItemsByCommune<
  T extends {
    lieu?: { commune?: string } | null;
    kind?: string;
    programme?: { film_id?: string };
  },
>(items: T[], commune: string | null | undefined): T[] {
  if (!commune) return items;
  return items.filter((item) => itemMatchesCommune(item, commune));
}
