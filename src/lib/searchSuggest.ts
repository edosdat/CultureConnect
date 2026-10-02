/**
 * Secondary catalogue suggest (bare title / artist only).
 * Local list, hard cap 8. Not used when NL already deduced a filter chip.
 */

import { normalizeSearch } from './searchText';

export const SEARCH_SUGGEST_CAP = 8;

export type SearchSuggestKind = 'titre' | 'artiste';

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
