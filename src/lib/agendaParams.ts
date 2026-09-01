import { phraseUsesTitleQ, type PhraseTags } from './phraseTags';
import type { TimeScopeId } from './timeScope';

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
};

/** Boot snapshot is tous/upcoming — never skip a selected calendar day. */
export function listFetchShouldSkipBoot(
  skip: boolean,
  scope: TimeScopeId,
  selectedDate: string | null,
): boolean {
  if (!skip) return false;
  if (scope === 'date' && selectedDate) return false;
  return true;
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
    'date-scope-v1',
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
  ];
}
