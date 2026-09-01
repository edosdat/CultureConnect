/**
 * Display-only: every séance on screen must match the filters above.
 * Date/window + exact commune + optional salle. Not métropole, not “next séance”.
 */

import { filterItemsByCommune } from './commune';
import { filterSeancesForDisplay } from './timeScope';
import type { DayItem } from './types';

export type DisplayFilter = {
  startIso?: string | null;
  endIso?: string | null;
  soir?: boolean;
  commune?: string | null;
  lieuId?: string | null;
  /**
   * Reco `tous` (QUAND chips off): POST is already scoped to upcoming.
   * Do not re-apply the day / Ce soir window.
   */
  skipDateWindow?: boolean;
};

export function itemMatchesLieu(
  item: { lieu?: { lieu_id?: string } | null },
  lieuId: string | null | undefined,
): boolean {
  if (!lieuId) return true;
  return (item.lieu?.lieu_id || '') === lieuId;
}

export function filterSeancesForActiveFilters<T extends DayItem>(
  items: T[],
  filter: DisplayFilter,
): T[] {
  let out = filterItemsByCommune(items, filter.commune);
  if (filter.lieuId) {
    out = out.filter((item) => itemMatchesLieu(item, filter.lieuId));
  }
  if (filter.skipDateWindow) return out;
  return filterSeancesForDisplay(out, {
    startIso: filter.startIso,
    endIso: filter.endIso,
    soir: filter.soir,
  }) as T[];
}

export function sortSeances<T extends DayItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = (a.kind === 'programme' ? a.programme.date || a.dayIso : a.dayIso) || '';
    const db = (b.kind === 'programme' ? b.programme.date || b.dayIso : b.dayIso) || '';
    if (da !== db) return da.localeCompare(db);
    const ha =
      a.kind === 'programme'
        ? a.programme.heure_debut || ''
        : a.evenement.heure_debut || '';
    const hb =
      b.kind === 'programme'
        ? b.programme.heure_debut || ''
        : b.evenement.heure_debut || '';
    return ha.localeCompare(hb);
  });
}
