/**
 * Press citation for living-arts fiches (theatre, concert, artiste).
 * Catalogue fields only. Hide the whole block when no quote exists.
 * Never invent a rating. Never show on cinema.
 */

import { isCinemaDayItem, isMusiqueDayItem, isTheatreDayItem } from './nouveautesCine';
import type { Artiste, DayItem, Evenement, ProgrammeItem } from './types';

export type PressCitation = {
  quote: string;
  source: string;
  url: string;
  rating: string;
};

const QUOTE_KEYS = [
  'citation',
  'citation_presse',
  'presse_citation',
] as const;

const MEDIA_KEYS = [
  'source',
  'citation_source',
  'presse_media',
  'media_presse',
  'presse_source',
] as const;

const URL_KEYS = [
  'source_url',
  'presse_url',
  'url_presse',
  'citation_url',
] as const;

const NOTE_KEYS = [
  'note_presse',
  'citation_note',
  'score_presse',
  'presse_note',
  'note_telerama',
] as const;

const INDEXED_RE =
  /^(citation|citation_presse|presse_citation|citation_source|source|source_url|note_presse|citation_note|score_presse|confiance|presse_media|media_presse|presse_source|presse_url|url_presse|citation_url|presse_note|note_telerama)_(\d+)$/;

const PRESS_KEY_RE =
  /^(citation|source|source_url|note_presse|score_presse|confiance|citation_presse|presse_citation|citation_source|citation_note|presse_media|media_presse|presse_source|presse_url|url_presse|citation_url|presse_note|note_telerama)(?:_\d+)?$/;

/** Known outlets for ranking + host → label. Never invent ratings from these. */
const SOURCE_ALIASES: { test: RegExp; label: string; rank: number }[] = [
  { test: /t[ée]l[ée]rama/i, label: 'Télérama', rank: 0 },
  { test: /sceneweb/i, label: 'Sceneweb', rank: 1 },
  { test: /la\s*terrasse|journal-laterrasse/i, label: 'La Terrasse', rank: 1 },
  { test: /d[ée]p[êe]che|ladepeche/i, label: 'La Dépêche', rank: 2 },
  { test: /la\s*tribune/i, label: 'La Tribune', rank: 2 },
  { test: /touleco/i, label: 'ToulÉco', rank: 2 },
  { test: /france\s*3|france3/i, label: 'France 3', rank: 2 },
];

export function isPressCatalogueKey(key: string): boolean {
  return PRESS_KEY_RE.test(key.trim());
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const EMPTY_PRESS_FIELDS: Record<string, string> = {
  citation: '',
  source: '',
  source_url: '',
  note_presse: '',
  score_presse: '',
  confiance: '',
  citation_presse: '',
  presse_citation: '',
  citation_source: '',
  presse_media: '',
  media_presse: '',
  presse_source: '',
  presse_url: '',
  url_presse: '',
  citation_url: '',
  citation_note: '',
  presse_note: '',
  note_telerama: '',
};

/** CSV load: keep known press aliases as strings even when the column is absent. */
export function pressFieldDefaults(
  row: Record<string, string | undefined>,
): Record<string, string> {
  const out = { ...EMPTY_PRESS_FIELDS };
  for (const key of Object.keys(EMPTY_PRESS_FIELDS)) {
    out[key] = str(row[key]);
  }
  return out;
}

/** Keep fill-empty presse_* / citation_* cells on the detail payload. */
export function pickPressCatalogueFields(
  row: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!row) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!isPressCatalogueKey(key)) continue;
    const v = str(value);
    if (v) out[key] = v;
  }
  return out;
}

function firstKeyed(
  row: Record<string, unknown>,
  keys: readonly string[],
  index?: string,
): string {
  for (const key of keys) {
    const k = index ? `${key}_${index}` : key;
    const v = str(row[k]);
    if (v) return v;
  }
  return '';
}

function splitMulti(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (t.includes('||')) {
    return t
      .split(/\s*\|\|\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [t];
}

function parseJsonCitations(raw: string): PressCitation[] {
  const t = raw.trim();
  if (!t.startsWith('[') && !t.startsWith('{')) return [];
  try {
    const parsed: unknown = JSON.parse(t);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const out: PressCitation[] = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const built = normalizeCandidate({
        quote: str(
          rec.citation ??
            rec.citation_presse ??
            rec.presse_citation ??
            rec.quote ??
            rec.texte,
        ),
        source: str(
          rec.source ??
            rec.citation_source ??
            rec.media ??
            rec.presse_media ??
            rec.media_presse,
        ),
        url: str(
          rec.source_url ?? rec.url ?? rec.presse_url ?? rec.url_presse ?? rec.lien,
        ),
        rating: str(
          rec.note_presse ??
            rec.citation_note ??
            rec.score_presse ??
            rec.note ??
            rec.presse_note ??
            rec.rating,
        ),
      });
      if (built) out.push(built);
    }
    return out;
  } catch {
    return [];
  }
}

function parsePacked(raw: string): Partial<PressCitation> | null {
  if (!raw.includes('|') || !/https:\/\//i.test(raw)) return null;
  const parts = raw.split('|').map((s) => s.trim());
  if (parts.length < 2) return null;
  return {
    quote: parts[0] || '',
    source: parts[1] || '',
    url: parts[2] || '',
    rating: parts[3] || '',
  };
}

function clipTwoSentences(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const sentences = t.split(/(?<=[.!?…])\s+/).filter(Boolean);
  let out = sentences.slice(0, 2).join(' ') || t;
  if (out.length > 280) {
    out = out.slice(0, 277).replace(/\s+\S*$/, '') + '…';
  }
  return out;
}

function frenchGuillemets(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^["“”«]\s*/, '').replace(/\s*["“”»]$/, '').trim();
  if (!t) return '';
  return `« ${t} »`;
}

function httpsArticleUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:') return '';
    if (!u.hostname || u.hostname === 'localhost') return '';
    return u.toString();
  } catch {
    return '';
  }
}

/** Catalogue Télérama T→TTTT only. Never map 4/5 or stars to T's. */
export function cataloguePressRating(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const compact = t.replace(/\s+/g, '');
  if (/^T{1,5}$/i.test(compact)) return compact.toUpperCase();
  return '';
}

function sourceFromHost(url: string): string {
  if (!url) return '';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const a of SOURCE_ALIASES) {
      if (a.test.test(host)) return a.label;
    }
    return '';
  } catch {
    return '';
  }
}

function displaySource(raw: string, url: string): string {
  const t = raw.trim();
  if (t) {
    for (const a of SOURCE_ALIASES) {
      if (a.test.test(t)) return a.label;
    }
    return t;
  }
  return sourceFromHost(url);
}

function sourceRank(source: string, url: string): number {
  const hay = `${source} ${url}`;
  for (const a of SOURCE_ALIASES) {
    if (a.test.test(hay)) return a.rank;
  }
  return source ? 3 : 4;
}

function normalizeCandidate(raw: {
  quote: string;
  source: string;
  url: string;
  rating: string;
}): PressCitation | null {
  const quote = frenchGuillemets(clipTwoSentences(raw.quote));
  if (!quote) return null;
  const url = httpsArticleUrl(raw.url);
  const source = displaySource(raw.source, url);
  const rating = cataloguePressRating(raw.rating);
  return { quote, source, url, rating };
}

function collectFromRow(row: Record<string, unknown> | null | undefined): PressCitation[] {
  if (!row) return [];
  const out: PressCitation[] = [];
  const seen = new Set<string>();

  const push = (c: PressCitation | null) => {
    if (!c) return;
    const k = `${c.quote}|${c.source}|${c.url}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };

  const quoteBlob = firstKeyed(row, QUOTE_KEYS);
  for (const json of [quoteBlob, str(row.citations_presse), str(row.presse)]) {
    for (const c of parseJsonCitations(json)) push(c);
  }

  const packed = parsePacked(quoteBlob);
  if (packed) {
    push(
      normalizeCandidate({
        quote: packed.quote || '',
        source: packed.source || firstKeyed(row, MEDIA_KEYS),
        url: packed.url || firstKeyed(row, URL_KEYS),
        rating: packed.rating || firstKeyed(row, NOTE_KEYS),
      }),
    );
  }

  const quotes = packed ? [] : splitMulti(quoteBlob);
  const medias = splitMulti(firstKeyed(row, MEDIA_KEYS));
  const urls = splitMulti(firstKeyed(row, URL_KEYS));
  const notes = splitMulti(firstKeyed(row, NOTE_KEYS));
  const n = Math.max(quotes.length, 0);
  for (let i = 0; i < n; i += 1) {
    push(
      normalizeCandidate({
        quote: quotes[i] || '',
        source: medias[i] || medias[0] || '',
        url: urls[i] || urls[0] || '',
        rating: notes[i] || notes[0] || '',
      }),
    );
  }

  const indexes = new Set<string>();
  for (const key of Object.keys(row)) {
    const m = key.match(INDEXED_RE);
    if (m) indexes.add(m[2]);
  }
  for (const index of [...indexes].sort()) {
    push(
      normalizeCandidate({
        quote: firstKeyed(row, QUOTE_KEYS, index),
        source: firstKeyed(row, MEDIA_KEYS, index),
        url: firstKeyed(row, URL_KEYS, index),
        rating: firstKeyed(row, NOTE_KEYS, index),
      }),
    );
  }

  return out;
}

function pickBest(candidates: PressCitation[]): PressCitation | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  const ranked = [...candidates].sort((a, b) => {
    const ra = sourceRank(a.source, a.url);
    const rb = sourceRank(b.source, b.url);
    if (ra !== rb) return ra - rb;
    const la = a.quote.length;
    const lb = b.quote.length;
    if (la !== lb) return la - lb;
    return a.source.localeCompare(b.source, 'fr');
  });
  return ranked[0]!;
}

export function pressCitationOf(item: DayItem): PressCitation | null {
  const ev: Evenement | null = item.evenement;
  const prog: ProgrammeItem | null =
    item.kind === 'programme' ? item.programme : null;
  const candidates = [
    ...collectFromRow(ev as unknown as Record<string, unknown>),
    ...collectFromRow(prog as unknown as Record<string, unknown>),
  ];
  return pickBest(candidates);
}

function eventIdOf(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      item.evenement?.event_id ||
      item.programme.event_id ||
      ''
    ).trim();
  }
  return (item.evenement.event_id || '').trim();
}

/** Prefer the detail payload (press cells survive slim) when it is the same show. */
export function pressItemForFiche(
  active: DayItem,
  detail: DayItem | null,
): DayItem {
  if (!detail) return active;
  if (detail.key === active.key) return detail;
  const a = eventIdOf(active);
  const d = eventIdOf(detail);
  if (a && a === d) return detail;
  return active;
}

export function pressCitationFromRow(
  row: Record<string, unknown> | null | undefined,
): PressCitation | null {
  return pickBest(collectFromRow(row));
}

export function artistPressCitation(
  artiste: Artiste | null | undefined,
): PressCitation | null {
  if (!artiste) return null;
  return pressCitationFromRow(artiste as unknown as Record<string, unknown>);
}

export function artistIdsOfItem(item: DayItem): string[] {
  if (item.kind !== 'programme') return [];
  return (item.programme.artiste_id || '')
    .split(/[|,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function artistFallbackCitation(
  item: DayItem,
  artistes: Artiste[] | null | undefined,
): PressCitation | null {
  if (!artistes?.length) return null;
  const byId = new Map(artistes.map((a) => [a.artiste_id, a]));
  for (const id of artistIdsOfItem(item)) {
    const c = artistPressCitation(byId.get(id));
    if (c) return c;
  }
  return null;
}

/**
 * Copy artistes.csv citation* onto a concert row when programme.citation is empty.
 * Theatre keeps programme.citation* only. Cinema unchanged.
 */
export function withConcertArtistPress(
  item: DayItem,
  artistes: Artiste[],
): DayItem {
  if (isCinemaDayItem(item)) return item;
  if (!isMusiqueDayItem(item)) return item;
  if (pressCitationOf(item)) return item;
  if (item.kind !== 'programme') return item;
  const byId = new Map(artistes.map((a) => [a.artiste_id, a]));
  for (const id of artistIdsOfItem(item)) {
    const a = byId.get(id);
    const fields = pickPressCatalogueFields(
      a as unknown as Record<string, unknown>,
    );
    if (
      !fields.citation &&
      !fields.citation_presse &&
      !fields.presse_citation
    ) {
      continue;
    }
    return {
      ...item,
      programme: { ...item.programme, ...fields },
    };
  }
  return item;
}

/**
 * Theatre: programme.citation*.
 * Concert: programme.citation*, else artistes.csv via programme.artiste_id.
 * Cinema / expo / enfants → null.
 */
export function fichePressCitation(
  item: DayItem,
  artistes?: Artiste[] | null,
): PressCitation | null {
  if (isCinemaDayItem(item)) return null;
  if (!isTheatreDayItem(item) && !isMusiqueDayItem(item)) return null;
  const fromShow = pressCitationOf(item);
  if (fromShow) return fromShow;
  if (!isMusiqueDayItem(item)) return null;
  return artistFallbackCitation(item, artistes);
}

/** Max media name length for « Vu dans {média} » on a ~380 pack/rail vignette. */
export const PRESS_BADGE_SOURCE_MAX = 14;

export type PressBadge = {
  label: string;
  source: string;
};

/**
 * Default « Presse ». Optional « Vu dans {média} » when the outlet name is
 * short enough for the live card chrome (not the agenda mock).
 */
export function pressBadgeLabel(source: string): string {
  const t = source.trim();
  if (t && [...t].length <= PRESS_BADGE_SOURCE_MAX) {
    return `Vu dans ${t}`;
  }
  return 'Presse';
}

/**
 * Pack/rail pill for theatre and musique. Same resolution as PressCitation
 * (programme OR evenement citation*). Hide when no quote — no ghost.
 * No artist-row fallback on cards (fiche may still use artistes.csv).
 */
export function packCardPressBadge(item: DayItem): PressBadge | null {
  if (!isTheatreDayItem(item) && !isMusiqueDayItem(item)) return null;
  const citation = pressCitationOf(item);
  if (!citation) return null;
  return {
    label: pressBadgeLabel(citation.source),
    source: citation.source,
  };
}

/** @deprecated Use packCardPressBadge — theatre + musique. */
export function theatreCardPressBadge(item: DayItem): PressBadge | null {
  if (!isTheatreDayItem(item)) return null;
  return packCardPressBadge(item);
}
