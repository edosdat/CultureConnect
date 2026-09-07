import type { DayItem } from './types';
import { seanceDateIso } from './timeScope';
import { itemSortKm, type GeoPos } from './nearMe';

export type DenseRow = {
  item: DayItem;
  /** Filtered séances in this film/event group (source of truth for horaires). */
  seances: DayItem[];
  groupKey: string;
  extraSlots: number;
  salleCount: number;
  earliestHeure: string;
  citiesSummary: string;
  isFilmGroup: boolean;
};

function heureKey(item: DayItem): string {
  if (item.kind === 'programme') return item.programme.heure_debut || '99:99';
  return item.evenement.heure_debut || '99:99';
}

function hasImage(item: DayItem): boolean {
  if (item.kind === 'programme') {
    return Boolean(
      (item.programme.image_url || '').trim() ||
        (item.evenement?.image_url || '').trim(),
    );
  }
  return Boolean((item.evenement.image_url || '').trim());
}

/** Earliest Paris calendar séance in the group — never a later day with a nicer poster. */
function pickRepresentative(g: DayItem[], origin?: GeoPos | null): DayItem {
  if (origin) {
    const ranked = [...g].sort((a, b) => {
      const da = itemSortKm(a, origin);
      const db = itemSortKm(b, origin);
      if (da !== db) return da - db;
      const day = seanceDateIso(a).localeCompare(seanceDateIso(b));
      if (day !== 0) return day;
      return heureKey(a).localeCompare(heureKey(b));
    });
    return ranked[0];
  }
  const ranked = [...g].sort((a, b) => {
    const da = seanceDateIso(a);
    const db = seanceDateIso(b);
    if (da !== db) return da.localeCompare(db);
    const ha = heureKey(a).localeCompare(heureKey(b));
    if (ha !== 0) return ha;
    return Number(hasImage(b)) - Number(hasImage(a));
  });
  return ranked[0];
}

function earliestHeureOf(g: DayItem[]): string {
  let best = '';
  for (const item of g) {
    const h = heureKey(item);
    if (!h || h === '99:99') continue;
    const slice = h.slice(0, 5);
    if (!best || slice < best) best = slice;
  }
  return best;
}

function citiesSummaryOf(g: DayItem[]): string {
  const cities: string[] = [];
  const seen = new Set<string>();
  for (const item of g) {
    const c = (item.lieu?.commune || '').trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    cities.push(c);
  }
  if (cities.length <= 1) return cities[0] || '';
  if (cities.length <= 3) return cities.join(', ');
  return `${cities.slice(0, 2).join(', ')}…`;
}

function itemTitleRaw(item: DayItem): string {
  return item.kind === 'programme'
    ? item.programme.nom_item || item.evenement?.titre || ''
    : item.evenement.titre || '';
}

export function normalizeDisplayTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleNorm(item: DayItem): string {
  return normalizeDisplayTitle(itemTitleRaw(item));
}

/** Display work stem — not a new film_id. Strips partie N / punctuation. */
export function cinemaTitleStem(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\bpartie\s*\d+\b/g, ' ')
    .replace(/[''`´‘’]/g, '')
    .replace(/[-–—:.,…·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cinemaDisplayStem(item: DayItem): string {
  return cinemaTitleStem(itemTitleRaw(item));
}

const STEM_PREFIX_MIN = 20;

/** Same work: equal stem, or a truncated title that is a word-boundary prefix. */
export function cinemaStemsCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < STEM_PREFIX_MIN) return false;
  // Truncated catalogue titles ("J...") must still join "J'écris ton nom".
  return long.startsWith(short);
}

function eventIdOf(item: DayItem): string {
  if (item.kind === 'programme') return (item.programme.event_id || '').trim();
  return (item.evenement.event_id || '').trim();
}

/** Display cinema? Official film_id, form cine, or cinema categorie. Not title invention. */
function looksCinema(item: DayItem): boolean {
  if (item.kind === 'programme' && (item.programme.film_id || '').trim()) {
    return true;
  }
  const form = (
    (item.kind === 'programme' ? item.programme.form : item.evenement.form) || ''
  ).trim();
  if (form === 'cine' || form === 'cinema') return true;
  const cat = (item.evenement?.categorie || '').toLowerCase();
  return cat.includes('cinema') || cat.includes('cinematheque');
}

export function displayTitleNorm(item: DayItem): string {
  return titleNorm(item);
}

/**
 * Strongest visible-card identity (not CSV, not reco):
 * - cinema → work stem (catalogue film_id clones collapse)
 * - else normalised title (weekly per-night event_id clones collapse)
 * - else event_id / raw key
 */
export function visibleWorkKey(item: DayItem): string {
  if (looksCinema(item)) {
    const stem = cinemaDisplayStem(item);
    if (stem) return `film:w:${stem}`;
    const filmId =
      item.kind === 'programme' ? (item.programme.film_id || '').trim() : '';
    if (filmId) return `film:${filmId}`;
  }
  const title = titleNorm(item);
  if (title) return `t:${title}`;
  const eventId = eventIdOf(item);
  if (eventId) return `ev:${eventId}`;
  return item.key;
}

export function densifyGroupKey(item: DayItem): string {
  return visibleWorkKey(item);
}

function sameVisibleWork(a: DayItem, b: DayItem): boolean {
  if (visibleWorkKey(a) === visibleWorkKey(b)) return true;
  if (looksCinema(a) && looksCinema(b)) {
    return cinemaStemsCompatible(cinemaDisplayStem(a), cinemaDisplayStem(b));
  }
  return false;
}

/**
 * Unique visible works in the first N cards vs the first N raw rows.
 * First scroll must be 100% unique after densify.
 */
export function firstScrollUniqueShare(
  items: DayItem[],
  firstN: number,
): { rawShare: number; denseShare: number } {
  const n = Math.max(0, firstN);
  const raw = items.slice(0, n);
  const rawShare =
    raw.length === 0
      ? 1
      : new Set(raw.map(visibleWorkKey)).size / raw.length;
  const dense = densify(items).slice(0, n);
  const denseShare =
    dense.length === 0
      ? 1
      : new Set(dense.map((row) => visibleWorkKey(row.item))).size /
        dense.length;
  return { rawShare, denseShare };
}

export function densify(
  items: DayItem[],
  opts?: { origin?: GeoPos | null },
): DenseRow[] {
  const groups = new Map<string, DayItem[]>();
  const order: string[] = [];
  const filmFlags = new Map<string, boolean>();
  const origin = opts?.origin ?? null;

  for (const item of items) {
    const groupKey = densifyGroupKey(item);
    const isFilm = groupKey.startsWith('film:');
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      order.push(groupKey);
      filmFlags.set(groupKey, isFilm);
    }
    groups.get(groupKey)!.push(item);
  }

  const mergedOrder = mergeCompatibleFilmGroups(groups, order, filmFlags);
  const rows = hardUniqueRows(
    mergedOrder.map((k) => toDenseRow(k, groups.get(k)!, filmFlags, origin)),
    origin,
  );
  if (!origin) return rows;
  return [...rows].sort((a, b) => {
    const da = Math.min(...a.seances.map((s) => itemSortKm(s, origin)));
    const db = Math.min(...b.seances.map((s) => itemSortKm(s, origin)));
    return da - db;
  });
}

function toDenseRow(
  groupKey: string,
  g: DayItem[],
  filmFlags: Map<string, boolean>,
  origin: GeoPos | null,
): DenseRow {
  const isFilmGroup =
    filmFlags.get(groupKey) === true || groupKey.startsWith('film:');
  const item = pickRepresentative(g, origin);
  const venues = new Set(
    g.map((i) => i.lieu?.lieu_id).filter((id): id is string => Boolean(id)),
  );
  return {
    item,
    seances: g,
    groupKey,
    extraSlots: Math.max(0, g.length - 1),
    salleCount: isFilmGroup ? venues.size : 0,
    earliestHeure: isFilmGroup ? earliestHeureOf(g) : '',
    citiesSummary: isFilmGroup ? citiesSummaryOf(g) : '',
    isFilmGroup,
  };
}

/** Last pass: never leave two visible cards for the same work. */
function hardUniqueRows(
  rows: DenseRow[],
  origin: GeoPos | null,
): DenseRow[] {
  const out: DenseRow[] = [];
  for (const row of rows) {
    const hit = out.findIndex((keep) => sameVisibleWork(keep.item, row.item));
    if (hit < 0) {
      out.push(row);
      continue;
    }
    const keep = out[hit]!;
    const seances = [...keep.seances, ...row.seances];
    const flags = new Map<string, boolean>([[keep.groupKey, keep.isFilmGroup]]);
    out[hit] = toDenseRow(keep.groupKey, seances, flags, origin);
  }
  return out;
}

/** Card count after film / event collapse (for agenda counters). */
export function densifiedCardCount(items: DayItem[]): number {
  if (items.length <= 1) return items.length;
  return densify(items).length;
}

function mergeCompatibleFilmGroups(
  groups: Map<string, DayItem[]>,
  order: string[],
  filmFlags: Map<string, boolean>,
): string[] {
  const filmKeys = order.filter((k) => filmFlags.get(k));
  if (filmKeys.length < 2) return order;

  const stemOf = new Map<string, string>();
  for (const k of filmKeys) {
    const g = groups.get(k);
    if (!g?.length) continue;
    const stems = g.map(cinemaDisplayStem).filter(Boolean);
    stems.sort((a, b) => b.length - a.length);
    stemOf.set(k, stems[0] || '');
  }

  const parent = new Map<string, string>();
  for (const k of filmKeys) parent.set(k, k);
  const find = (k: string): string => {
    let p = parent.get(k) ?? k;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(k, p);
    return p;
  };

  for (let i = 0; i < filmKeys.length; i++) {
    for (let j = i + 1; j < filmKeys.length; j++) {
      const a = filmKeys[i]!;
      const b = filmKeys[j]!;
      if (!cinemaStemsCompatible(stemOf.get(a) || '', stemOf.get(b) || '')) {
        continue;
      }
      const pa = find(a);
      const pb = find(b);
      if (pa === pb) continue;
      const keep = order.indexOf(pa) <= order.indexOf(pb) ? pa : pb;
      const drop = keep === pa ? pb : pa;
      parent.set(drop, keep);
      groups.get(keep)!.push(...(groups.get(drop) || []));
      groups.delete(drop);
      filmFlags.delete(drop);
    }
  }

  return order.filter((k) => groups.has(k));
}
