/**
 * Display-only: every séance on screen must match the filters above.
 * Date/window + exact commune + optional salle + QUOI chips (cat + genre).
 * Not métropole, not “next séance”.
 */

import { matchesMainCategories } from './categories';
import { filterItemsByCommune } from './commune';
import {
  genreFieldsFromDayItem,
  matchesSelectedGenres,
} from './genreChipMatch';
import { isCinemaDayItem } from './nouveautesCine';
import { filterSeancesForDisplay } from './timeScope';
import type { DayItem } from './types';

export type DisplayFilter = {
  startIso?: string | null;
  endIso?: string | null;
  soir?: boolean;
  commune?: string | null;
  lieuId?: string | null;
  /** Catalogue QUOI genre chips (Jazz / blues…). Applied on the painted packs. */
  genres?: string[];
  /**
   * QUOI category chips (Festival / Expo / Enfants…). Same predicate as the
   * API pool — extra chips must prune painted rails immediately, like Jazz.
   */
  categories?: string[];
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

/**
 * Title search already ignores commune on the API — keep the client in sync
 * so a Ramonville hit is not blanked by the default Toulouse chip.
 */
export function listDisplayFilter(
  filter: DisplayFilter,
  opts: { searching?: boolean },
): DisplayFilter {
  if (opts.searching) return { ...filter, commune: null };
  return filter;
}

/**
 * Living-arts fiche créneaux are the same work (title match).
 * A Toulouse chip must not blank Ramonville festival rows.
 * Cinema keeps commune (multi-salle cities).
 */
export function relatedSeancesFilter(
  filter: DisplayFilter,
  item: DayItem | null | undefined,
): DisplayFilter {
  if (!item || isCinemaDayItem(item)) return filter;
  return { ...filter, commune: null };
}

function categorieOfDayItem(item: DayItem): string {
  if (item.kind === 'programme') return item.evenement?.categorie ?? '';
  return item.evenement.categorie ?? '';
}

export function filterSeancesForActiveFilters<T extends DayItem>(
  items: T[],
  filter: DisplayFilter,
): T[] {
  let out = filterItemsByCommune(items, filter.commune);
  if (filter.lieuId) {
    out = out.filter((item) => itemMatchesLieu(item, filter.lieuId));
  }
  const categories = filter.categories ?? [];
  if (categories.length > 0) {
    out = out.filter((item) => {
      const fields = genreFieldsFromDayItem(item);
      return matchesMainCategories(categorieOfDayItem(item), fields.genre, categories, {
        tags: fields.tags,
        publicCible: fields.publicCible,
      });
    });
  }
  const genres = filter.genres ?? [];
  if (genres.length > 0) {
    out = out.filter((item) =>
      matchesSelectedGenres(genreFieldsFromDayItem(item), genres),
    );
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
