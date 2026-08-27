import { normalizeForMatch } from './publishable';
import { labelCategorie } from './labels';
import type { DayItem, GenreLegend } from './types';

export { normalizeForMatch };

/** Search normalize: accents + apostrophes/tirets → espaces (l\'odyssée = odyssee). */
export function normalizeSearch(text: string): string {
  return normalizeForMatch(text)
    .replace(/[''‘`]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if normalized haystack contains full query, or every query token. */
export function matchesSearch(haystack: string, query: string): boolean {
  return matchesNormalizedHaystack(normalizeSearch(haystack), query);
}

/** Token matching; haystack may be raw or already normalized. */
export function matchesNormalizedHaystack(
  hayNormalized: string,
  query: string,
): boolean {
  const hay = normalizeSearch(hayNormalized);
  const q = normalizeSearch(query);
  if (!q) return true;
  if (hay.includes(q)) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return false;
  return tokens.every((t) => hay.includes(t));
}

/** Cache normalizeForMatch(itemSearchBlob) per item.key across keystrokes. */
export function cachedNormalizedBlob(
  cache: Map<string, string>,
  item: DayItem,
  genresLegend: GenreLegend[],
): string {
  const existing = cache.get(item.key);
  if (existing !== undefined) return existing;
  const hay = normalizeForMatch(itemSearchBlob(item, genresLegend));
  cache.set(item.key, hay);
  return hay;
}

function genreLabel(slug: string, legend: GenreLegend[]): string {
  return legend.find((g) => g.slug === slug)?.label_fr ?? slug;
}

function pushGenreParts(
  parts: string[],
  slug: string,
  legend: GenreLegend[],
): void {
  const s = (slug || '').trim();
  if (!s) return;
  parts.push(s);
  parts.push(s.replace(/_/g, ' '));
  const label = genreLabel(s, legend);
  if (label && label !== s) parts.push(label);
}

/** Searchable text for an agenda DayItem (labels + slugs + venue). */
export function itemSearchBlob(
  item: DayItem,
  genresLegend: GenreLegend[],
  artisteNameById?: Map<string, string>,
  filmTitleById?: Map<string, string>,
): string {
  const parts: string[] = [];

  if (item.kind === 'programme') {
    parts.push(item.programme.nom_item);
    if (item.evenement?.titre) parts.push(item.evenement.titre);
    if (item.evenement?.description_courte)
      parts.push(item.evenement.description_courte);
    if (item.programme.notes) parts.push(item.programme.notes);
    if (item.programme.description_item)
      parts.push(item.programme.description_item);
    if (item.programme.genre)
      pushGenreParts(parts, item.programme.genre, genresLegend);
    if (item.evenement?.genre)
      pushGenreParts(parts, item.evenement.genre, genresLegend);
    if (item.evenement?.casting) parts.push(item.evenement.casting);
    if (item.evenement?.categorie) {
      parts.push(item.evenement.categorie);
      parts.push(labelCategorie(item.evenement.categorie));
    }
    const aid = (item.programme.artiste_id || '').trim();
    if (aid && artisteNameById?.has(aid)) {
      parts.push(artisteNameById.get(aid)!);
    }
    const fid = (item.programme.film_id || '').trim();
    if (fid && filmTitleById?.has(fid)) {
      parts.push(filmTitleById.get(fid)!);
    }
  } else {
    parts.push(item.evenement.titre);
    if (item.evenement.description_courte)
      parts.push(item.evenement.description_courte);
    if (item.evenement.genre)
      pushGenreParts(parts, item.evenement.genre, genresLegend);
    if (item.evenement.casting) parts.push(item.evenement.casting);
    if (item.evenement.categorie) {
      parts.push(item.evenement.categorie);
      parts.push(labelCategorie(item.evenement.categorie));
    }
  }

  if (item.lieu) {
    if (item.lieu.label_affiche) parts.push(item.lieu.label_affiche);
    if (item.lieu.nom) parts.push(item.lieu.nom);
    if (item.lieu.commune) parts.push(item.lieu.commune);
  }

  return parts.filter(Boolean).join(' ');
}
