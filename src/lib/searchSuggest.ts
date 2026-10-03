/**
 * Secondary catalogue suggest (bare title / artist) plus a salle row.
 * Titles stay capped at 8. A matching salle is a separate row, so a
 * title sample cannot hide the venue. Not used when NL already deduced
 * a filter chip.
 */

import { normalizeSearch } from './searchText';

export const SEARCH_SUGGEST_CAP = 8;

/** Salle rows beside the title sample — not the event list under the field. */
export const SALLE_SUGGEST_CAP = 8;

export type SearchSuggestKind = 'titre' | 'artiste' | 'salle';

export type SalleSuggestLieu = {
  id: string;
  nom: string;
  commune?: string;
};

/** Articles that are not a venue name. « le » must not list every « Le … ». */
const VENUE_TOKEN_SKIP = new Set([
  'le',
  'la',
  'les',
  'au',
  'aux',
  'de',
  'du',
  'des',
  'un',
  'une',
  'et',
  'a',
]);

export type SearchSuggestEntry = {
  kind: SearchSuggestKind;
  label: string;
  sub?: string;
  /** Titre: agenda item key (`p:` / `e:`). Artiste: display name to commit. */
  id: string;
};

export type HighlightPart = { text: string; bold: boolean };

function foldMap(text: string): { folded: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const stripped = ch
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
    let piece = stripped;
    if (/['’‘`]/.test(ch) || /[-_/]/.test(ch)) piece = ' ';
    if (!piece) {
      i += ch.length;
      continue;
    }
    for (const c of piece) {
      out += c;
      map.push(i);
    }
    i += ch.length;
  }
  let collapsed = '';
  const cmap: number[] = [];
  let prevSpace = false;
  for (let k = 0; k < out.length; k++) {
    const c = out[k]!;
    if (c === ' ') {
      if (prevSpace || collapsed.length === 0) {
        prevSpace = true;
        continue;
      }
      prevSpace = true;
    } else {
      prevSpace = false;
    }
    collapsed += c;
    cmap.push(map[k]!);
  }
  const trimmed = collapsed.replace(/\s+$/, '');
  return { folded: trimmed, map: cmap.slice(0, trimmed.length) };
}

export function highlightLabel(label: string, query: string): HighlightPart[] {
  const q = normalizeSearch(query);
  if (q.length < 2) return [{ text: label, bold: false }];
  const { folded, map } = foldMap(label);
  const at = folded.indexOf(q);
  if (at < 0 || at + q.length - 1 >= map.length) {
    return [{ text: label, bold: false }];
  }
  const start = map[at]!;
  const last = map[at + q.length - 1]!;
  const cp = [...label.slice(last)][0] ?? '';
  const end = last + cp.length;
  return [
    { text: label.slice(0, start), bold: false },
    { text: label.slice(start, end), bold: true },
    { text: label.slice(end), bold: false },
  ].filter((part) => part.text.length > 0);
}

function scoreLabel(label: string, q: string): number | null {
  const hay = normalizeSearch(label);
  const idx = hay.indexOf(q);
  if (idx >= 0) return idx === 0 ? 0 : 200 + idx;
  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length < 2 || !tokens.every((t) => hay.includes(t))) return null;
  return 800;
}

/** Rank local titles then artists. Empty when the query is under 2 chars. */
export function suggestLocal(
  entries: readonly SearchSuggestEntry[],
  query: string,
): SearchSuggestEntry[] {
  const q = normalizeSearch(query);
  if (q.length < 2) return [];
  const scored: { entry: SearchSuggestEntry; score: number }[] = [];
  for (const entry of entries) {
    const base = scoreLabel(entry.label, q);
    if (base == null) continue;
    const typeRank = entry.kind === 'titre' ? 0 : 1;
    scored.push({ entry, score: base * 10 + typeRank });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.label.localeCompare(b.entry.label, 'fr'),
  );
  return scored.slice(0, SEARCH_SUGGEST_CAP).map((row) => row.entry);
}

function venueTokens(nom: string): string[] {
  return normalizeSearch(nom)
    .split(' ')
    .filter((token) => token.length >= 2 && !VENUE_TOKEN_SKIP.has(token));
}

/**
 * Known salles whose name matches the typed text.
 * « taquin » → Le Taquin, « rex » → Le Rex. Same rule for every lieu.
 * Matching uses the venue name, not « Toulouse — … », so a city does not
 * propose every salle. The event list is a later lieu query, not this cap.
 */
export function suggestSalles(
  lieux: readonly SalleSuggestLieu[],
  query: string,
): SearchSuggestEntry[] {
  const q = normalizeSearch(query);
  if (q.length < 2 || VENUE_TOKEN_SKIP.has(q)) return [];
  const scored: { entry: SearchSuggestEntry; score: number }[] = [];
  const seen = new Set<string>();
  for (const lieu of lieux) {
    const id = (lieu.id || '').trim();
    const nom = (lieu.nom || '').trim();
    if (!id || !nom || seen.has(id)) continue;
    const folded = normalizeSearch(nom);
    if (!folded) continue;
    const tokens = venueTokens(nom);
    const exactToken = tokens.some((token) => token === q);
    const includes = q.length >= 4 && folded.includes(q);
    if (!exactToken && !includes) continue;
    seen.add(id);
    let score = 400;
    if (folded === q) score = 0;
    else if (exactToken) score = 10;
    else if (folded.startsWith(q)) score = 30;
    else {
      const at = folded.indexOf(q);
      score = 100 + (at < 0 ? 0 : at);
    }
    const commune = (lieu.commune || '').trim();
    scored.push({
      score,
      entry: {
        kind: 'salle',
        label: nom,
        sub: commune || undefined,
        id,
      },
    });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.label.localeCompare(b.entry.label, 'fr'),
  );
  return scored.slice(0, SALLE_SUGGEST_CAP).map((row) => row.entry);
}
