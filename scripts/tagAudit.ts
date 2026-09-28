/**
 * CultureConnect — audit des tags d'événements (dev-only, lecture seule).
 *
 * Une ligne = un `event_id`. Créneau théâtre = categorie mappée Théâtre & danse,
 * créneau concert = categorie mappée Musique (y compris `concert`). Une ligne
 * `autre` dont le `form` stocké est `theatre` (atelier, hub) reste dehors :
 * ce n'est pas le spectacle vivant du diagnostic. Pas de clé de repli :
 * `event_id` est stable d'un sync à l'autre.
 *
 * Aujourd'hui les ambiances v1 vivent dans `data/evenements.csv`. Si
 * `data/tags_evenements.csv` est absent, le rapport le dit et audite quand
 * même ces ambiances (baseline « avant »). Le script n'écrit jamais dans
 * `data/` — uniquement le markdown passé à `--out`.
 *
 * Usage :
 *   npm run tags:audit
 *   npm run tags:audit -- --out bench-results/2026-09-28-tags.md
 *   npm run tags:audit -- --compare bench-results/2026-09-28-tags.md
 *   npm run tags:audit -- --strict
 *
 * `--strict` : code de sortie non nul si un seuil est RATÉ. `n/a` (colonne
 * ou couche absente) ne fait pas échouer. Les erreurs bloquantes sont
 * listées ligne à ligne ; elles ne changent pas le code de sortie.
 *
 * Sans `--out`, le fichier va dans `bench-results/<date>-<HHMMSS>-tags.md`
 * pour ne pas écraser une baseline commitée.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { mainFromCategorie } from '../src/lib/categories';
import { TASTE_MOODS, isTasteMood } from '../src/lib/phraseTags';

export const TAGS_V2_FILE = 'tags_evenements.csv';
export const GOLD_FILE = path.join('scripts', 'fixtures', 'tag-gold.json');

/** Same tripwire as `inverseMoodWeights` in src/lib/reco.ts. */
export const IDF_RULE =
  'log(N/n) sur le créneau (log népérien) ; 0 si N ≥ 6 et part ≥ 75 % ; sinon plancher 0,25 (0,15 si part ≥ 75 % et N < 6)';

export const THRESHOLDS = {
  moodShareMax: 0.35,
  multiMoodMin: 0.9,
  longTextTaggedMin: 0.9,
  longTextChars: 80,
  moodBreadthMin: 12,
  moodBreadthUses: 10,
  sortieMin: 0.1,
  sortieMax: 0.45,
  energieLevelsMin: 3,
  energieLevelShareMin: 0.1,
  lowConfidenceMax: 0.2,
  goldPrincipalMood: 0.7,
  goldJaccard: 0.5,
  goldPrincipalSortie: 0.7,
  goldEnergie: 0.85,
} as const;

export const SORTIE_VALUES = ['interessante', 'agreable', 'partage', 'evasion'] as const;
export const ENERGIE_VALUES = ['1', '2', '3', '4', '5'] as const;
export const EXIGENCE_VALUES = ['1', '2', '3'] as const;
export const FORMAT_VALUES = [
  'seul_en_scene',
  'duo',
  'troupe',
  'orchestre',
  'groupe',
  'dj',
  'scene_ouverte',
  'participatif',
  'sans_paroles',
  'lecture',
  'jeune_public',
] as const;
export const IDEAL_POUR_VALUES = ['solo', 'couple', 'amis', 'famille'] as const;
export const NOTORIETE_VALUES = ['tete_affiche', 'confirme', 'emergent', 'scene_ouverte'] as const;
export const CONFIANCE_VALUES = ['haute', 'moyenne', 'basse'] as const;

export const AXIS_FIELDS = [
  'sortie',
  'energie',
  'exigence',
  'format_scene',
  'ideal_pour',
  'notoriete',
] as const;

const AXIS_VOCAB: Record<(typeof AXIS_FIELDS)[number], readonly string[]> = {
  sortie: SORTIE_VALUES,
  energie: ENERGIE_VALUES,
  exigence: EXIGENCE_VALUES,
  format_scene: FORMAT_VALUES,
  ideal_pour: IDEAL_POUR_VALUES,
  notoriete: NOTORIETE_VALUES,
};

const AXIS_BOUNDS: Record<(typeof AXIS_FIELDS)[number], { min: number; max: number }> = {
  sortie: { min: 1, max: 2 },
  energie: { min: 1, max: 1 },
  exigence: { min: 1, max: 1 },
  format_scene: { min: 1, max: 2 },
  ideal_pour: { min: 1, max: 3 },
  notoriete: { min: 1, max: 1 },
};

const HUMOR_CUE =
  /humou?r|rire|drole|comedie|hilar|stand|sketch|burlesque|clown|cabaret|impro|comique/i;

const DATE_TITLE =
  /^(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?\d{1,2}\s+(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{4}(?:\s*-\s*\d{1,2}\s*h(?:\s*\d{2})?)?$/;

const ISO_DATE_TITLE = /^\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2})?$/;

export type AuditSlot = 'theatre' | 'concert';

export type AuditEvent = {
  event_id: string;
  lieu_id: string;
  titre: string;
  categorie: string;
  date_debut: string;
  form?: string;
  description_courte?: string;
  description_longue?: string;
  citation?: string;
  casting?: string;
  genre?: string;
  moods?: string;
  mood_source?: string;
  mood_confiance?: string;
};

export type AuditTagsV2 = {
  event_id: string;
  moods?: string;
  sortie?: string;
  energie?: string;
  exigence?: string;
  format_scene?: string;
  ideal_pour?: string;
  notoriete?: string;
  tag_confiance?: string;
  tag_preuve?: string;
  tag_version?: string;
};

export type GoldTags = {
  event_id: string;
  moods: string[];
  sortie?: string[];
  energie?: number;
};

export type BlockingKind =
  | 'hors_enum'
  | 'hors_bornes'
  | 'rigolo_seul'
  | 'festif_seul_concert'
  | 'rigolo_principal_sans_humour'
  | 'preuve_introuvable'
  | 'doublon'
  | 'titre_date'
  | 'v1_v2_incoherent';

export const BLOCKING_KINDS: readonly BlockingKind[] = [
  'hors_enum',
  'hors_bornes',
  'rigolo_seul',
  'festif_seul_concert',
  'rigolo_principal_sans_humour',
  'preuve_introuvable',
  'doublon',
  'titre_date',
  'v1_v2_incoherent',
];

export type BlockingError = {
  kind: BlockingKind;
  eventId: string;
  slot: AuditSlot;
  title: string;
  detail: string;
  otherEventId?: string;
};

export type Anomaly = {
  kind: 'separateur_virgule';
  eventId: string;
  slot: AuditSlot;
  title: string;
  detail: string;
};

export type ThresholdStatus = 'ok' | 'fail' | 'na';

export type ThresholdRow = {
  id: string;
  label: string;
  target: string;
  measure: string;
  status: ThresholdStatus;
};

export type DistCount = {
  value: string;
  count: number;
  share: number;
};

export type MoodStat = {
  mood: string;
  count: number;
  shareSlot: number;
  shareTagged: number | null;
  idf: number | null;
  overCeiling: boolean;
};

export type AxisReport = {
  field: (typeof AXIS_FIELDS)[number];
  columnPresent: boolean;
  filled: number;
  /** Official vocab first (including zeros), then unexpected values that appear. */
  rows: Array<DistCount & { shareSlot: number; official: boolean }>;
};

export type SlotReport = {
  id: AuditSlot;
  rows: number;
  tagged: number;
  taggedRate: number | null;
  meanMoods: number | null;
  multiMood: number;
  multiMoodRate: number | null;
  taggedV2: number;
  multiMoodV2: number;
  longText: number;
  longTextTagged: number;
  fromV1: number;
  fromV2: number;
  rawTokens: { empty: number; one: number; multi: number };
  moods: MoodStat[];
  moodConfiance: DistCount[];
  tagConfiance: {
    columnPresent: boolean;
    filled: number;
    basse: number;
    rows: DistCount[];
  };
  axes: AxisReport[];
  moodSource: DistCount[];
};

export type TagAuditReport = {
  meta: {
    generatedAt: string;
    baseline: 'v1' | 'v2' | 'mixte';
    v2File: 'absent' | 'present';
    v2Rows: number;
    v2DuplicateIds: string[];
    evenementsSha256: string | null;
    key: 'event_id';
    idfRule: string;
    skippedEmptyId: number;
  };
  slots: SlotReport[];
  vivant: {
    rows: number;
    longText: number;
    longTextTagged: number;
    longTextRate: number | null;
    taggedV2: number;
    multiMoodV2: number;
    moodUses: { mood: string; count: number; atLeast10: boolean }[];
    moodsAtLeast10: number;
    tagConfianceFilled: number;
    tagConfianceBasse: number;
  };
  thresholds: ThresholdRow[];
  errors: BlockingError[];
  anomalies: Anomaly[];
  gold: {
    filePresent: boolean;
    compared: number;
    missing: number;
    principalMood: number | null;
    meanJaccard: number | null;
    principalSortie: number | null;
    energieWithin1: number | null;
  };
};

export type TagAuditSnapshot = {
  version: 1;
  generatedAt: string;
  baseline: TagAuditReport['meta']['baseline'];
  v2File: 'absent' | 'present';
  slots: Record<AuditSlot, { rows: number; tagged: number; taggedRate: number | null; meanMoods: number | null }>;
  longText: { rows: number; tagged: number; rate: number | null };
  moodsAtLeast10: number;
  thresholds: { id: string; status: ThresholdStatus }[];
  blockingErrors: number;
  errorCounts: Partial<Record<BlockingKind, number>>;
};

export type AuditInput = {
  events: AuditEvent[];
  v2: { present: boolean; headers: string[]; rows: AuditTagsV2[] };
  gold?: GoldTags[] | null;
  generatedAt?: string;
  evenementsSha256?: string | null;
};

export function foldText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’ʼ]/g, "'")
    .toLowerCase();
}

export function squash(raw: string): string {
  return foldText(raw).replace(/\s+/g, ' ').trim();
}

/** Split on `|` or `,`, trim, lowercase, drop empties, keep first occurrence. */
export function parseTagList(raw: string | readonly string[] | undefined | null): string[] {
  if (!raw) return [];
  const parts = typeof raw === 'string' ? raw.split(/[|,]/) : raw;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const slug = part.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function usefulDescription(ev: Pick<AuditEvent, 'description_longue' | 'description_courte'>): string {
  const longue = (ev.description_longue || '').trim();
  if (longue) return longue;
  return (ev.description_courte || '').trim();
}

export function sourceTextOf(
  ev: Pick<AuditEvent, 'titre' | 'description_longue' | 'description_courte' | 'citation' | 'casting'>,
): string {
  return [ev.titre, ev.description_longue, ev.description_courte, ev.citation, ev.casting]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join('\n');
}

/** Brief §A6 regex, applied to accent-folded text so « drôle » / « comédie » match. */
export function hasHumorCue(text: string): boolean {
  return HUMOR_CUE.test(foldText(text));
}

export function isDateOnlyTitle(title: string): boolean {
  const t = squash(title);
  return DATE_TITLE.test(t) || ISO_DATE_TITLE.test(t);
}

export function normalizeTitle(title: string): string {
  return foldText(title)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same lieu + date, and one normalised title is a word-boundary prefix of the other. */
export function titlesSharePrefix(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (!long.startsWith(short)) return false;
  return long.charAt(short.length) === ' ';
}

export function textContainsProof(preuve: string, source: string): boolean {
  const needle = squash(preuve);
  if (!needle) return false;
  return squash(source).includes(needle);
}

/**
 * IDF of one mood in a slot, copied from `inverseMoodWeights`.
 * `n` is the slot size (tagged and untagged). `count` is rows carrying the mood.
 */
export function moodIdf(n: number, count: number): number | null {
  if (n <= 0 || count <= 0) return null;
  const share = count / n;
  const raw = Math.log(n / count);
  if (n >= 6 && share >= 0.75) return 0;
  return Math.max(raw, share >= 0.75 ? 0.15 : 0.25);
}

export function slotOf(ev: Pick<AuditEvent, 'categorie' | 'form'>): AuditSlot | null {
  const main = mainFromCategorie(ev.categorie || '');
  if (main === 'theatre_danse') return 'theatre';
  if (main === 'musique') return 'concert';
  return null;
}

export function eventDay(ev: Pick<AuditEvent, 'date_debut'>): string {
  const d = (ev.date_debut || '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
  return m ? m[1] : d;
}

function tasteOf(tokens: readonly string[]): string[] {
  return tokens.filter((t) => isTasteMood(t));
}

function rate(n: number, d: number): number | null {
  if (d <= 0) return null;
  return n / d;
}

function columnPresent(headers: readonly string[], name: string): boolean {
  return headers.some((h) => h.trim().toLowerCase() === name);
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function scoreGold(pairs: Array<{ gold: GoldTags; got: GoldTags }>): TagAuditReport['gold'] {
  if (pairs.length === 0) {
    return {
      filePresent: true,
      compared: 0,
      missing: 0,
      principalMood: null,
      meanJaccard: null,
      principalSortie: null,
      energieWithin1: null,
    };
  }
  let moodHits = 0;
  let jaccardSum = 0;
  let sortieHits = 0;
  let sortieN = 0;
  let energieHits = 0;
  let energieN = 0;
  for (const { gold, got } of pairs) {
    const gMoods = parseTagList(gold.moods);
    const pMoods = parseTagList(got.moods);
    if (gMoods[0] && gMoods[0] === pMoods[0]) moodHits += 1;
    jaccardSum += jaccard(gMoods, pMoods);
    const gSortie = gold.sortie ? parseTagList(gold.sortie) : [];
    if (gSortie.length > 0) {
      sortieN += 1;
      const pSortie = got.sortie ? parseTagList(got.sortie) : [];
      if (gSortie[0] && gSortie[0] === pSortie[0]) sortieHits += 1;
    }
    if (typeof gold.energie === 'number' && Number.isFinite(gold.energie)) {
      energieN += 1;
      if (typeof got.energie === 'number' && Math.abs(got.energie - gold.energie) <= 1) {
        energieHits += 1;
      }
    }
  }
  return {
    filePresent: true,
    compared: pairs.length,
    missing: 0,
    principalMood: moodHits / pairs.length,
    meanJaccard: jaccardSum / pairs.length,
    principalSortie: sortieN > 0 ? sortieHits / sortieN : null,
    energieWithin1: energieN > 0 ? energieHits / energieN : null,
  };
}

type Prepared = {
  ev: AuditEvent;
  slot: AuditSlot;
  v2: AuditTagsV2 | null;
  /** Mood tokens actually audited (v2 moods if present, else v1). */
  tokens: string[];
  taste: string[];
  layer: 'v1' | 'v2';
};

function activeMoods(ev: AuditEvent, v2: AuditTagsV2 | null): { tokens: string[]; layer: 'v1' | 'v2' } {
  if (v2) {
    const tokens = parseTagList(v2.moods);
    if (tokens.length > 0) return { tokens, layer: 'v2' };
  }
  return { tokens: parseTagList(ev.moods), layer: 'v1' };
}

function pushError(
  errors: BlockingError[],
  kind: BlockingKind,
  row: Prepared,
  detail: string,
  otherEventId?: string,
): void {
  errors.push({
    kind,
    eventId: row.ev.event_id,
    slot: row.slot,
    title: row.ev.titre,
    detail,
    otherEventId,
  });
}

function checkClosedList(
  errors: BlockingError[],
  row: Prepared,
  field: string,
  raw: string | undefined,
  allowed: readonly string[],
  min: number,
  max: number,
): void {
  const rawStr = raw ?? '';
  if (!rawStr.trim()) return;
  if (rawStr.includes(',')) {
    pushError(errors, 'hors_bornes', row, `${field} : séparateur virgule (attendu |)`);
  }
  const tokens = parseTagList(rawStr);
  const bad = tokens.filter((t) => !allowed.includes(t));
  if (bad.length > 0) {
    pushError(errors, 'hors_enum', row, `${field} : ${bad.join(', ')}`);
  }
  const good = tokens.filter((t) => allowed.includes(t));
  if (good.length > 0 && (good.length < min || good.length > max)) {
    const span = min === max ? `${min}` : `${min}–${max}`;
    pushError(errors, 'hors_bornes', row, `${field} : ${good.length} valeur(s) (attendu ${span})`);
  }
}

function collectDuplicates(rows: Prepared[]): BlockingError[] {
  const groups = new Map<string, Prepared[]>();
  for (const row of rows) {
    const lieu = (row.ev.lieu_id || '').trim();
    const day = eventDay(row.ev);
    if (!lieu || !day) continue;
    const key = `${lieu}\t${day}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const out: BlockingError[] = [];
  const seen = new Set<string>();
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        if (!titlesSharePrefix(a.ev.titre, b.ev.titre)) continue;
        const [left, right] = a.ev.event_id < b.ev.event_id ? [a, b] : [b, a];
        const pair = `${left.ev.event_id}\t${right.ev.event_id}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        out.push({
          kind: 'doublon',
          eventId: left.ev.event_id,
          otherEventId: right.ev.event_id,
          slot: left.slot,
          title: left.ev.titre,
          detail: `même lieu ${left.ev.lieu_id.trim()}, ${eventDay(left.ev)} — « ${oneLine(left.ev.titre)} » / « ${oneLine(right.ev.titre)} » (${right.ev.event_id})`,
        });
      }
    }
  }
  return out;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function distFromMap(map: Map<string, number>, denom: number, order?: readonly string[]): DistCount[] {
  const keys = new Set<string>([...(order ?? []), ...map.keys()]);
  const rows: DistCount[] = [];
  for (const value of keys) {
    const count = map.get(value) ?? 0;
    if (!order && count === 0) continue;
    rows.push({ value, count, share: denom > 0 ? count / denom : 0 });
  }
  if (!order) {
    rows.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return rows;
}

function buildAxis(
  field: (typeof AXIS_FIELDS)[number],
  present: boolean,
  rows: Prepared[],
): AxisReport {
  const vocab = AXIS_VOCAB[field];
  const counts = new Map<string, number>();
  let filled = 0;
  if (present) {
    for (const row of rows) {
      const tokens = parseTagList(row.v2?.[field]);
      const good = tokens.filter((t) => vocab.includes(t));
      if (good.length === 0) continue;
      filled += 1;
      for (const token of good) bump(counts, token);
      for (const token of tokens) {
        if (!vocab.includes(token)) bump(counts, token);
      }
    }
  }
  const official = vocab.map((value) => {
    const count = counts.get(value) ?? 0;
    return {
      value,
      count,
      share: filled > 0 ? count / filled : 0,
      shareSlot: rows.length > 0 ? count / rows.length : 0,
      official: true,
    };
  });
  const extras = [...counts.keys()]
    .filter((value) => !vocab.includes(value))
    .sort()
    .map((value) => {
      const count = counts.get(value) ?? 0;
      return {
        value,
        count,
        share: filled > 0 ? count / filled : 0,
        shareSlot: rows.length > 0 ? count / rows.length : 0,
        official: false,
      };
    });
  return { field, columnPresent: present, filled, rows: [...official, ...extras] };
}

function slotLabel(slot: AuditSlot): string {
  return slot === 'theatre' ? 'théâtre' : 'concert';
}

function oneLine(title: string): string {
  return title.replace(/`/g, "'").replace(/\s+/g, ' ').trim();
}

function buildSlot(
  id: AuditSlot,
  rows: Prepared[],
  v2Headers: readonly string[],
  v2Present: boolean,
): SlotReport {
  const n = rows.length;
  let tagged = 0;
  let moodSum = 0;
  let multiMood = 0;
  let taggedV2 = 0;
  let multiMoodV2 = 0;
  let longText = 0;
  let longTextTagged = 0;
  let fromV1 = 0;
  let fromV2 = 0;
  const raw = { empty: 0, one: 0, multi: 0 };
  const moodCounts = new Map<string, number>();
  const confCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const tagConfCounts = new Map<string, number>();
  let tagConfFilled = 0;
  let tagConfBasse = 0;
  const tagConfColumn = v2Present && columnPresent(v2Headers, 'tag_confiance');

  for (const row of rows) {
    const taste = row.taste;
    if (row.layer === 'v2') fromV2 += 1;
    else fromV1 += 1;
    const v1Tokens = parseTagList(row.ev.moods);
    if (v1Tokens.length === 0) raw.empty += 1;
    else if (v1Tokens.length === 1) raw.one += 1;
    else raw.multi += 1;

    if (taste.length > 0) {
      tagged += 1;
      moodSum += taste.length;
      if (taste.length >= 2) multiMood += 1;
      for (const mood of taste) bump(moodCounts, mood);
    }
    if (row.layer === 'v2' && taste.length > 0) {
      taggedV2 += 1;
      if (taste.length >= 2) multiMoodV2 += 1;
    }
    if (usefulDescription(row.ev).length >= THRESHOLDS.longTextChars) {
      longText += 1;
      if (taste.length > 0) longTextTagged += 1;
    }
    const conf = (row.ev.mood_confiance || '').trim().toLowerCase() || '(vide)';
    bump(confCounts, conf);
    const source = (row.ev.mood_source || '').trim().toLowerCase() || '(vide)';
    bump(sourceCounts, source);
    if (tagConfColumn) {
      const tagConf = (row.v2?.tag_confiance || '').trim().toLowerCase();
      if (tagConf) {
        tagConfFilled += 1;
        bump(tagConfCounts, tagConf);
        if (tagConf === 'basse') tagConfBasse += 1;
      }
    }
  }

  const moods: MoodStat[] = TASTE_MOODS.map((mood) => {
    const count = moodCounts.get(mood) ?? 0;
    const shareSlot = n > 0 ? count / n : 0;
    return {
      mood,
      count,
      shareSlot,
      shareTagged: rate(count, tagged),
      idf: moodIdf(n, count),
      overCeiling: shareSlot > THRESHOLDS.moodShareMax,
    };
  }).sort((a, b) => b.count - a.count || a.mood.localeCompare(b.mood));

  const confOrder = ['haute', 'moyenne', 'basse', '(vide)'];
  const moodConfiance = distFromMap(confCounts, n, [
    ...confOrder,
    ...[...confCounts.keys()].filter((k) => !confOrder.includes(k)).sort(),
  ]);
  const moodSource = distFromMap(sourceCounts, n);

  const axes = AXIS_FIELDS.map((field) =>
    buildAxis(field, v2Present && columnPresent(v2Headers, field), rows),
  );

  return {
    id,
    rows: n,
    tagged,
    taggedRate: rate(tagged, n),
    meanMoods: rate(moodSum, tagged),
    multiMood,
    multiMoodRate: rate(multiMood, tagged),
    taggedV2,
    multiMoodV2,
    longText,
    longTextTagged,
    fromV1,
    fromV2,
    rawTokens: raw,
    moods,
    moodConfiance,
    tagConfiance: {
      columnPresent: tagConfColumn,
      filled: tagConfFilled,
      basse: tagConfBasse,
      rows: distFromMap(tagConfCounts, tagConfFilled, [...CONFIANCE_VALUES]),
    },
    axes,
    moodSource,
  };
}

function axisOf(slot: SlotReport, field: (typeof AXIS_FIELDS)[number]): AxisReport {
  const found = slot.axes.find((axis) => axis.field === field);
  if (!found) throw new Error(`axe manquant : ${field}`);
  return found;
}

function bandFailures(slot: SlotReport): string[] {
  const axis = axisOf(slot, 'sortie');
  if (!axis.columnPresent || axis.filled === 0) {
    return [`${slotLabel(slot.id)} : ${axis.columnPresent ? 'vide' : 'colonne absente'}`];
  }
  const bad = axis.rows
    .filter((row) => row.official)
    .filter((row) => row.share < THRESHOLDS.sortieMin || row.share > THRESHOLDS.sortieMax)
    .map((row) => `${row.value} ${pct(row.share)}`);
  if (bad.length === 0) return [];
  return [`${slotLabel(slot.id)} : ${bad.join(', ')}`];
}

function energieLevelCount(slot: SlotReport): { filled: number; levels: number; columnPresent: boolean } {
  const axis = axisOf(slot, 'energie');
  const levels = axis.rows.filter(
    (row) => row.official && row.share >= THRESHOLDS.energieLevelShareMin,
  ).length;
  return { filled: axis.filled, levels, columnPresent: axis.columnPresent };
}

function buildThresholds(slots: SlotReport[], vivant: TagAuditReport['vivant'], gold: TagAuditReport['gold']): ThresholdRow[] {
  const ceiling: string[] = [];
  for (const slot of slots) {
    for (const mood of slot.moods) {
      if (mood.overCeiling) {
        ceiling.push(
          `${slotLabel(slot.id)} : ${mood.mood} ${pct(mood.shareSlot)} (${mood.count}/${slot.rows})`,
        );
      }
    }
  }

  const graded = slots.filter((slot) => slot.rows > 0);
  const sortieColumn = slots.some((slot) => axisOf(slot, 'sortie').columnPresent);
  const anySortie = slots.some((slot) => axisOf(slot, 'sortie').filled > 0);
  let sortieStatus: ThresholdStatus = 'na';
  let sortieMeasure = 'n/a (colonne absente)';
  if (sortieColumn && !anySortie) {
    sortieMeasure = 'n/a (aucune valeur)';
  } else if (sortieColumn && anySortie) {
    const parts = graded.flatMap((slot) => bandFailures(slot));
    const failing = parts.filter((part) => !part.endsWith('vide') && !part.endsWith('colonne absente'));
    const empty = parts.filter((part) => part.endsWith('vide'));
    if (failing.length === 0 && empty.length === 0) {
      sortieStatus = 'ok';
      sortieMeasure = 'chaque valeur entre 10 % et 45 %';
    } else {
      sortieStatus = 'fail';
      sortieMeasure = [...failing, ...empty].join(' ; ');
    }
  }

  const energieColumn = slots.some((slot) => axisOf(slot, 'energie').columnPresent);
  const anyEnergie = slots.some((slot) => axisOf(slot, 'energie').filled > 0);
  let energieStatus: ThresholdStatus = 'na';
  let energieMeasure = 'n/a (colonne absente)';
  if (energieColumn && !anyEnergie) {
    energieMeasure = 'n/a (aucune valeur)';
  } else if (energieColumn && anyEnergie) {
    const bits = graded.map((slot) => {
      const info = energieLevelCount(slot);
      return `${slotLabel(slot.id)} : ${info.levels} niveau(x) ≥ 10 % (${info.filled} remplis)`;
    });
    const ok = graded.every((slot) => energieLevelCount(slot).levels >= THRESHOLDS.energieLevelsMin);
    energieStatus = ok ? 'ok' : 'fail';
    energieMeasure = bits.join(' ; ');
  }

  const confColumn = slots.some((slot) => slot.tagConfiance.columnPresent);
  let confStatus: ThresholdStatus = 'na';
  let confMeasure = 'n/a (pas de tag_confiance v2)';
  if (confColumn && vivant.tagConfianceFilled === 0) {
    confMeasure = 'n/a (aucune valeur)';
  } else if (confColumn && vivant.tagConfianceFilled > 0) {
    const share = vivant.tagConfianceBasse / vivant.tagConfianceFilled;
    confStatus = share <= THRESHOLDS.lowConfidenceMax ? 'ok' : 'fail';
    confMeasure = `${pct(share)} (${vivant.tagConfianceBasse}/${vivant.tagConfianceFilled})`;
  }

  const multiStatus: ThresholdStatus = vivant.taggedV2 === 0 ? 'na' : vivant.multiMoodV2 / vivant.taggedV2 >= THRESHOLDS.multiMoodMin ? 'ok' : 'fail';
  const multiMeasure =
    vivant.taggedV2 === 0
      ? 'n/a (pas de lignes taguées v2)'
      : `${pct(vivant.multiMoodV2 / vivant.taggedV2)} (${vivant.multiMoodV2}/${vivant.taggedV2})`;

  const longStatus: ThresholdStatus =
    vivant.longText === 0
      ? 'na'
      : (vivant.longTextRate ?? 0) >= THRESHOLDS.longTextTaggedMin
        ? 'ok'
        : 'fail';
  const longMeasure =
    vivant.longText === 0
      ? 'n/a'
      : `${pct(vivant.longTextRate)} (${vivant.longTextTagged}/${vivant.longText})`;

  const breadthStatus: ThresholdStatus =
    vivant.moodsAtLeast10 >= THRESHOLDS.moodBreadthMin ? 'ok' : 'fail';

  return [
    {
      id: 'mood_share',
      label: "Aucune ambiance > 35 % d'un créneau",
      target: 'obligatoire',
      measure: ceiling.length > 0 ? ceiling.join(' ; ') : 'aucune',
      status: ceiling.length > 0 ? 'fail' : 'ok',
    },
    {
      id: 'multi_mood_v2',
      label: '≥ 2 ambiances',
      target: '≥ 90 % des lignes taguées v2',
      measure: multiMeasure,
      status: multiStatus,
    },
    {
      id: 'long_text',
      label: 'Lignes taguées parmi celles à ≥ 80 caractères de texte',
      target: '≥ 90 %',
      measure: longMeasure,
      status: longStatus,
    },
    {
      id: 'mood_breadth',
      label: 'Ambiances utilisées ≥ 10 fois dans le vivant',
      target: '≥ 12 / 16',
      measure: `${vivant.moodsAtLeast10} / 16`,
      status: breadthStatus,
    },
    {
      id: 'sortie_balance',
      label: 'Chaque valeur de sortie',
      target: 'entre 10 % et 45 % (par créneau, dès qu’une valeur existe)',
      measure: sortieMeasure,
      status: sortieStatus,
    },
    {
      id: 'energie_spread',
      label: 'energie',
      target: '≥ 3 niveaux à ≥ 10 % par créneau (dès qu’une valeur existe)',
      measure: energieMeasure,
      status: energieStatus,
    },
    {
      id: 'tag_confiance_basse',
      label: 'tag_confiance = basse',
      target: '≤ 20 %',
      measure: confMeasure,
      status: confStatus,
    },
    ...goldThresholds(gold),
  ];
}

function goldThresholds(gold: TagAuditReport['gold']): ThresholdRow[] {
  const row = (
    id: string,
    label: string,
    target: string,
    value: number | null,
    min: number,
  ): ThresholdRow => {
    if (!gold.filePresent || gold.compared === 0 || value == null) {
      return {
        id,
        label,
        target,
        measure: gold.filePresent ? 'n/a (pas de paires comparables)' : 'n/a (fichier absent)',
        status: 'na',
      };
    }
    return {
      id,
      label,
      target,
      measure: `${pct(value)} (${gold.compared} spectacles)`,
      status: value >= min ? 'ok' : 'fail',
    };
  };
  return [
    row('gold_principal_mood', 'Gold : ambiance principale identique', '≥ 70 %', gold.principalMood, THRESHOLDS.goldPrincipalMood),
    row('gold_jaccard', 'Gold : Jaccard moyen des ambiances', '≥ 0,50', gold.meanJaccard, THRESHOLDS.goldJaccard),
    row(
      'gold_principal_sortie',
      'Gold : sortie principale identique',
      '≥ 70 %',
      gold.principalSortie,
      THRESHOLDS.goldPrincipalSortie,
    ),
    row('gold_energie', 'Gold : energie à ±1', '≥ 85 %', gold.energieWithin1, THRESHOLDS.goldEnergie),
  ];
}

export function auditTags(input: AuditInput): TagAuditReport {
  const headers = input.v2.present ? input.v2.headers : [];
  const byId = new Map<string, AuditTagsV2>();
  const v2DuplicateIds: string[] = [];
  if (input.v2.present) {
    for (const row of input.v2.rows) {
      const id = (row.event_id || '').trim();
      if (!id) continue;
      if (byId.has(id)) v2DuplicateIds.push(id);
      else byId.set(id, row);
    }
  }

  let skippedEmptyId = 0;
  const prepared: Prepared[] = [];
  for (const ev of input.events) {
    const eventId = (ev.event_id || '').trim();
    if (!eventId) {
      skippedEmptyId += 1;
      continue;
    }
    const slot = slotOf(ev);
    if (!slot) continue;
    const v2 = byId.get(eventId) ?? null;
    const active = activeMoods(ev, v2);
    prepared.push({
      ev: { ...ev, event_id: eventId },
      slot,
      v2,
      tokens: active.tokens,
      taste: tasteOf(active.tokens),
      layer: active.layer,
    });
  }

  const errors: BlockingError[] = [];
  const anomalies: Anomaly[] = [];
  for (const row of prepared) {
    const v1Raw = row.ev.moods ?? '';
    if (v1Raw.includes(',')) {
      anomalies.push({
        kind: 'separateur_virgule',
        eventId: row.ev.event_id,
        slot: row.slot,
        title: row.ev.titre,
        detail: v1Raw.trim(),
      });
    }
    if (isDateOnlyTitle(row.ev.titre)) {
      pushError(errors, 'titre_date', row, 'le titre ne contient qu’une date');
    }
    if (row.layer === 'v2' && row.v2) {
      checkClosedList(errors, row, 'moods', row.v2.moods, TASTE_MOODS, 2, 3);
      for (const field of AXIS_FIELDS) {
        const bounds = AXIS_BOUNDS[field];
        checkClosedList(errors, row, field, row.v2[field], AXIS_VOCAB[field], bounds.min, bounds.max);
      }
      checkClosedList(errors, row, 'tag_confiance', row.v2.tag_confiance, CONFIANCE_VALUES, 1, 1);
      const version = (row.v2.tag_version || '').trim().toLowerCase();
      if (version && version !== 'v2') {
        pushError(errors, 'hors_enum', row, `tag_version : ${version}`);
      }
      const preuve = (row.v2.tag_preuve || '').trim();
      const confiance = (row.v2.tag_confiance || '').trim().toLowerCase();
      const source = sourceTextOf(row.ev);
      if (confiance === 'haute' && !preuve) {
        pushError(errors, 'preuve_introuvable', row, 'confiance haute sans preuve');
      } else if (preuve && !textContainsProof(preuve, source)) {
        pushError(errors, 'preuve_introuvable', row, 'preuve absente du texte source');
      }
      const v1Taste = tasteOf(parseTagList(row.ev.moods));
      if (v1Taste.length > 0 && row.taste.length > 0 && !v1Taste.some((m) => row.taste.includes(m))) {
        pushError(
          errors,
          'v1_v2_incoherent',
          row,
          `v1 ${v1Taste.join('|')} ; v2 ${row.taste.join('|')} ; aucun goût en commun`,
        );
      }
    } else {
      const bad = row.tokens.filter((token) => !isTasteMood(token));
      if (bad.length > 0) {
        pushError(errors, 'hors_enum', row, `moods : ${bad.join(', ')}`);
      }
    }
    if (row.taste.length === 1 && row.taste[0] === 'rigolo') {
      pushError(errors, 'rigolo_seul', row, 'rigolo');
    }
    if (row.slot === 'concert' && row.taste.length === 1 && row.taste[0] === 'festif') {
      pushError(errors, 'festif_seul_concert', row, 'festif');
    }
    if (row.tokens[0] === 'rigolo' && !hasHumorCue(sourceTextOf(row.ev))) {
      pushError(errors, 'rigolo_principal_sans_humour', row, 'pas d’indice humour / rire / comédie dans le texte');
    }
  }
  errors.push(...collectDuplicates(prepared));
  errors.sort((a, b) => {
    const kind = BLOCKING_KINDS.indexOf(a.kind) - BLOCKING_KINDS.indexOf(b.kind);
    if (kind !== 0) return kind;
    if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1;
    return (a.otherEventId || '').localeCompare(b.otherEventId || '');
  });
  anomalies.sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));

  const slots = (['theatre', 'concert'] as const).map((id) =>
    buildSlot(
      id,
      prepared.filter((row) => row.slot === id),
      headers,
      input.v2.present,
    ),
  );

  const moodUses = TASTE_MOODS.map((mood) => {
    const count = slots.reduce((sum, slot) => sum + (slot.moods.find((m) => m.mood === mood)?.count ?? 0), 0);
    return { mood, count, atLeast10: count >= THRESHOLDS.moodBreadthUses };
  }).sort((a, b) => b.count - a.count || a.mood.localeCompare(b.mood));

  const longText = slots.reduce((sum, slot) => sum + slot.longText, 0);
  const longTextTagged = slots.reduce((sum, slot) => sum + slot.longTextTagged, 0);
  const vivant: TagAuditReport['vivant'] = {
    rows: slots.reduce((sum, slot) => sum + slot.rows, 0),
    longText,
    longTextTagged,
    longTextRate: rate(longTextTagged, longText),
    taggedV2: slots.reduce((sum, slot) => sum + slot.taggedV2, 0),
    multiMoodV2: slots.reduce((sum, slot) => sum + slot.multiMoodV2, 0),
    moodUses,
    moodsAtLeast10: moodUses.filter((mood) => mood.atLeast10).length,
    tagConfianceFilled: slots.reduce((sum, slot) => sum + slot.tagConfiance.filled, 0),
    tagConfianceBasse: slots.reduce((sum, slot) => sum + slot.tagConfiance.basse, 0),
  };

  const gold = scoreAgainstGold(prepared, input.gold);
  const fromV2 = prepared.filter((row) => row.layer === 'v2').length;
  const fromV1Tagged = prepared.filter((row) => row.layer === 'v1' && row.taste.length > 0).length;
  const baseline: TagAuditReport['meta']['baseline'] =
    fromV2 === 0 ? 'v1' : fromV1Tagged === 0 ? 'v2' : 'mixte';

  return {
    meta: {
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      baseline,
      v2File: input.v2.present ? 'present' : 'absent',
      v2Rows: input.v2.present ? byId.size : 0,
      v2DuplicateIds,
      evenementsSha256: input.evenementsSha256 ?? null,
      key: 'event_id',
      idfRule: IDF_RULE,
      skippedEmptyId,
    },
    slots,
    vivant,
    thresholds: buildThresholds(slots, vivant, gold),
    errors,
    anomalies,
    gold,
  };
}

function scoreAgainstGold(rows: Prepared[], gold: GoldTags[] | null | undefined): TagAuditReport['gold'] {
  if (!gold || gold.length === 0) {
    return {
      filePresent: false,
      compared: 0,
      missing: 0,
      principalMood: null,
      meanJaccard: null,
      principalSortie: null,
      energieWithin1: null,
    };
  }
  const byId = new Map(rows.map((row) => [row.ev.event_id, row]));
  const pairs: Array<{ gold: GoldTags; got: GoldTags }> = [];
  let missing = 0;
  for (const entry of gold) {
    const row = byId.get(entry.event_id);
    if (!row) {
      missing += 1;
      continue;
    }
    const energieRaw = row.v2?.energie?.trim();
    const energie = energieRaw && /^\d+$/.test(energieRaw) ? Number(energieRaw) : undefined;
    pairs.push({
      gold: entry,
      got: {
        event_id: row.ev.event_id,
        moods: row.taste,
        sortie: row.v2 ? parseTagList(row.v2.sortie) : [],
        energie,
      },
    });
  }
  const scored = scoreGold(pairs);
  return { ...scored, filePresent: true, missing };
}

export function snapshotOf(report: TagAuditReport): TagAuditSnapshot {
  const slots = {} as TagAuditSnapshot['slots'];
  for (const slot of report.slots) {
    slots[slot.id] = {
      rows: slot.rows,
      tagged: slot.tagged,
      taggedRate: slot.taggedRate,
      meanMoods: slot.meanMoods,
    };
  }
  const errorCounts: TagAuditSnapshot['errorCounts'] = {};
  for (const error of report.errors) {
    errorCounts[error.kind] = (errorCounts[error.kind] ?? 0) + 1;
  }
  return {
    version: 1,
    generatedAt: report.meta.generatedAt,
    baseline: report.meta.baseline,
    v2File: report.meta.v2File,
    slots,
    longText: {
      rows: report.vivant.longText,
      tagged: report.vivant.longTextTagged,
      rate: report.vivant.longTextRate,
    },
    moodsAtLeast10: report.vivant.moodsAtLeast10,
    thresholds: report.thresholds.map((row) => ({ id: row.id, status: row.status })),
    blockingErrors: report.errors.length,
    errorCounts,
  };
}

export function strictFailure(report: TagAuditReport): { failed: boolean; ids: string[] } {
  const ids = report.thresholds.filter((row) => row.status === 'fail').map((row) => row.id);
  return { failed: ids.length > 0, ids };
}

const SNAPSHOT_RE = /<!-- tag-audit:json\n([\s\S]*?)\n-->/;

export function extractSnapshot(text: string): TagAuditSnapshot | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as TagAuditSnapshot;
      return parsed?.version === 1 ? parsed : null;
    } catch {
      return null;
    }
  }
  const match = SNAPSHOT_RE.exec(text);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as TagAuditSnapshot;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function pct(rate: number | null | undefined, digits = 1): string {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(digits)} %`;
}

function num(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

function statusLabel(status: ThresholdStatus): string {
  if (status === 'ok') return 'OK';
  if (status === 'fail') return 'RATÉ';
  return 'n/a';
}

function signedPt(delta: number | null): string {
  if (delta == null || !Number.isFinite(delta)) return '—';
  const shown = delta * 100;
  const sign = shown > 0 ? '+' : '';
  return `${sign}${shown.toFixed(1)} pt`;
}

export function formatCompare(current: TagAuditSnapshot, previous: TagAuditSnapshot, file: string): string {
  const lines: string[] = [];
  lines.push('## Comparaison');
  lines.push('');
  lines.push(`Fichier : \`${file}\` (${previous.generatedAt}).`);
  lines.push('');
  lines.push('| Indicateur | Référence | Maintenant | Δ |');
  lines.push('|---|--:|--:|--:|');
  for (const slot of ['theatre', 'concert'] as const) {
    const prev = previous.slots[slot];
    const next = current.slots[slot];
    const dRate =
      prev?.taggedRate != null && next?.taggedRate != null ? next.taggedRate - prev.taggedRate : null;
    const dMean =
      prev?.meanMoods != null && next?.meanMoods != null ? next.meanMoods - prev.meanMoods : null;
    lines.push(
      `| Taux tagué ${slotLabel(slot)} | ${pct(prev?.taggedRate)} | ${pct(next?.taggedRate)} | ${signedPt(dRate)} |`,
    );
    lines.push(
      `| Ambiances moyennes ${slotLabel(slot)} | ${num(prev?.meanMoods)} | ${num(next?.meanMoods)} | ${dMean == null ? '—' : `${dMean > 0 ? '+' : ''}${dMean.toFixed(2)}`} |`,
    );
  }
  const dLong =
    previous.longText.rate != null && current.longText.rate != null
      ? current.longText.rate - previous.longText.rate
      : null;
  lines.push(
    `| Texte ≥ 80 car. tagué | ${pct(previous.longText.rate)} | ${pct(current.longText.rate)} | ${signedPt(dLong)} |`,
  );
  lines.push(
    `| Ambiances ≥ 10 fois | ${previous.moodsAtLeast10} / 16 | ${current.moodsAtLeast10} / 16 | ${current.moodsAtLeast10 - previous.moodsAtLeast10} |`,
  );
  lines.push(
    `| Erreurs bloquantes | ${previous.blockingErrors} | ${current.blockingErrors} | ${current.blockingErrors - previous.blockingErrors} |`,
  );
  lines.push('');
  lines.push('| Seuil | Référence | Maintenant |');
  lines.push('|---|---|---|');
  const prevBy = new Map(previous.thresholds.map((row) => [row.id, row.status]));
  for (const row of current.thresholds) {
    lines.push(`| ${row.id} | ${statusLabel(prevBy.get(row.id) ?? 'na')} | ${statusLabel(row.status)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderDistTable(rows: DistCount[], shareHeader = 'part'): string[] {
  const lines = [`| valeur | n | ${shareHeader} |`, '|---|--:|--:|'];
  for (const row of rows) {
    lines.push(`| ${row.value} | ${row.count} | ${pct(row.share)} |`);
  }
  return lines;
}

function renderSlot(slot: SlotReport): string[] {
  const lines: string[] = [];
  lines.push(`## ${slotLabel(slot.id) === 'théâtre' ? 'Théâtre' : 'Concert'}`);
  lines.push('');
  lines.push(`- Lignes : **${slot.rows}**`);
  lines.push(
    `- Taux tagué : **${pct(slot.taggedRate)}** (${slot.tagged}/${slot.rows}) — au moins une ambiance du vocabulaire (16)`,
  );
  lines.push(`- Nombre moyen d'ambiances (lignes taguées) : **${num(slot.meanMoods)}**`);
  lines.push(
    `- ≥ 2 ambiances : ${pct(slot.multiMoodRate)} des lignes taguées (${slot.multiMood}/${slot.tagged}). Le seuil 90 % ne porte que sur les lignes taguées v2 (${slot.multiMoodV2}/${slot.taggedV2}).`,
  );
  lines.push(`- Couche lue : v1 ${slot.fromV1}, v2 ${slot.fromV2}`);
  lines.push(
    `- Jetons v1 bruts : vide ${slot.rawTokens.empty}, un seul ${slot.rawTokens.one}, ≥ 2 ${slot.rawTokens.multi}`,
  );
  lines.push(
    `- Texte ≥ ${THRESHOLDS.longTextChars} caractères : ${slot.longText}, dont taguées ${slot.longTextTagged} (${pct(rate(slot.longTextTagged, slot.longText))})`,
  );
  lines.push('');
  lines.push('### Ambiances');
  lines.push('');
  lines.push(
    "Part du créneau = n / lignes du créneau (c'est ce que le seuil 35 % et l'IDF utilisent). Part des taguées = n / lignes qui ont au moins une ambiance.",
  );
  lines.push('');
  lines.push('| ambiance | n | part du créneau | part des taguées | IDF |');
  lines.push('|---|--:|--:|--:|--:|');
  for (const mood of slot.moods) {
    const mark = mood.overCeiling ? ' ⚠' : '';
    lines.push(
      `| ${mood.mood} | ${mood.count} | ${pct(mood.shareSlot)}${mark} | ${pct(mood.shareTagged)} | ${mood.idf == null ? '—' : mood.idf.toFixed(3)} |`,
    );
  }
  lines.push('');
  lines.push('### Confiance');
  lines.push('');
  lines.push('v1 `mood_confiance` (`evenements.csv`) :');
  lines.push('');
  lines.push(...renderDistTable(slot.moodConfiance, 'part du créneau'));
  lines.push('');
  if (!slot.tagConfiance.columnPresent) {
    lines.push('v2 `tag_confiance` : colonne absente.');
  } else if (slot.tagConfiance.filled === 0) {
    lines.push('v2 `tag_confiance` : colonne présente, aucune valeur.');
  } else {
    lines.push(`v2 \`tag_confiance\` (${slot.tagConfiance.filled} remplis) :`);
    lines.push('');
    lines.push(...renderDistTable(slot.tagConfiance.rows, 'part des remplis'));
  }
  lines.push('');
  lines.push('### Axes');
  lines.push('');
  for (const axis of slot.axes) {
    lines.push(`#### ${axis.field}`);
    lines.push('');
    if (!axis.columnPresent) {
      lines.push('Colonne absente.');
      lines.push('');
      continue;
    }
    lines.push(`Rempli : ${axis.filled} / ${slot.rows}.`);
    lines.push('');
    lines.push('| valeur | n | part des remplis | part du créneau |');
    lines.push('|---|--:|--:|--:|');
    for (const row of axis.rows) {
      lines.push(`| ${row.value}${row.official ? '' : ' ⚠'} | ${row.count} | ${pct(row.share)} | ${pct(row.shareSlot)} |`);
    }
    lines.push('');
  }
  return lines;
}

function emptyKindNote(kind: BlockingKind, v2Present: boolean): string {
  if (!v2Present && (kind === 'preuve_introuvable' || kind === 'v1_v2_incoherent' || kind === 'hors_bornes')) {
    return 'Aucune — fichier v2 absent.';
  }
  return 'Aucune.';
}

function isAvantBaseline(report: TagAuditReport): boolean {
  return report.meta.baseline === 'v1' && report.meta.v2Rows === 0;
}

export function renderReport(
  report: TagAuditReport,
  compare?: { file: string; previous: TagAuditSnapshot },
): string {
  const lines: string[] = [];
  const avant = isAvantBaseline(report);
  lines.push(avant ? '# Audit tags — avant (v1)' : '# Audit tags');
  lines.push('');
  lines.push(
    `Généré le ${report.meta.generatedAt}. Lecture seule. Clé **\`event_id\`** (stable d'un sync à l'autre — pas de clé de repli).`,
  );
  lines.push('');
  if (report.meta.v2File === 'absent') {
    lines.push(
      '`data/tags_evenements.csv` est **absent**. Les ambiances auditées sont la colonne v1 `evenements.moods` (baseline **avant**). Les distributions `sortie`, `energie`, `exigence`, `format_scene`, `ideal_pour` et `notoriete` ne sont pas calculables tant que ce fichier n’existe pas.',
    );
  } else if (avant) {
    lines.push(
      '`data/tags_evenements.csv` est **présent** (en-têtes seuls, 0 `event_id`). Les ambiances auditées restent la colonne v1 `evenements.moods` (baseline **avant**). Les axes v2 sont vides.',
    );
  } else {
    lines.push(
      `\`data/tags_evenements.csv\` est **présent** (${report.meta.v2Rows} \`event_id\`). Couche d'ambiances : v2 si la ligne a des \`moods\`, sinon v1. Baseline **${report.meta.baseline}**.`,
    );
  }
  lines.push('');
  const counts = report.slots
    .map((slot) => `${slot.id === 'theatre' ? 'Théâtre' : 'Concert'} ${slot.rows}`)
    .join(', ');
  lines.push(
    "Périmètre : une ligne d'`evenements.csv` par `event_id`. Créneau théâtre = `categorie` mappée sur Théâtre & danse ; concert = `categorie` mappée sur Musique (y compris `concert`). Une ligne `autre` avec `form=theatre` ne rentre pas. " +
      `${counts}, vivant ${report.vivant.rows}.`,
  );
  if (report.meta.evenementsSha256) {
    lines.push('');
    lines.push(`SHA-256 \`evenements.csv\` : \`${report.meta.evenementsSha256}\`.`);
  }
  lines.push('');
  lines.push(`IDF : ${report.meta.idfRule}.`);
  lines.push('');
  lines.push('## Seuils');
  lines.push('');
  lines.push(
    '`--strict` sort avec un code non nul si un statut est RATÉ. `n/a` ne fait pas échouer. Les erreurs bloquantes sont listées plus bas et ne changent pas le code de sortie.',
  );
  lines.push('');
  lines.push('| Règle | Cible | Mesure | Statut |');
  lines.push('|---|---|---|---|');
  for (const row of report.thresholds) {
    lines.push(`| ${row.label} | ${row.target} | ${row.measure} | ${statusLabel(row.status)} |`);
  }
  lines.push('');

  for (const slot of report.slots) {
    lines.push(...renderSlot(slot));
  }

  lines.push('## Vivant (théâtre + concert)');
  lines.push('');
  lines.push(`Ambiances du vocabulaire utilisées au moins ${THRESHOLDS.moodBreadthUses} fois : **${report.vivant.moodsAtLeast10} / 16**.`);
  lines.push('');
  lines.push('| ambiance | n | ≥ 10 |');
  lines.push('|---|--:|---|');
  for (const mood of report.vivant.moodUses) {
    lines.push(`| ${mood.mood} | ${mood.count} | ${mood.atLeast10 ? 'oui' : 'non'} |`);
  }
  lines.push('');
  lines.push(
    `Texte ≥ ${THRESHOLDS.longTextChars} caractères : ${report.vivant.longTextTagged} / ${report.vivant.longText} taguées (${pct(report.vivant.longTextRate)}).`,
  );
  lines.push('');

  lines.push('## Erreurs bloquantes');
  lines.push('');
  lines.push('| type | n |');
  lines.push('|---|--:|');
  for (const kind of BLOCKING_KINDS) {
    const n = report.errors.filter((error) => error.kind === kind).length;
    lines.push(`| ${kind} | ${n} |`);
  }
  lines.push(`| **total** | **${report.errors.length}** |`);
  lines.push('');
  for (const kind of BLOCKING_KINDS) {
    const group = report.errors.filter((error) => error.kind === kind);
    lines.push(`### ${kind} (${group.length})`);
    lines.push('');
    if (group.length === 0) {
      lines.push(emptyKindNote(kind, report.meta.v2File === 'present'));
      lines.push('');
      continue;
    }
    for (const error of group) {
      const other = error.otherEventId ? ` · \`${error.otherEventId}\`` : '';
      lines.push(
        `- \`${error.eventId}\`${other} · ${slotLabel(error.slot)} · ${oneLine(error.title)} — ${error.detail}`,
      );
    }
    lines.push('');
  }

  lines.push('## Notes v1');
  lines.push('');
  lines.push(
    'La colonne `evenements.moods` reste la référence tant que v2 est absent. Le séparateur v2 est `|` seulement ; la virgule est une anomalie de la colonne actuelle, pas un seuil.',
  );
  lines.push('');
  lines.push('### mood_source');
  lines.push('');
  const sourceKeys = new Set<string>();
  for (const slot of report.slots) for (const row of slot.moodSource) sourceKeys.add(row.value);
  const sourceOrder = [...sourceKeys].sort();
  lines.push(`| source | ${report.slots.map((slot) => slotLabel(slot.id)).join(' | ')} |`);
  lines.push(`|---|${report.slots.map(() => '--:').join('|')}|`);
  for (const key of sourceOrder) {
    const cells = report.slots.map((slot) => String(slot.moodSource.find((row) => row.value === key)?.count ?? 0));
    lines.push(`| ${key} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push(`### Séparateur virgule (${report.anomalies.length})`);
  lines.push('');
  if (report.anomalies.length === 0) {
    lines.push('Aucune.');
  } else {
    for (const anomaly of report.anomalies) {
      lines.push(`- \`${anomaly.eventId}\` · ${slotLabel(anomaly.slot)} · ${oneLine(anomaly.title)} — \`${anomaly.detail}\``);
    }
  }
  lines.push('');

  lines.push('## Gold set');
  lines.push('');
  if (!report.gold.filePresent) {
    lines.push(
      `\`scripts/fixtures/tag-gold.json\` est absent. Le gold set (60 spectacles, tagué à la main) n'est pas dans ce lot. Pas de mesure d'accord.`,
    );
  } else {
    lines.push(
      `Paires comparées : ${report.gold.compared}. Absentes du périmètre : ${report.gold.missing}. Ambiance principale ${pct(report.gold.principalMood)}, Jaccard ${num(report.gold.meanJaccard)}, sortie principale ${pct(report.gold.principalSortie)}, energie ±1 ${pct(report.gold.energieWithin1)}.`,
    );
  }
  lines.push('');

  if (compare) {
    lines.push(formatCompare(snapshotOf(report), compare.previous, compare.file));
  }

  lines.push('<!-- tag-audit:json');
  lines.push(JSON.stringify(snapshotOf(report), null, 2));
  lines.push('-->');
  lines.push('');
  return lines.join('\n');
}

export function parseTagAuditArgs(argv: string[]): { out: string | null; compare: string | null; strict: boolean } {
  let out: string | null = null;
  let compare: string | null = null;
  let strict = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--strict') {
      strict = true;
    } else if (flag === '--out') {
      if (!value || value.startsWith('--')) {
        console.error('Usage: npm run tags:audit -- --out bench-results/<date>-tags.md');
      } else {
        out = value;
        i += 1;
      }
    } else if (flag === '--compare') {
      if (!value || value.startsWith('--')) {
        console.error('Usage: npm run tags:audit -- --compare <fichier.md>');
      } else {
        compare = value;
        i += 1;
      }
    } else if (flag.startsWith('--')) {
      console.error(`Option inconnue : ${flag}`);
    }
  }
  return { out, compare, strict };
}

export function assertSafeOut(outPath: string, cwd = process.cwd()): void {
  const resolved = path.resolve(cwd, outPath);
  const dataDir = path.resolve(cwd, 'data');
  if (resolved === dataDir || resolved.startsWith(dataDir + path.sep)) {
    throw new Error(`Refus d'écrire dans data/ : ${resolved}`);
  }
}

export function defaultOutPath(now = new Date(), cwd = process.cwd()): string {
  const date = now.toISOString().slice(0, 10);
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return path.join(cwd, 'bench-results', `${date}-${hh}${mm}${ss}-tags.md`);
}

function readCsv(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    console.warn(`CSV parse warnings for ${path.basename(filePath)}:`, parsed.errors.slice(0, 3));
  }
  const headers = (parsed.meta.fields ?? []).map((field) => field.trim());
  const rows = parsed.data.map((row) => {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      cleaned[key.trim()] = typeof value === 'string' ? value.trim() : '';
    }
    return cleaned;
  });
  return { headers, rows };
}

export function loadAuditInputs(cwd = process.cwd()): AuditInput & { evenementsPath: string; v2Path: string } {
  const evenementsPath = path.join(cwd, 'data', 'evenements.csv');
  const v2Path = path.join(cwd, 'data', TAGS_V2_FILE);
  if (!fs.existsSync(evenementsPath)) {
    throw new Error(`evenements.csv introuvable : ${evenementsPath}`);
  }
  const eventsCsv = readCsv(evenementsPath);
  const events: AuditEvent[] = eventsCsv.rows.map((row) => ({
    event_id: row.event_id ?? '',
    lieu_id: row.lieu_id ?? '',
    titre: row.titre ?? '',
    categorie: row.categorie ?? '',
    date_debut: row.date_debut ?? '',
    form: row.form ?? '',
    description_courte: row.description_courte ?? '',
    description_longue: row.description_longue ?? '',
    citation: row.citation ?? '',
    casting: row.casting ?? '',
    genre: row.genre ?? '',
    moods: row.moods ?? '',
    mood_source: row.mood_source ?? '',
    mood_confiance: row.mood_confiance ?? '',
  }));
  let v2: AuditInput['v2'] = { present: false, headers: [], rows: [] };
  if (fs.existsSync(v2Path)) {
    const tagsCsv = readCsv(v2Path);
    v2 = {
      present: true,
      headers: tagsCsv.headers,
      rows: tagsCsv.rows.map((row) => ({
        event_id: row.event_id ?? '',
        moods: row.moods ?? '',
        sortie: row.sortie ?? '',
        energie: row.energie ?? '',
        exigence: row.exigence ?? '',
        format_scene: row.format_scene ?? '',
        ideal_pour: row.ideal_pour ?? '',
        notoriete: row.notoriete ?? '',
        tag_confiance: row.tag_confiance ?? '',
        tag_preuve: row.tag_preuve ?? '',
        tag_version: row.tag_version ?? '',
      })),
    };
  }
  const goldPath = path.join(cwd, GOLD_FILE);
  let gold: GoldTags[] | null = null;
  if (fs.existsSync(goldPath)) {
    const parsed = JSON.parse(fs.readFileSync(goldPath, 'utf-8')) as unknown;
    gold = normalizeGold(parsed);
  }
  return {
    events,
    v2,
    gold,
    evenementsSha256: crypto.createHash('sha256').update(fs.readFileSync(evenementsPath)).digest('hex'),
    evenementsPath,
    v2Path,
  };
}

function normalizeGold(parsed: unknown): GoldTags[] {
  const list = Array.isArray(parsed) ? parsed : [];
  return list.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const eventId = typeof row.event_id === 'string' ? row.event_id.trim() : '';
    if (!eventId) return [];
    const moods = Array.isArray(row.moods)
      ? row.moods.map((m) => String(m))
      : parseTagList(typeof row.moods === 'string' ? row.moods : '');
    const sortie = Array.isArray(row.sortie)
      ? row.sortie.map((m) => String(m))
      : typeof row.sortie === 'string'
        ? parseTagList(row.sortie)
        : undefined;
    const energie =
      typeof row.energie === 'number'
        ? row.energie
        : typeof row.energie === 'string' && row.energie.trim()
          ? Number(row.energie)
          : undefined;
    return [{ event_id: eventId, moods, sortie, energie: Number.isFinite(energie) ? energie : undefined }];
  });
}

function printSummary(report: TagAuditReport): void {
  console.log(isAvantBaseline(report) ? 'Audit tags — avant (v1)' : 'Audit tags');
  console.log(`baseline ${report.meta.baseline} · v2 ${report.meta.v2File} · vivant ${report.vivant.rows}`);
  for (const row of report.thresholds) {
    console.log(`  ${statusLabel(row.status).padEnd(5)} ${row.id} — ${row.measure}`);
  }
  const counts = new Map<string, number>();
  for (const error of report.errors) counts.set(error.kind, (counts.get(error.kind) ?? 0) + 1);
  const bits = BLOCKING_KINDS.filter((kind) => counts.has(kind)).map((kind) => `${kind} ${counts.get(kind)}`);
  console.log(`erreurs bloquantes : ${report.errors.length}${bits.length ? ` (${bits.join(', ')})` : ''}`);
}

function main(): void {
  const args = parseTagAuditArgs(process.argv.slice(2));
  const input = loadAuditInputs(process.cwd());
  const report = auditTags({
    ...input,
    generatedAt: new Date().toISOString(),
  });
  printSummary(report);

  let compare: { file: string; previous: TagAuditSnapshot } | undefined;
  if (args.compare) {
    const resolved = path.isAbsolute(args.compare) ? args.compare : path.join(process.cwd(), args.compare);
    if (!fs.existsSync(resolved)) {
      console.error(`--compare : fichier introuvable : ${resolved}`);
      process.exitCode = 1;
    } else {
      const previous = extractSnapshot(fs.readFileSync(resolved, 'utf-8'));
      if (!previous) {
        console.error(`--compare : pas de snapshot tag-audit dans ${resolved}`);
        process.exitCode = 1;
      } else {
        compare = { file: args.compare, previous };
        console.log('');
        console.log(formatCompare(snapshotOf(report), previous, args.compare));
      }
    }
  }

  const outPath = args.out
    ? path.isAbsolute(args.out)
      ? args.out
      : path.join(process.cwd(), args.out)
    : defaultOutPath();
  assertSafeOut(outPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderReport(report, compare), 'utf-8');
  console.log('');
  console.log(`Rapport : ${path.relative(process.cwd(), outPath)}`);

  if (args.strict) {
    const gate = strictFailure(report);
    if (gate.failed) {
      console.error(`--strict : seuils ratés : ${gate.ids.join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log('--strict : seuils OK');
    }
  }
}

const isDirectRun =
  typeof process.argv[1] === 'string' && /tagAudit\.(ts|js)$/.test(process.argv[1]);
if (isDirectRun) main();
