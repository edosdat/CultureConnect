/**
 * Tags v2 — pure readers. No disk, no scoring.
 *
 * Storage is `data/tags_evenements.csv`, one row per work, key `event_id`
 * only. `data.ts` joins that file onto `evenement.tags_v2`. A missing file
 * or a headers-only file is an empty index: nothing is attached and v1
 * `moods` stay as they are. Programme séances have no v2 row of their own;
 * `eventTagsOf` reads the parent event, the same idea as parent mood
 * inheritance at match time.
 *
 * `budget` and `jauge` are calculated here (§A2.8). They are never written
 * back to evenements.csv or programme.csv.
 */
import type { DayItem, EventTagsV2, Lieu } from './types';

/** Column order of data/tags_evenements.csv. */
export const EVENT_TAGS_V2_COLUMNS = [
  'event_id',
  'moods',
  'sortie',
  'energie',
  'exigence',
  'format_scene',
  'ideal_pour',
  'notoriete',
  'tag_confiance',
  'tag_preuve',
  'tag_version',
  'tagged_at',
  'tagged_by',
] as const;

export const BUDGET_BANDS = ['gratuit', 'lt15', '15_35', 'gt35', 'nc'] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number];

export const JAUGE_BANDS = ['petite', 'moyenne', 'grande'] as const;
export type JaugeBand = (typeof JAUGE_BANDS)[number];

/**
 * `type` → jauge. `salle_concert` is not listed: only rooms known to be
 * over 1 000 places are grande, via `JAUGE_LIEU_OVERRIDE`.
 */
const JAUGE_BY_TYPE: Readonly<Record<string, JaugeBand>> = {
  bar_scene: 'petite',
  bar: 'petite',
  salle_asso: 'petite',
  mjc: 'petite',
  cave: 'petite',
  theatre: 'moyenne',
  centre_culturel: 'moyenne',
  smac: 'moyenne',
  salle: 'moyenne',
  zenith: 'grande',
};

/**
 * Named rooms whose jauge is not the default for their `type`.
 * Ids are the stable `lieu_id` values in lieux.csv.
 */
const JAUGE_LIEU_OVERRIDE: Readonly<Record<string, JaugeBand>> = {
  /** Halle aux Grains — salle_concert, large hall. */
  L070: 'grande',
  /** Zénith Toulouse Métropole. */
  L079: 'grande',
  /** Casino Théâtre Barrière — type `theatre`, jauge grande. */
  L061: 'grande',
};

function pipeList(raw: string | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of (raw ?? '').split('|')) {
    const token = part.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function singleToken(raw: string | undefined): string | undefined {
  return pipeList(raw)[0];
}

function text(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim();
  return value || undefined;
}

/** One CSV row → tags. `event_id` is the map key, not a field. */
export function parseEventTagsV2(
  row: Record<string, string | undefined>,
): EventTagsV2 {
  const tags: EventTagsV2 = {};
  const moods = pipeList(row.moods);
  if (moods.length) tags.moods = moods;
  const sortie = pipeList(row.sortie);
  if (sortie.length) tags.sortie = sortie;
  const energie = singleToken(row.energie);
  if (energie) tags.energie = energie;
  const exigence = singleToken(row.exigence);
  if (exigence) tags.exigence = exigence;
  const format = pipeList(row.format_scene);
  if (format.length) tags.format_scene = format;
  const pour = pipeList(row.ideal_pour);
  if (pour.length) tags.ideal_pour = pour;
  const notoriete = singleToken(row.notoriete);
  if (notoriete) tags.notoriete = notoriete;
  const confiance = text(row.tag_confiance);
  if (confiance) tags.tag_confiance = confiance;
  const preuve = text(row.tag_preuve);
  if (preuve) tags.tag_preuve = preuve;
  const version = text(row.tag_version);
  if (version) tags.tag_version = version;
  const taggedAt = text(row.tagged_at);
  if (taggedAt) tags.tagged_at = taggedAt;
  const taggedBy = text(row.tagged_by);
  if (taggedBy) tags.tagged_by = taggedBy;
  return tags;
}

/**
 * Index rows by `event_id`. `null` / `undefined` (file missing) → empty map.
 * Empty `event_id` is skipped. The first row wins when an id repeats.
 */
export function indexEventTags(
  rows: readonly Record<string, string | undefined>[] | null | undefined,
): Map<string, EventTagsV2> {
  const map = new Map<string, EventTagsV2>();
  if (!rows) return map;
  for (const row of rows) {
    const eventId = (row.event_id ?? '').trim();
    if (!eventId || map.has(eventId)) continue;
    map.set(eventId, parseEventTagsV2(row));
  }
  return map;
}

/** Mutates events in place. No-op when the index is empty. Does not touch `moods`. */
export function attachEventTags<
  T extends { event_id?: string; tags_v2?: EventTagsV2 },
>(events: readonly T[], tagsByEventId: ReadonlyMap<string, EventTagsV2>): void {
  if (tagsByEventId.size === 0) return;
  for (const ev of events) {
    const id = (ev.event_id ?? '').trim();
    if (!id) continue;
    const tags = tagsByEventId.get(id);
    if (!tags) continue;
    ev.tags_v2 = tags;
  }
}

function copyTags(tags: EventTagsV2): EventTagsV2 {
  const out: EventTagsV2 = { ...tags };
  if (tags.moods) out.moods = [...tags.moods];
  if (tags.sortie) out.sortie = [...tags.sortie];
  if (tags.format_scene) out.format_scene = [...tags.format_scene];
  if (tags.ideal_pour) out.ideal_pour = [...tags.ideal_pour];
  return out;
}

/**
 * V2 tags for this card. A programme séance inherits its parent event's
 * row (joined on `event_id`). No parent, or no row → `{}`.
 * Does not fall back to v1 `moods`.
 */
export function eventTagsOf(item: DayItem): EventTagsV2 {
  const tags = item.evenement?.tags_v2;
  if (!tags) return {};
  return copyTags(tags);
}

/**
 * First euro amount in a price cell.
 * `gratuit` / `entrée libre` → 0 (before any number, so a suggested price
 * on a free door stays 0). Otherwise the first number; a comma decimal is
 * accepted. No number → `null` (budget `nc`).
 */
export function parsePriceEuros(raw: string | null | undefined): number | null {
  const textValue = (raw ?? '').trim();
  if (!textValue) return null;
  const norm = textValue.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (norm.includes('gratuit') || norm.includes('entree libre')) return 0;
  const match = norm.match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** 0 → gratuit, (0, 15) → lt15, [15, 35] → 15_35, > 35 → gt35, null → nc. */
export function budgetBandOfEuros(euros: number | null): BudgetBand {
  if (euros == null) return 'nc';
  if (!(euros > 0)) return 'gratuit';
  if (euros < 15) return 'lt15';
  if (euros <= 35) return '15_35';
  return 'gt35';
}

/**
 * Séance `prix_item` when it is set, otherwise the parent `gratuit` / `prix`.
 * `gratuit=oui` on the event wins over the event price text.
 */
export function budgetOf(item: DayItem): BudgetBand {
  if (item.kind === 'programme') {
    const itemPrix = (item.programme.prix_item ?? '').trim();
    if (itemPrix) return budgetBandOfEuros(parsePriceEuros(itemPrix));
  }
  const ev = item.evenement;
  if (!ev) return 'nc';
  if ((ev.gratuit ?? '').trim().toLowerCase() === 'oui') return 'gratuit';
  const prix = (ev.prix ?? '').trim();
  if (!prix) return 'nc';
  return budgetBandOfEuros(parsePriceEuros(prix));
}

export function jaugeOf(item: DayItem): JaugeBand | null {
  return jaugeOfLieu(item.lieu);
}

export function jaugeOfLieu(
  lieu: Pick<Lieu, 'lieu_id' | 'type'> | null | undefined,
): JaugeBand | null {
  if (!lieu) return null;
  const id = (lieu.lieu_id || '').trim();
  const override = id ? JAUGE_LIEU_OVERRIDE[id] : undefined;
  if (override) return override;
  const type = (lieu.type || '').trim().toLowerCase();
  return JAUGE_BY_TYPE[type] ?? null;
}

/**
 * Namespaced axis keys for a future profile bucket.
 * Moods stay in the mood bucket — they are not included.
 * `budget:nc` and an unknown jauge are omitted.
 */
export function axesTagsOf(item: DayItem): string[] {
  const tags = eventTagsOf(item);
  const out: string[] = [];
  for (const sortie of tags.sortie ?? []) out.push(`sortie:${sortie}`);
  if (tags.energie) out.push(`energie:${tags.energie}`);
  if (tags.exigence) out.push(`exigence:${tags.exigence}`);
  for (const format of tags.format_scene ?? []) out.push(`format:${format}`);
  for (const pour of tags.ideal_pour ?? []) out.push(`pour:${pour}`);
  if (tags.notoriete) out.push(`noto:${tags.notoriete}`);
  const budget = budgetOf(item);
  if (budget !== 'nc') out.push(`budget:${budget}`);
  const jauge = jaugeOf(item);
  if (jauge) out.push(`jauge:${jauge}`);
  return out;
}
