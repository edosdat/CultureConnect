/**
 * CultureConnect — gold set humain (C1).
 *
 * Chemins partagés : revue CSV, import manuel, garde-fou contre un gold
 * encore `agent` / `llm`. `--eval-gold` (tagueur #173) et `tagAudit`
 * doivent appeler `assertGoldIsManuel` avant tout calcul de score.
 *
 *   npm run tags:gold-review
 *   npm run tags:gold-import
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { mainFromCategorie } from '../src/lib/categories';
import { TASTE_MOODS } from '../src/lib/phraseTags';

/** Même chemin que `tagAudit.GOLD_FILE` (évite un import circulaire). */
export const GOLD_FILE = path.join('scripts', 'fixtures', 'tag-gold.json');

export const SORTIE_VALUES = ['interessante', 'agreable', 'partage', 'evasion'] as const;
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

export const GOLD_REVIEW_CSV = path.join('scripts', 'fixtures', 'tag-gold-review.csv');
export const GOLD_SEED = '20260929';

export const REVIEW_COLUMNS = [
  'event_id',
  'titre',
  'categorie',
  'lieu',
  'texte',
  'moods',
  'sortie',
  'energie',
  'exigence',
  'format_scene',
  'ideal_pour',
  'notoriete',
] as const;

export type ReviewColumn = (typeof REVIEW_COLUMNS)[number];

/** Références few-shot du tagueur (#173) — C2 : aucun ne doit rester dans le gold. */
export const FEW_SHOT_REFS: readonly { event_id: string; title: string }[] = [
  { event_id: 'E485', title: 'TOM' },
  { event_id: 'E460', title: 'Lio Kuokman / Nelson Goerner' },
  { event_id: 'E442', title: "FAT FREDDY'S DROP" },
  { event_id: 'E667', title: 'Toc Toc' },
  { event_id: 'E406', title: 'HYPNO5E & HIPPOTRAKTOR' },
  { event_id: 'E499', title: 'Superpêche' },
  { event_id: 'BAR0014', title: 'Camping sauvage (quartet)' },
  { event_id: 'TMP0093', title: 'Jeanne Candel' },
];

export const RIGOLO_LAUGH = [
  'absurde',
  'critique',
  'tendre',
  'leger',
  'cerveau',
  'sombre',
  'intimiste',
] as const;

export const FESTIF_COMPANY = [
  'dansant',
  'intense',
  'brutal',
  'epique',
  'poetique',
  'intimiste',
  'contemplatif',
] as const;

const ENERGIE_INTS = [1, 2, 3, 4, 5] as const;
const EXIGENCE_INTS = [1, 2, 3] as const;

export type GoldFixtureRow = {
  event_id: string;
  titre: string;
  categorie: string;
  moods: string[];
  sortie: string[];
  energie: number;
  exigence: number;
  format_scene: string[];
  ideal_pour: string[];
  notoriete: string;
  tag_confiance: string;
  tag_preuve: string;
  tag_version: string;
  tagged_by: string;
  skip: boolean;
};

export type GoldValidationIssue = {
  code: 'hors_enum' | 'hors_bornes' | 'rigolo' | 'festif' | 'champ';
  detail: string;
};

export type ManuelGate =
  | { ok: true }
  | { ok: false; message: string };

const MANUEL_REFUSE_MESSAGE =
  'Gold set non manuel : au moins une ligne a tagged_by ≠ "manuel". ' +
  'Corrigez scripts/fixtures/tag-gold-review.csv puis lancez npm run tags:gold-import. ' +
  'Aucun score gold n’est calculé.';

export function assertGoldIsManuel(
  rows: readonly { tagged_by?: string | null; event_id?: string | null }[],
): ManuelGate {
  if (!rows.length) {
    return {
      ok: false,
      message:
        'Gold set vide ou absent. Importez un gold tagué à la main (tagged_by = "manuel") avant toute éval. Aucun score gold n’est calculé.',
    };
  }
  const nonManuel = rows.filter((row) => (row.tagged_by || '').trim() !== 'manuel');
  if (nonManuel.length > 0) {
    return { ok: false, message: MANUEL_REFUSE_MESSAGE };
  }
  return { ok: true };
}

/** Alias explicite pour `--eval-gold` (même message, pas de chiffre). */
export function refuseEvalGoldIfNotManuel(
  rows: readonly { tagged_by?: string | null }[],
): string | null {
  const gate = assertGoldIsManuel(rows);
  return gate.ok ? null : gate.message;
}

export function normalizeGoldTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function goldFewShotLeaks(
  gold: readonly { event_id: string; titre?: string }[],
  fewShots: readonly { event_id: string; title: string }[] = FEW_SHOT_REFS,
): { event_id: string; via: 'event_id' | 'title'; fewShotTitle: string }[] {
  const byId = new Map(fewShots.map((shot) => [shot.event_id, shot]));
  const byTitle = new Map(fewShots.map((shot) => [normalizeGoldTitle(shot.title), shot]));
  const leaks: { event_id: string; via: 'event_id' | 'title'; fewShotTitle: string }[] = [];
  const seen = new Set<string>();
  for (const row of gold) {
    const idHit = byId.get(row.event_id);
    if (idHit && !seen.has(row.event_id)) {
      seen.add(row.event_id);
      leaks.push({ event_id: row.event_id, via: 'event_id', fewShotTitle: idHit.title });
      continue;
    }
    const titleHit = byTitle.get(normalizeGoldTitle(row.titre || ''));
    if (titleHit && !seen.has(row.event_id)) {
      seen.add(row.event_id);
      leaks.push({ event_id: row.event_id, via: 'title', fewShotTitle: titleHit.title });
    }
  }
  return leaks;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

export function parseGoldFixture(parsed: unknown): GoldFixtureRow[] {
  if (!Array.isArray(parsed)) return [];
  const rows: GoldFixtureRow[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const eventId = typeof row.event_id === 'string' ? row.event_id.trim() : '';
    if (!eventId) continue;
    const energie = typeof row.energie === 'number' ? row.energie : Number(row.energie);
    const exigence = typeof row.exigence === 'number' ? row.exigence : Number(row.exigence);
    rows.push({
      event_id: eventId,
      titre: typeof row.titre === 'string' ? row.titre : '',
      categorie: typeof row.categorie === 'string' ? row.categorie : '',
      moods: asStringList(row.moods),
      sortie: asStringList(row.sortie),
      energie,
      exigence,
      format_scene: asStringList(row.format_scene),
      ideal_pour: asStringList(row.ideal_pour),
      notoriete: typeof row.notoriete === 'string' ? row.notoriete : '',
      tag_confiance: typeof row.tag_confiance === 'string' ? row.tag_confiance : '',
      tag_preuve: typeof row.tag_preuve === 'string' ? row.tag_preuve : '',
      tag_version: typeof row.tag_version === 'string' ? row.tag_version : '',
      tagged_by: typeof row.tagged_by === 'string' ? row.tagged_by : '',
      skip: row.skip === true,
    });
  }
  return rows;
}

export function loadGoldFixture(cwd = process.cwd()): GoldFixtureRow[] {
  const filePath = path.join(cwd, GOLD_FILE);
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  return parseGoldFixture(parsed);
}

export function writeGoldFixture(rows: readonly GoldFixtureRow[], cwd = process.cwd()): string {
  const filePath = path.join(cwd, GOLD_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = `${JSON.stringify(rows, null, 2)}\n`;
  fs.writeFileSync(filePath, body, 'utf-8');
  return filePath;
}

export function isConcertCategorie(categorie: string): boolean {
  return mainFromCategorie(categorie) === 'musique';
}

function pushIssue(issues: GoldValidationIssue[], code: GoldValidationIssue['code'], detail: string): void {
  issues.push({ code, detail });
}

function takeList(
  value: unknown,
  allowed: readonly string[],
  min: number,
  max: number,
  field: string,
  issues: GoldValidationIssue[],
): string[] {
  let raw: unknown[] = [];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === 'string') {
    raw = value
      .split(/[|,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  } else {
    pushIssue(issues, 'hors_bornes', `${field} : liste attendue`);
    return [];
  }
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' && typeof item !== 'number') {
      pushIssue(issues, 'hors_enum', `${field} : valeur non textuelle`);
      continue;
    }
    const slug = String(item).trim().toLowerCase();
    if (!slug) continue;
    if (seen.has(slug)) {
      pushIssue(issues, 'hors_bornes', `${field} : doublon ${slug}`);
      continue;
    }
    seen.add(slug);
    if (!(allowed as readonly string[]).includes(slug)) {
      pushIssue(issues, 'hors_enum', `${field} : ${slug}`);
      continue;
    }
    tokens.push(slug);
  }
  if (tokens.length < min || tokens.length > max) {
    const span = min === max ? `${min}` : `${min}–${max}`;
    pushIssue(issues, 'hors_bornes', `${field} : ${tokens.length} valeur(s) (attendu ${span})`);
  }
  return tokens;
}

function takeInt(
  value: unknown,
  allowed: readonly number[],
  field: string,
  issues: GoldValidationIssue[],
): number | null {
  let n: number | null = null;
  if (typeof value === 'number' && Number.isInteger(value)) n = value;
  else if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) n = Number(value.trim());
  if (n == null) {
    pushIssue(issues, 'hors_enum', `${field} : valeur invalide`);
    return null;
  }
  if (!(allowed as readonly number[]).includes(n)) {
    pushIssue(issues, 'hors_enum', `${field} : ${n}`);
    return null;
  }
  return n;
}

function takeOne(
  value: unknown,
  allowed: readonly string[],
  field: string,
  issues: GoldValidationIssue[],
): string | null {
  if (typeof value !== 'string') {
    pushIssue(issues, 'hors_enum', `${field} : valeur invalide`);
    return null;
  }
  const slug = value.trim().toLowerCase();
  if (!(allowed as readonly string[]).includes(slug)) {
    pushIssue(issues, 'hors_enum', `${field} : ${slug || 'vide'}`);
    return null;
  }
  return slug;
}

/**
 * Enums + cardinalités alignés sur le tagueur (§A4), sans exiger preuve
 * (absente du CSV de revue). `tag_confiance` / `tag_preuve` sont repris
 * de la ligne gold existante à l'import.
 */
export function validateGoldTagFields(
  raw: {
    moods?: unknown;
    sortie?: unknown;
    energie?: unknown;
    exigence?: unknown;
    format_scene?: unknown;
    ideal_pour?: unknown;
    notoriete?: unknown;
  },
  ctx: { concert: boolean },
): { ok: true; value: {
  moods: string[];
  sortie: string[];
  energie: number;
  exigence: number;
  format_scene: string[];
  ideal_pour: string[];
  notoriete: string;
} } | { ok: false; issues: GoldValidationIssue[] } {
  const issues: GoldValidationIssue[] = [];
  const moods = takeList(raw.moods, TASTE_MOODS, 2, 3, 'moods', issues);
  const sortie = takeList(raw.sortie, SORTIE_VALUES, 1, 2, 'sortie', issues);
  const energie = takeInt(raw.energie, ENERGIE_INTS, 'energie', issues);
  const exigence = takeInt(raw.exigence, EXIGENCE_INTS, 'exigence', issues);
  const format = takeList(raw.format_scene, FORMAT_VALUES, 1, 2, 'format_scene', issues);
  const pour = takeList(raw.ideal_pour, IDEAL_POUR_VALUES, 1, 3, 'ideal_pour', issues);
  const notoriete = takeOne(raw.notoriete, NOTORIETE_VALUES, 'notoriete', issues);

  if (moods.includes('rigolo') && !moods.some((mood) => (RIGOLO_LAUGH as readonly string[]).includes(mood))) {
    pushIssue(
      issues,
      'rigolo',
      'rigolo sans le type de rire (absurde, critique, tendre, leger, cerveau, sombre ou intimiste)',
    );
  }
  if (
    ctx.concert &&
    moods.includes('festif') &&
    !moods.some((mood) => (FESTIF_COMPANY as readonly string[]).includes(mood))
  ) {
    pushIssue(
      issues,
      'festif',
      'festif seul sur un concert (ajouter dansant, intense, brutal, epique, poetique, intimiste ou contemplatif)',
    );
  }

  if (issues.length > 0 || energie == null || exigence == null || notoriete == null) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      moods,
      sortie,
      energie,
      exigence,
      format_scene: format,
      ideal_pour: pour,
      notoriete,
    },
  };
}

function readCsvRecords(filePath: string): Record<string, string>[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return parsed.data.map((row) => {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      cleaned[key.trim()] = typeof value === 'string' ? value.trim() : '';
    }
    return cleaned;
  });
}

export function usefulTaggerText(row: {
  description_longue?: string;
  description_courte?: string;
}): string {
  const longue = (row.description_longue || '').trim();
  if (longue) return longue;
  return (row.description_courte || '').trim();
}

export function joinPipe(values: readonly string[]): string {
  return values.join('|');
}

export type CatalogueLookup = {
  titre: string;
  categorie: string;
  lieu: string;
  texte: string;
};

export function loadCatalogueLookup(cwd = process.cwd()): Map<string, CatalogueLookup> {
  const eventsPath = path.join(cwd, 'data', 'evenements.csv');
  const lieuxPath = path.join(cwd, 'data', 'lieux.csv');
  const events = readCsvRecords(eventsPath);
  const lieux = fs.existsSync(lieuxPath) ? readCsvRecords(lieuxPath) : [];
  const lieuById = new Map(lieux.map((lieu) => [lieu.lieu_id, lieu]));
  const out = new Map<string, CatalogueLookup>();
  for (const row of events) {
    const id = (row.event_id || '').trim();
    if (!id || out.has(id)) continue;
    const lieu = lieuById.get(row.lieu_id);
    out.set(id, {
      titre: row.titre || '',
      categorie: row.categorie || '',
      lieu: (lieu?.nom || '').trim(),
      texte: usefulTaggerText(row),
    });
  }
  return out;
}

export function reviewRowFromGold(
  gold: GoldFixtureRow,
  catalogue: ReadonlyMap<string, CatalogueLookup>,
): Record<ReviewColumn, string> {
  const cat = catalogue.get(gold.event_id);
  return {
    event_id: gold.event_id,
    titre: cat?.titre || gold.titre,
    categorie: cat?.categorie || gold.categorie,
    lieu: cat?.lieu || '',
    texte: cat?.texte || '',
    moods: joinPipe(gold.moods),
    sortie: joinPipe(gold.sortie),
    energie: String(gold.energie),
    exigence: String(gold.exigence),
    format_scene: joinPipe(gold.format_scene),
    ideal_pour: joinPipe(gold.ideal_pour),
    notoriete: gold.notoriete,
  };
}

export function renderReviewCsv(rows: readonly Record<ReviewColumn, string>[]): string {
  const columns = [...REVIEW_COLUMNS];
  const body = Papa.unparse(
    rows.map((row) => {
      const out: Record<string, string> = {};
      for (const column of columns) out[column] = row[column] ?? '';
      return out;
    }),
    { columns, newline: '\n' },
  );
  return body.endsWith('\n') ? body : `${body}\n`;
}

export function generateGoldReviewCsv(cwd = process.cwd()): {
  path: string;
  rows: number;
} {
  const gold = loadGoldFixture(cwd);
  if (!gold.length) {
    throw new Error(`Fixture gold introuvable ou vide : ${GOLD_FILE}`);
  }
  const catalogue = loadCatalogueLookup(cwd);
  const rows = gold.map((entry) => reviewRowFromGold(entry, catalogue));
  const outPath = path.join(cwd, GOLD_REVIEW_CSV);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderReviewCsv(rows), 'utf-8');
  return { path: outPath, rows: rows.length };
}

export type GoldImportResult =
  | { ok: true; path: string; rows: number }
  | { ok: false; errors: string[] };

export function importGoldReviewCsv(options?: {
  cwd?: string;
  csvPath?: string;
  existingGold?: GoldFixtureRow[];
}): GoldImportResult {
  const cwd = options?.cwd ?? process.cwd();
  const csvPath = options?.csvPath ?? path.join(cwd, GOLD_REVIEW_CSV);
  if (!fs.existsSync(csvPath)) {
    return { ok: false, errors: [`CSV introuvable : ${csvPath}`] };
  }
  const records = readCsvRecords(csvPath);
  if (!records.length) {
    return { ok: false, errors: ['CSV de revue vide'] };
  }
  const existing =
    options?.existingGold ??
    (fs.existsSync(path.join(cwd, GOLD_FILE)) ? loadGoldFixture(cwd) : []);
  const byId = new Map(existing.map((row) => [row.event_id, row]));
  const errors: string[] = [];
  const imported: GoldFixtureRow[] = [];
  const seen = new Set<string>();

  for (const [index, record] of records.entries()) {
    const line = index + 2; // header + 1-based
    const eventId = (record.event_id || '').trim();
    if (!eventId) {
      errors.push(`Ligne ${line} : event_id manquant`);
      continue;
    }
    if (seen.has(eventId)) {
      errors.push(`Ligne ${line} : event_id en double ${eventId}`);
      continue;
    }
    seen.add(eventId);
    const categorie = (record.categorie || byId.get(eventId)?.categorie || '').trim();
    const validated = validateGoldTagFields(
      {
        moods: record.moods,
        sortie: record.sortie,
        energie: record.energie,
        exigence: record.exigence,
        format_scene: record.format_scene,
        ideal_pour: record.ideal_pour,
        notoriete: record.notoriete,
      },
      { concert: isConcertCategorie(categorie) },
    );
    if (!validated.ok) {
      for (const issue of validated.issues) {
        errors.push(`Ligne ${line} (${eventId}) : ${issue.detail}`);
      }
      continue;
    }
    const prev = byId.get(eventId);
    imported.push({
      event_id: eventId,
      titre: (record.titre || prev?.titre || '').trim(),
      categorie,
      moods: validated.value.moods,
      sortie: validated.value.sortie,
      energie: validated.value.energie,
      exigence: validated.value.exigence,
      format_scene: validated.value.format_scene,
      ideal_pour: validated.value.ideal_pour,
      notoriete: validated.value.notoriete,
      tag_confiance: prev?.tag_confiance || 'moyenne',
      tag_preuve: prev?.tag_preuve || '',
      tag_version: prev?.tag_version || 'v2',
      tagged_by: 'manuel',
      skip: false,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const outPath = writeGoldFixture(imported, cwd);
  return { ok: true, path: outPath, rows: imported.length };
}
