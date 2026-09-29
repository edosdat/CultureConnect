/**
 * Audit du catalogue à venir — T8 / N3.
 *
 * Lit `loadBenchCatalogue()` (même normalisation que la prod : tags T1/T2
 * visibles). N'écrit rien dans `data/`.
 *
 *   npm run audit
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TASTE_MOODS, tasteMoodsOf } from '../src/lib/phraseTags';
import { scorableSlugsOnProgrammeRow, workIdOf } from '../src/lib/reco';
import { parisParts } from '../src/lib/timeScope';
import type { DayItem, Lieu, ProgrammeWithContext } from '../src/lib/types';
import { gitCommitShort, sha256File } from './catalogueStamp';
import { loadBenchCatalogue, type BenchCatalogue } from './loadCatalogue';

export const AUDIT_FORMS = [
  'cine',
  'theatre',
  'concert',
  'enfants',
  'festival',
] as const;

export type AuditForm = (typeof AUDIT_FORMS)[number];

const LABEL_WIDTH = 'Couverture slug scorable par forme'.length;

const BRIDGE_FORMS = ['cine', 'theatre', 'concert'] as const;

export type AuditSeance = {
  date: string;
  form: string;
  moods: string;
  moodSource: string;
  genresMood: string;
  themes: string;
  genre: string;
  filmId: string;
  workId: string;
  lieuId: string;
};

export type AuditLieu = {
  lieuId: string;
  hasCoords: boolean;
  /** Séance ou évènement dont une date tombe dans la fenêtre. */
  active: boolean;
};

export type AuditInput = {
  todayIso: string;
  programmeSha256: string;
  commitSha: string;
  seances: readonly AuditSeance[];
  lieux: readonly AuditLieu[];
};

function metric(label: string, value: string): string {
  return `${label.padEnd(LABEL_WIDTH)} : ${value}`;
}

export function canonicalAuditForm(raw: string | undefined | null): AuditForm | null {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'cine' || s === 'cinema' || s === 'cinéma') return 'cine';
  if (
    s === 'theatre' ||
    s === 'théâtre' ||
    s === 'théatre' ||
    s === 'theatre_danse'
  ) {
    return 'theatre';
  }
  if (s === 'concert' || s === 'musique') return 'concert';
  if (s === 'enfants' || s === 'enfants_famille') return 'enfants';
  if (s === 'festival') return 'festival';
  return null;
}

function isoDay(raw: string | undefined | null): string {
  const d = (raw || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

function daysAhead(fromIso: string, toIso: string): number {
  const [yf, mf, df] = fromIso.split('-').map(Number);
  const [yt, mt, dt] = toIso.split('-').map(Number);
  const a = Date.UTC(yf, mf - 1, df);
  const b = Date.UTC(yt, mt - 1, dt);
  return Math.round((b - a) / 86_400_000);
}

function pct(n: number, d: number): string {
  if (d <= 0) return '0 %';
  return `${Math.round((100 * n) / d)} %`;
}

function joursLabel(n: number): string {
  return `${n} jour${n === 1 ? '' : 's'}`;
}

type MoodBucket = 'propres' | 'work' | 'aucune';

function moodBucket(seance: AuditSeance): MoodBucket {
  const moods = tasteMoodsOf(seance.moods.split(/[|,]/));
  if (moods.length === 0) return 'aucune';
  if (seance.moodSource.trim().toLowerCase() === 'work') return 'work';
  return 'propres';
}

function hasWorkTags(seance: AuditSeance): boolean {
  return Boolean(
    seance.moods.trim() || seance.genresMood.trim() || seance.themes.trim(),
  );
}

function isScorable(seance: AuditSeance): boolean {
  return (
    scorableSlugsOnProgrammeRow({
      moods: seance.moods,
      genres_mood: seance.genresMood,
      themes: seance.themes,
      genre: seance.genre,
    }).length > 0
  );
}

function formCounts(
  seances: readonly AuditSeance[],
  pick: (seance: AuditSeance) => boolean,
): Record<AuditForm, number> {
  const counts = Object.fromEntries(AUDIT_FORMS.map((form) => [form, 0])) as Record<
    AuditForm,
    number
  >;
  for (const seance of seances) {
    const form = canonicalAuditForm(seance.form);
    if (!form || !pick(seance)) continue;
    counts[form] += 1;
  }
  return counts;
}

function joinForms(counts: Record<AuditForm, number>, render: (form: AuditForm, n: number) => string): string {
  return AUDIT_FORMS.map((form) => render(form, counts[form])).join(' / ');
}

export function formatAuditReport(input: AuditInput): string {
  const today = isoDay(input.todayIso) || input.todayIso;
  const upcoming = input.seances.filter((seance) => {
    const date = isoDay(seance.date);
    return Boolean(date) && date >= today;
  });

  let end = today;
  for (const seance of upcoming) {
    const date = isoDay(seance.date);
    if (date > end) end = date;
  }

  const byForm = formCounts(upcoming, () => true);
  const lines: string[] = [];
  const sha = input.programmeSha256.trim();
  const commit = input.commitSha.trim() || 'inconnu';

  lines.push(
    `Fenêtre : ${today} → ${end}     sha256(programme.csv) : ${sha}`,
  );
  lines.push(`Commit  : ${commit}`);
  lines.push('');
  lines.push(
    metric(
      'Séances à venir par forme',
      joinForms(byForm, (form, n) => `${form} ${n}`),
    ),
  );

  lines.push(
    metric('Couverture moods par forme', 'propres / via œuvre (work) / aucune'),
  );
  for (const form of AUDIT_FORMS) {
    const rows = upcoming.filter((seance) => canonicalAuditForm(seance.form) === form);
    let propres = 0;
    let work = 0;
    let aucune = 0;
    for (const seance of rows) {
      const bucket = moodBucket(seance);
      if (bucket === 'propres') propres += 1;
      else if (bucket === 'work') work += 1;
      else aucune += 1;
    }
    const total = rows.length;
    lines.push(
      `  ${form.padEnd(10)} ${propres} (${pct(propres, total)}) / ${work} (${pct(work, total)}) / ${aucune} (${pct(aucune, total)})`,
    );
  }

  const scorable = formCounts(upcoming, isScorable);
  lines.push(
    metric(
      'Couverture slug scorable par forme',
      AUDIT_FORMS.map((form) => `${form} ${pct(scorable[form], byForm[form])}`).join(' / '),
    ),
  );

  const works: Record<AuditForm, Set<string>> = {
    cine: new Set(),
    theatre: new Set(),
    concert: new Set(),
    enfants: new Set(),
    festival: new Set(),
  };
  for (const seance of upcoming) {
    const form = canonicalAuditForm(seance.form);
    if (!form) continue;
    const id = seance.workId.trim();
    if (id) works[form].add(id);
  }
  lines.push(
    metric(
      'Œuvres distinctes par forme',
      joinForms(
        Object.fromEntries(AUDIT_FORMS.map((form) => [form, works[form].size])) as Record<
          AuditForm,
          number
        >,
        (form, n) => `${form} ${n}`,
      ),
    ),
  );

  const lastByForm = Object.fromEntries(AUDIT_FORMS.map((form) => [form, ''])) as Record<
    AuditForm,
    string
  >;
  for (const seance of upcoming) {
    const form = canonicalAuditForm(seance.form);
    if (!form) continue;
    const date = isoDay(seance.date);
    if (date > lastByForm[form]) lastByForm[form] = date;
  }
  lines.push(
    metric(
      'Horizon par forme',
      AUDIT_FORMS.map((form) => {
        const last = lastByForm[form];
        const n = last ? Math.max(0, daysAhead(today, last)) : 0;
        return `${form} ${joursLabel(n)}`;
      }).join(' / '),
    ),
  );

  lines.push(
    metric('Passerelle mood × forme', 'mood → (ciné, théâtre, concert)'),
  );
  const bridge = new Map<string, Record<(typeof BRIDGE_FORMS)[number], number>>();
  for (const mood of TASTE_MOODS) {
    bridge.set(mood, { cine: 0, theatre: 0, concert: 0 });
  }
  for (const seance of upcoming) {
    const form = canonicalAuditForm(seance.form);
    if (form !== 'cine' && form !== 'theatre' && form !== 'concert') continue;
    for (const mood of tasteMoodsOf(seance.moods.split(/[|,]/))) {
      const row = bridge.get(mood);
      if (!row) continue;
      row[form] += 1;
    }
  }
  for (const mood of TASTE_MOODS) {
    const row = bridge.get(mood)!;
    lines.push(
      `  ${mood.padEnd(14)} → (${row.cine}, ${row.theatre}, ${row.concert})`,
    );
  }

  const unlabeled = new Set(
    input.lieux
      .filter((lieu) => lieu.active && !lieu.hasCoords && lieu.lieuId.trim())
      .map((lieu) => lieu.lieuId.trim()),
  );
  let seancesSansCoords = 0;
  for (const seance of upcoming) {
    const id = seance.lieuId.trim();
    if (id && unlabeled.has(id)) seancesSansCoords += 1;
  }
  lines.push(
    metric(
      'Lieux actifs sans coordonnées',
      `${unlabeled.size}   (séances concernées : ${seancesSansCoords})`,
    ),
  );

  const taggedFilms = new Set<string>();
  const cineFilms = new Set<string>();
  for (const seance of upcoming) {
    if (canonicalAuditForm(seance.form) !== 'cine') continue;
    const filmId = seance.filmId.trim();
    if (!filmId) continue;
    cineFilms.add(filmId);
    if (hasWorkTags(seance)) taggedFilms.add(filmId);
  }
  let untagged = 0;
  for (const filmId of cineFilms) {
    if (!taggedFilms.has(filmId)) untagged += 1;
  }
  lines.push(metric('Films ciné à venir non taggés', String(untagged)));

  return lines.join('\n');
}

function hasCoords(lieu: Lieu | null | undefined): boolean {
  return Boolean((lieu?.lat || '').trim() && (lieu?.lng || '').trim());
}

function rememberLieu(
  coords: Map<string, boolean>,
  lieu: Lieu | null | undefined,
  fallbackId?: string,
): void {
  const lieuId = (lieu?.lieu_id || fallbackId || '').trim();
  if (!lieuId || !lieu || coords.has(lieuId)) return;
  coords.set(lieuId, hasCoords(lieu));
}

function seanceWorkId(row: ProgrammeWithContext): string {
  const item: DayItem = {
    kind: 'programme',
    key: `p:${row.programme.programme_id}`,
    dayIso: isoDay(row.programme.date),
    programme: row.programme,
    evenement: row.evenement,
    lieu: row.lieu,
  };
  return workIdOf(item);
}

export function auditInputFromCatalogue(
  catalogue: BenchCatalogue,
  todayIso: string,
  programmeSha256: string,
  commitSha: string,
): AuditInput {
  const today = isoDay(todayIso) || todayIso;
  const coords = new Map<string, boolean>();
  const active = new Set<string>();

  const markActive = (lieuId: string | undefined, dates: Array<string | undefined>) => {
    const id = (lieuId || '').trim();
    if (!id) return;
    if (dates.some((raw) => {
      const d = isoDay(raw);
      return Boolean(d) && d >= today;
    })) {
      active.add(id);
    }
  };

  const seances: AuditSeance[] = [];
  for (const row of catalogue.programmeWithContext) {
    const lieuId = (row.programme.lieu_id || row.evenement?.lieu_id || '').trim();
    rememberLieu(coords, row.lieu, lieuId);
    markActive(lieuId, [row.programme.date]);
    seances.push({
      date: isoDay(row.programme.date),
      form: row.programme.form || row.evenement?.form || '',
      moods: row.programme.moods || '',
      moodSource: row.programme.mood_source || '',
      genresMood: row.programme.genres_mood || '',
      themes: row.programme.themes || '',
      genre: row.programme.genre || '',
      filmId: row.programme.film_id || '',
      workId: seanceWorkId(row),
      lieuId,
    });
  }

  for (const ev of catalogue.events) {
    const lieuId = (ev.lieu_id || ev.lieu?.lieu_id || '').trim();
    rememberLieu(coords, ev.lieu, lieuId);
    markActive(lieuId, [ev.date_debut, ev.date_fin]);
  }

  const lieux: AuditLieu[] = [];
  for (const [lieuId, ok] of coords) {
    lieux.push({ lieuId, hasCoords: ok, active: active.has(lieuId) });
  }

  return {
    todayIso: today,
    programmeSha256,
    commitSha,
    seances,
    lieux,
  };
}

export function renderCatalogueAudit(
  catalogue: BenchCatalogue,
  todayIso: string,
  programmeSha256: string,
  commitSha: string,
): string {
  return formatAuditReport(
    auditInputFromCatalogue(catalogue, todayIso, programmeSha256, commitSha),
  );
}

function main(): void {
  const catalogue = loadBenchCatalogue();
  const today = parisParts(new Date()).iso;
  const report = renderCatalogueAudit(
    catalogue,
    today,
    sha256File(path.join('data', 'programme.csv')),
    gitCommitShort(),
  );
  process.stdout.write(`${report}\n`);
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entry && entry === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  main();
}
