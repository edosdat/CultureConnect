import { phraseUsesTitleQ, type PhraseTags } from './phraseTags';
import type { TimeScopeId } from './timeScope';

/**
 * Browser / CDN must not keep yesterday's cards after Paris midnight
 * or a daily CSV rotate. Server `unstable_cache` (5 min, keyed by
 * Paris day) is the only cache — HTTP stays no-store.
 */
export const AGENDA_HTTP_CACHE_CONTROL =
  'private, no-cache, no-store, max-age=0, must-revalidate';

/**
 * A picked salle lists every upcoming séance at that lieu in one response.
 * Above the home page (50) and the title-suggest sample (8). The biggest
 * venue in the catalogue is a few hundred séances.
 */
export const AGENDA_VENUE_PAGE_MAX = 400;

export type AgendaParamsInput = {
  scope: TimeScopeId;
  commune: string | null;
  q: string;
  cats: string[];
  genres: string[];
  lieuId: string | null;
  selectedDate: string | null;
  year: number;
  month: number;
  offset?: number;
  includeCounts?: boolean;
  includeListMeta?: boolean;
  phraseTags?: PhraseTags | null;
  phraseMode?: boolean;
  /** Mode « Avec les enfants » — query flag `enfants=1`, never a `cat` value. */
  avecEnfants?: boolean;
};

/**
 * Date chips are not in the boot snapshot. A skip armed for another
 * scope (boot / restore « tous ») must not swallow their list GET.
 * Same-scope snapshot may still skip.
 */
const BOOT_SKIP_DATE_CHIPS: readonly TimeScopeId[] = [
  'aujourdhui',
  'soir',
  'weekend',
  'semaine',
];

export function isBootSkipDateChip(scope: TimeScopeId): boolean {
  return (BOOT_SKIP_DATE_CHIPS as readonly string[]).includes(scope);
}

/**
 * Boot snapshot is tous/upcoming — never skip a selected calendar day,
 * and never skip soir|aujourdhui|weekend|semaine unless this exact chip
 * armed the flag (embedded snapshot). `armedScope` omitted means the
 * flag is a leftover boolean from another scope.
 */
export function listFetchShouldSkipBoot(
  skip: boolean,
  scope: TimeScopeId,
  selectedDate: string | null,
  armedScope?: TimeScopeId | null,
): boolean {
  if (!skip) return false;
  if (scope === 'date' && selectedDate) return false;
  if (isBootSkipDateChip(scope)) return armedScope === scope;
  if (armedScope != null && armedScope !== scope) return false;
  return true;
}

/**
 * Landing GPS must not refetch the painted « tous » list when the
 * commune stays put. It must not swallow soir|aujourdhui|weekend|semaine
 * or a calendar month — those chips have no boot rows of their own.
 */
export function listFetchShouldSkipBootGps(
  skipBootGps: boolean,
  scope: TimeScopeId,
  selectedCategoryCount: number,
  titleQuery?: string | null,
  avecEnfants?: boolean,
): boolean {
  if (!skipBootGps) return false;
  // A title search must refetch. Deny-GPS leaves this one-shot armed
  // until the next list effect; swallowing that search leaves a blank list.
  if ((titleQuery || '').trim()) return false;
  // The kids mode has no boot rows — the one-shot must not swallow it.
  if (avecEnfants) return false;
  if (scope !== 'tous') return false;
  if (selectedCategoryCount > 0) return false;
  return true;
}

/** `enfants=1` / `avec_enfants=1` (query or JSON). Never read this from `cat`. */
export function parseAvecEnfantsFlag(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  if (typeof raw !== 'string') return false;
  const value = raw.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
}

/**
 * A list generation that will not leave `/api/agenda` in flight must
 * release the pack skeleton and sync `genreOptionsReadyKey`.
 *
 * Boot / GPS skip still does not GET — but a dependent genre facet that
 * lands here used to leave « Chargement Cinéma » up with no request.
 * Cleanup cancel does not write a stale key; the successor settles.
 * A gen bumped before `fetch()` (load-more, or a superseded timeout)
 * settles, because this generation will not send the GET.
 * The finished generation settles only while it is still current.
 */
export function listGenerationShouldSettle(opts: {
  skipped: boolean;
  cancelled: boolean;
  requestStarted: boolean;
  requestFinished: boolean;
  gen: number;
  currentGen: number;
}): boolean {
  if (opts.skipped) return true;
  if (opts.cancelled) return false;
  if (opts.requestFinished) return opts.gen === opts.currentGen;
  if (opts.gen !== opts.currentGen && !opts.requestStarted) return true;
  return false;
}

/**
 * Date chip with no embedded snapshot: the previous cineTotal (often
 * « tous ») must not hold PackRailSkeleton. Stay pending, with pack
 * totals cleared, until applyList. A failed GET stays on this gate
 * (`listSettled: false`) instead of keeping the daytime window.
 */
export function dateChipListGate(opts: {
  scope: TimeScopeId;
  hasSnapshot: boolean;
  listSettled: boolean;
}): { cataloguePending: boolean; clearStalePackTotals: boolean } {
  const chip = opts.scope === 'date' || isBootSkipDateChip(opts.scope);
  if (!chip || opts.hasSnapshot || opts.listSettled) {
    return { cataloguePending: false, clearStalePackTotals: false };
  }
  return { cataloguePending: true, clearStalePackTotals: true };
}

/**
 * GET /api/agenda with no window, id, or scope runs the full « tous »
 * catalogue (multi-second cold). Clients must pass one of those.
 */
export function agendaGetIsAddressed(params: URLSearchParams): boolean {
  if ((params.get('window') || '').trim() === 'home') return true;
  if ((params.get('id') || '').trim()) return true;
  if ((params.get('scope') || '').trim()) return true;
  return false;
}

export function buildAgendaParams(opts: AgendaParamsInput): URLSearchParams {
  const p = new URLSearchParams();
  p.set('scope', opts.scope);
  if (opts.commune) p.set('commune', opts.commune);
  const usePhraseTags =
    Boolean(opts.phraseMode) && !phraseUsesTitleQ(opts.phraseTags);
  if (usePhraseTags) {
    const t = opts.phraseTags;
    if (t?.form) p.set('form', t.form);
    p.set('moods', (t?.moods ?? []).join(','));
    const tagGenres = t?.genres ?? [];
    const merged = [...opts.genres, ...tagGenres];
    if (merged.length) p.set('genres', merged.join(','));
    const themes = t?.themes ?? [];
    if (themes.length) p.set('themes', themes.join(','));
    const entities = t?.entities ?? [];
    if (entities.length) p.set('entities', entities.join(','));
    if (t?.date_from) p.set('date_from', t.date_from);
    if (t?.date_to) p.set('date_to', t.date_to);
  } else {
    if (opts.q) p.set('q', opts.q);
    if (opts.genres.length) p.set('genres', opts.genres.join(','));
  }
  if (opts.cats.length) p.set('cat', opts.cats.join(','));
  if (opts.avecEnfants) p.set('enfants', '1');
  if (opts.lieuId) p.set('lieu', opts.lieuId);
  if (opts.selectedDate && opts.scope !== 'tous') {
    p.set('date', opts.selectedDate);
  }
  p.set('year', String(opts.year));
  p.set('month', String(opts.month));
  if (opts.offset) p.set('offset', String(opts.offset));
  if (opts.includeCounts) p.set('counts', '1');
  if (opts.includeListMeta) p.set('meta', '1');
  return p;
}

/** unstable_cache parts — must include the selected calendar day. */
export function agendaListCacheKeyParts(input: {
  scope: string;
  selectedDate?: string | null;
  year: number;
  month: number;
  cats: string[];
  commune: string | null;
  lieuId: string | null;
  genres: string[];
  offset?: number;
  limit?: number;
  includeListMeta?: boolean;
  avecEnfants?: boolean;
  parisDay: string;
}): string[] {
  const catKey = [...input.cats]
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
  const genreKey = [...input.genres]
    .map((g) => g.trim())
    .filter(Boolean)
    .sort()
    .join(',');
  return [
    'agenda-list',
    'date-scope-slim-v2',
    input.parisDay,
    input.scope,
    (input.selectedDate || '').trim(),
    String(input.year),
    String(input.month),
    catKey,
    (input.commune || '').trim(),
    (input.lieuId || '').trim(),
    genreKey,
    String(input.offset ?? 0),
    String(input.limit ?? ''),
    input.includeListMeta ? '1' : '0',
    input.avecEnfants ? 'enfants' : '0',
  ];
}
