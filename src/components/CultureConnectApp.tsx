'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayItem, GenreLegend, Lieu } from '@/lib/types';
import type { AgendaDetailResponse, AgendaListResponse } from '@/lib/slim';
import { profileHasChipWeight } from '@/lib/reco';
import { extractMoods, profileHasZeroWeights } from '@/lib/signals';
import { useSignals } from './SignalsProvider';
import { densifiedCardCount } from '@/lib/densify';
import { filmIdOfItem } from '@/lib/nouveautesCine';
import { catsAllowCinemaPack, genreBelongsToMains, mainFromGenreSlug } from '@/lib/categories';
import { MONTH_NAMES_FR } from '@/lib/labels';
import {
  resolveScopeRange,
  scopeContextLabel,
  type TimeScopeId,
} from '@/lib/timeScope';
import CategoryFilter from './CategoryFilter';
import GenreFilter from './GenreFilter';
import CityFilter from './CityFilter';
import VenueFilter from './VenueFilter';
import MonthCalendar from './MonthCalendar';
import MonthCalendarDrawer from './MonthCalendarDrawer';
import SeanceGrid from './SeanceGrid';
import Top3Skeleton from './Top3Skeleton';
import TimeScopeBar from './TimeScopeBar';
import SearchOmnibox from './SearchOmnibox';
import ListWaitDots from './ListWaitDots';
import EventDetail from './EventDetail';
import LoginNudge from './LoginNudge';
import {
  emptyPhraseTags,
  hasPhraseSignal,
  parsePhraseRules,
  phraseUsesTitleQ,
  type PhraseTags,
} from '@/lib/phraseTags';
import { normalizeDeepLinkId } from '@/lib/deepLink';

type Props = {
  initialScope: TimeScopeId;
  initialParisIso: string;
  initialItems: DayItem[];
  initialNouveautes: DayItem[];
  initialTotal: number;
  initialDensifiedTotal: number;
  initialVenues: Lieu[];
  initialGenreSlugs: string[];
  communes: string[];
  genresLegend: GenreLegend[];
  initialYear: number;
  initialMonth: number;
  initialNouveauFilmIds?: string[];
  /** Guest 1+1+1 per date chip, computed in loadHomeWindow. */
  initialRecoByScope?: Partial<Record<TimeScopeId, DayItem[]>>;
  /** Toulouse list snapshot per date chip (items + window totals). */
  initialListByScope?: Partial<
    Record<
      TimeScopeId,
      {
        items: DayItem[];
        total: number;
        densifiedTotal: number;
        nouveautes: DayItem[];
        venues: Lieu[];
      }
    >
  >;
  /** Normalized `p:` / `e:` key from `?e=` (or `?id=`). */
  initialOpenKey?: string | null;
  initialOpenItem?: DayItem | null;
  initialRelatedItems?: DayItem[];
  initialAussiCeSoir?: DayItem[];
};

function evenementWord(n: number): string {
  return n <= 1 ? 'événement' : 'événements';
}

function normalizeCommune(c: string | null | undefined): string {
  return (c || '').trim().toLocaleLowerCase('fr');
}

type RecoKind = 'guest' | 'profile' | 'wiped' | 'pending';

const RECO_BOOT_SCOPES = ['tous', 'soir', 'aujourdhui', 'weekend', 'semaine'] as const;

/** Reco cards are keyed by window so Ce soir never paints boot/tous cards. */
function recoPoolKey(
  scope: TimeScopeId,
  day: string | null,
  commune: string | null,
  kind: RecoKind,
): string {
  return `${scope}|${day ?? ''}|${normalizeCommune(commune)}|${kind}`;
}

/** Date only changes reco for a calendar day or today chips. */
function recoKeyDay(
  scope: TimeScopeId,
  selectedDay: string | null,
  parisIso: string,
): string | null {
  if (scope === 'date') return selectedDay;
  if (scope === 'soir' || scope === 'aujourdhui') return selectedDay ?? parisIso;
  return null;
}

function hydrateRecoCache(
  byScope: Partial<Record<TimeScopeId, DayItem[]>> | undefined,
  parisIso: string,
  commune: string | null,
): Record<string, DayItem[]> {
  const out: Record<string, DayItem[]> = {};
  if (!byScope) return out;
  for (const [scope, items] of Object.entries(byScope)) {
    if (!items) continue;
    const day = recoKeyDay(scope as TimeScopeId, null, parisIso);
    out[recoPoolKey(scope as TimeScopeId, day, commune, 'guest')] = items;
  }
  return out;
}

/** Public card payloads only — no email, no tastes text. */
const PROFILE_RECO_CACHE_KEY = 'cc.profileReco.v1';

type ProfileRecoCacheFile = {
  parisIso: string;
  commune: string;
  pools: Record<string, DayItem[]>;
};

function readProfileRecoCache(
  parisIso: string,
  commune: string | null,
): Record<string, DayItem[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(PROFILE_RECO_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProfileRecoCacheFile;
    if (!parsed || typeof parsed !== 'object') return {};
    if (parsed.parisIso !== parisIso) return {};
    if (normalizeCommune(parsed.commune) !== normalizeCommune(commune)) {
      return {};
    }
    if (!parsed.pools || typeof parsed.pools !== 'object') return {};
    const out: Record<string, DayItem[]> = {};
    for (const [key, items] of Object.entries(parsed.pools)) {
      if (!key.endsWith('|profile') || !Array.isArray(items)) continue;
      out[key] = items;
    }
    return out;
  } catch {
    return {};
  }
}

function writeProfileRecoCache(
  parisIso: string,
  commune: string | null,
  pools: Record<string, DayItem[]>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const slim: Record<string, DayItem[]> = {};
    for (const [key, items] of Object.entries(pools)) {
      if (!key.endsWith('|profile') || !Array.isArray(items)) continue;
      slim[key] = items;
    }
    sessionStorage.setItem(
      PROFILE_RECO_CACHE_KEY,
      JSON.stringify({
        parisIso,
        commune: commune ?? '',
        pools: slim,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

function clearProfileRecoCache(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PROFILE_RECO_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

const AGENDA_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;
const PHRASE_FETCH_MS = 80;

function buildAgendaParams(opts: {
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
}): URLSearchParams {
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
  if (opts.selectedDate && opts.scope !== 'tous') p.set('date', opts.selectedDate);
  p.set('year', String(opts.year));
  p.set('month', String(opts.month));
  if (opts.offset) p.set('offset', String(opts.offset));
  if (opts.includeCounts) p.set('counts', '1');
  if (opts.includeListMeta) p.set('meta', '1');
  return p;
}

export default function CultureConnectApp({
  initialScope,
  initialParisIso,
  initialItems,
  initialNouveautes,
  initialTotal,
  initialDensifiedTotal,
  initialVenues,
  initialGenreSlugs,
  communes,
  genresLegend,
  initialYear,
  initialMonth,
  initialNouveauFilmIds = [],
  initialRecoByScope,
  initialListByScope,
  initialOpenKey = null,
  initialOpenItem = null,
  initialRelatedItems = [],
  initialAussiCeSoir = [],
}: Props) {
  const { track, trackItem, tasteState, sessionStatus } = useSignals();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [timeScope, setTimeScope] = useState<TimeScopeId>(initialScope);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(
    initialOpenKey ?? null,
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLieuId, setSelectedLieuId] = useState<string | null>(null);
  const [selectedCommune, setSelectedCommune] = useState<string | null>('Toulouse');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [phraseTags, setPhraseTags] = useState<PhraseTags | null>(null);
  const [showMonthPanel, setShowMonthPanel] = useState(false);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [visibleCount, setVisibleCount] = useState(AGENDA_PAGE_SIZE);

  const [listItems, setListItems] = useState<DayItem[]>(initialItems);
  const [recoPoolByKey, setRecoPoolByKey] = useState<Record<string, DayItem[]>>(
    () => hydrateRecoCache(initialRecoByScope, initialParisIso, 'Toulouse'),
  );
  const [nouveautesItems, setNouveautesItems] =
    useState<DayItem[]>(initialNouveautes);
  const [nouveauFilmIdSet, setNouveauFilmIdSet] = useState<Set<string>>(
    () => new Set(initialNouveauFilmIds),
  );
  const [total, setTotal] = useState(initialTotal);
  const [densifiedTotalApi, setDensifiedTotalApi] = useState(
    initialDensifiedTotal,
  );
  const [venueOptions, setVenueOptions] = useState<Lieu[]>(initialVenues);
  const [availableGenreSlugs, setAvailableGenreSlugs] =
    useState<string[]>(initialGenreSlugs);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [detailItem, setDetailItem] = useState<DayItem | null>(
    initialOpenItem ?? null,
  );
  const [relatedFilmItems, setRelatedFilmItems] = useState<DayItem[]>(
    initialRelatedItems,
  );
  const [aussiCeSoirItems, setAussiCeSoirItems] = useState<DayItem[]>(
    initialAussiCeSoir,
  );

  const skipListFetch = useRef(true);
  const listFetchGen = useRef(0);
  const recoFetchGen = useRef(0);
  const recoWipedRef = useRef(false);
  const recoPoolByKeyRef = useRef(recoPoolByKey);
  recoPoolByKeyRef.current = recoPoolByKey;
  const tasteStateRef = useRef(tasteState);
  tasteStateRef.current = tasteState;
  const recoKindRef = useRef<RecoKind>('guest');
  const listLoadingRef = useRef(false);
  const detailFetchGen = useRef(0);
  const [listFetchSlow, setListFetchSlow] = useState(false);
  const listSlowTimerRef = useRef<number | null>(null);

  function startListSlowWatch(gen: number) {
    if (gen !== listFetchGen.current) return;
    if (listSlowTimerRef.current != null) {
      window.clearTimeout(listSlowTimerRef.current);
    }
    setListFetchSlow(false);
    listSlowTimerRef.current = window.setTimeout(() => {
      if (gen === listFetchGen.current) setListFetchSlow(true);
    }, 1000);
  }

  function stopListSlowWatch(gen: number) {
    if (gen !== listFetchGen.current) return;
    if (listSlowTimerRef.current != null) {
      window.clearTimeout(listSlowTimerRef.current);
      listSlowTimerRef.current = null;
    }
    setListFetchSlow(false);
  }

  const isPhraseScope = true;

  const titleSearchPending = useRef(false);

  // Client fallback: `?e=` / `?id=` when SSR did not pass a key (client nav).
  useEffect(() => {
    if (initialOpenKey) return;
    const params = new URLSearchParams(window.location.search);
    const key = normalizeDeepLinkId(params.get('e') || params.get('id') || '');
    if (key) setSelectedItemKey(key);
  }, [initialOpenKey]);

  function applyPhraseFromQuery(text: string) {
    const q = text.trim();
    if (!q) {
      titleSearchPending.current = false;
      setPhraseTags(null);
      return;
    }
    const rules = parsePhraseRules(q);
    if (hasPhraseSignal(rules)) {
      titleSearchPending.current = false;
      setPhraseTags(rules);
      return;
    }
    titleSearchPending.current = true;
    setPhraseTags(emptyPhraseTags('rules'));
  }

  // Title search: debounce 250ms. Phrase rules apply on the same keystroke.
  useEffect(() => {
    if (isPhraseScope) return;
    if (query.trim() === '') {
      setDebouncedQuery('');
      return;
    }
    const id = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, isPhraseScope]);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q || isPhraseScope) return;
    track({
      kind: 'search',
      query: q,
      moods: extractMoods(q),
      genres: [],
    });
  }, [debouncedQuery, isPhraseScope]); // eslint-disable-line react-hooks/exhaustive-deps

  function requestPhraseAi(phrase: string) {
    const rules = parsePhraseRules(phrase);
    if (hasPhraseSignal(rules)) return;
    void (async () => {
      try {
        const res = await fetch('/api/phrase-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phrase }),
        });
        if (!res.ok) throw new Error('phrase-tags');
        const data = (await res.json()) as PhraseTags;
        if (query.trim() !== phrase) return;
        if (hasPhraseSignal(data)) setPhraseTags(data);
      } catch {
        /* keep title-q empty tags */
      }
    })();
  }

  function handleQueryChange(next: string) {
    setQuery(next);
    if (next.trim() === '') {
      setDebouncedQuery('');
      setPhraseTags(null);
      return;
    }
    if (isPhraseScope) applyPhraseFromQuery(next);
  }

  const queryTrimmed = query.trim();
  const phraseMode = isPhraseScope && queryTrimmed.length > 0;
  /** Immediate: chips, empty copy, count line, city chip look. Title search only. */
  const searchingUi = !isPhraseScope && queryTrimmed.length > 0;
  /** Debounced: date range, commune skip, matching. */
  const searching = !isPhraseScope && debouncedQuery.trim().length > 0;

  const scopeRange = useMemo(
    () =>
      resolveScopeRange(timeScope, selectedDay, new Date(), {
        year,
        month,
      }),
    [timeScope, selectedDay, year, month],
  );

  const contextLabel = useMemo(
    () => scopeContextLabel(timeScope, scopeRange),
    [timeScope, scopeRange],
  );

  const phraseDateClash = Boolean(
    phraseMode &&
      (phraseTags?.date_from || phraseTags?.date_to) &&
      ((phraseTags?.date_from &&
        phraseTags.date_from > scopeRange.endIso) ||
        (phraseTags?.date_to && phraseTags.date_to < scopeRange.startIso)),
  );

  function applyList(data: AgendaListResponse, append = false) {
    if (!append && titleSearchPending.current) {
      titleSearchPending.current = false;
      const phrase = query.trim();
      if (phrase && data.total === 0 && !hasPhraseSignal(parsePhraseRules(phrase))) {
        requestPhraseAi(phrase);
      }
    }
    setListItems((prev) => (append ? [...prev, ...data.items] : data.items));
    if (!append) {
      setNouveautesItems(data.nouveautes ?? []);
      setTotal(data.total);
      setDensifiedTotalApi(data.densifiedTotal);
      setVenueOptions(data.venues ?? []);
      setAvailableGenreSlugs(data.genreSlugs ?? []);
    } else {
      setTotal(data.total);
      setDensifiedTotalApi(data.densifiedTotal);
    }
    if (data.counts) {
      setCounts(new Map(Object.entries(data.counts)));
    }
    if (!append && data.nouveauFilmIds) {
      setNouveauFilmIdSet(new Set(data.nouveauFilmIds));
    }
  }

  const recoWiped = Boolean(
    tasteState &&
      profileHasZeroWeights(tasteState.profile) &&
      !profileHasChipWeight(tasteState.profile),
  );
  recoWipedRef.current = recoWiped;
  const recoKind: RecoKind = recoWiped
    ? 'wiped'
    : tasteState && profileHasChipWeight(tasteState.profile)
      ? 'profile'
      : sessionStatus === 'authenticated' || sessionStatus === 'loading'
        ? 'pending'
        : 'guest';
  recoKindRef.current = recoKind;
  const currentRecoDay = recoKeyDay(timeScope, selectedDay, initialParisIso);
  const currentRecoKey = recoPoolKey(
    timeScope,
    currentRecoDay,
    selectedCommune,
    recoKind,
  );
  const recoReady =
    !recoWiped &&
    Object.prototype.hasOwnProperty.call(recoPoolByKey, currentRecoKey);

  useEffect(() => {
    if (recoWiped) {
      setRecoPoolByKey({});
      clearProfileRecoCache();
      return;
    }
    if (recoKind === 'pending') return;
    // Guest boot cache / profile prefetch / session cache: never POST a filled key.
    if (recoPoolByKeyRef.current[currentRecoKey] !== undefined) {
      return;
    }
    const key = currentRecoKey;
    let cancelled = false;
    const gen = ++recoFetchGen.current;
    const params = new URLSearchParams();
    params.set('reco', '1');
    const profile = tasteStateRef.current?.profile;
    const sendProfile = recoKind === 'profile';
    void (async () => {
      try {
        const res = await fetch(`/api/agenda?${params.toString()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope: timeScope,
            date: currentRecoDay,
            commune: selectedCommune,
            year,
            month,
            profile: sendProfile && profile
              ? {
                  moods: profile.moods,
                  genres: profile.genres,
                  themes: profile.themes,
                }
              : undefined,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as AgendaListResponse;
        if (cancelled || gen !== recoFetchGen.current) return;
        if (recoWipedRef.current) return;
        setRecoPoolByKey((prev) => {
          const next = {
            ...prev,
            [key]: data.items ?? [],
          };
          if (key.endsWith('|profile') && recoKindRef.current === 'profile') {
            writeProfileRecoCache(initialParisIso, selectedCommune, next);
          }
          return next;
        });
      } catch {
        /* do not paint another scope's pool */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedCommune,
    year,
    month,
    timeScope,
    selectedDay,
    currentRecoDay,
    recoWiped,
    recoKind,
    currentRecoKey,
    initialParisIso,
  ]);

  // After mount, a taste profile prefetches boot scopes (same POST reco=1). Guest stays on boot.
  // Do not cancel successful writes — JWT/tasteState identity must not drop a finished POST.
  useEffect(() => {
    if (recoKind !== 'profile') return;
    const commune = selectedCommune;
    const profile = tasteStateRef.current?.profile;
    if (!profile) return;
    const jobs = RECO_BOOT_SCOPES.map((scope) => {
      const day = recoKeyDay(scope, null, initialParisIso);
      return {
        scope,
        day,
        key: recoPoolKey(scope, day, commune, 'profile'),
      };
    }).filter((job) => recoPoolByKeyRef.current[job.key] === undefined);
    if (jobs.length === 0) return;
    void Promise.all(
      jobs.map(async (job) => {
        try {
          const params = new URLSearchParams();
          params.set('reco', '1');
          const res = await fetch(`/api/agenda?${params.toString()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scope: job.scope,
              date: job.day,
              commune,
              year,
              month,
              profile: {
                moods: profile.moods,
                genres: profile.genres,
                themes: profile.themes,
              },
            }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as AgendaListResponse;
          if (recoWipedRef.current) return;
          setRecoPoolByKey((prev) => {
            const next = {
              ...prev,
              [job.key]: data.items ?? [],
            };
            if (recoKindRef.current === 'profile') {
              writeProfileRecoCache(initialParisIso, commune, next);
            }
            return next;
          });
        } catch {
          /* leave key empty */
        }
      }),
    );
  }, [recoKind, selectedCommune, year, month, initialParisIso]);

  // Reload first-paint: merge public profile card cache (no tastes / email).
  useEffect(() => {
    const cached = readProfileRecoCache(initialParisIso, selectedCommune);
    if (Object.keys(cached).length === 0) return;
    setRecoPoolByKey((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, items] of Object.entries(cached)) {
        if (next[key] === undefined) {
          next[key] = items;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initialParisIso, selectedCommune]);

  // Drop another account's profile cache when the session is gone.
  useEffect(() => {
    if (sessionStatus !== 'unauthenticated') return;
    clearProfileRecoCache();
    setRecoPoolByKey((prev) => {
      let changed = false;
      const next: Record<string, DayItem[]> = {};
      for (const [key, items] of Object.entries(prev)) {
        if (key.endsWith('|profile') || key.endsWith('|pending')) {
          changed = true;
          continue;
        }
        next[key] = items;
      }
      return changed ? next : prev;
    });
  }, [sessionStatus]);


  useEffect(() => {
    if (skipListFetch.current) {
      skipListFetch.current = false;
      return;
    }
    if (isPhraseScope && query.trim() && phraseTags === null) return;
    const gen = ++listFetchGen.current;
    const delay = isPhraseScope && query.trim() ? PHRASE_FETCH_MS : 0;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled || gen !== listFetchGen.current) return;
      const params = buildAgendaParams({
        scope: timeScope,
        commune: selectedCommune,
        q: isPhraseScope ? query.trim() : debouncedQuery.trim(),
        cats: selectedCategories,
        genres: selectedGenres,
        lieuId: selectedLieuId,
        selectedDate: selectedDay,
        year,
        month,
        includeCounts: showMonthPanel,
        includeListMeta: true,
        phraseMode: isPhraseScope && query.trim().length > 0,
        phraseTags,
      });
      startListSlowWatch(gen);
      void (async () => {
        try {
          const res = await fetch(`/api/agenda?${params.toString()}`);
          if (!res.ok) return;
          const data = (await res.json()) as AgendaListResponse;
          if (cancelled || gen !== listFetchGen.current) return;
          applyList(data);
        } catch {
          /* keep previous window */
        } finally {
          stopListSlowWatch(gen);
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      stopListSlowWatch(gen);
    };
  }, [
    timeScope,
    selectedDay,
    year,
    month,
    query,
    debouncedQuery,
    selectedCommune,
    selectedLieuId,
    selectedCategories,
    selectedGenres,
    showMonthPanel,
    phraseTags,
    isPhraseScope,
  ]);

  useEffect(() => {
    setSelectedGenres((prev) => {
      if (prev.length === 0) return prev;
      if (selectedCategories.length === 0) return [];
      const legendBySlug = new Map(genresLegend.map((g) => [g.slug, g]));
      const next = prev.filter((slug) => {
        if (!availableGenreSlugs.includes(slug)) return false;
        const g = legendBySlug.get(slug);
        if (g) return genreBelongsToMains(g, selectedCategories);
        const m = mainFromGenreSlug(slug);
        return m != null && selectedCategories.includes(m);
      });
      return next.length === prev.length ? prev : next;
    });
  }, [availableGenreSlugs, selectedCategories, genresLegend]);

  /** Pour toi: exact currentRecoKey only. Missing profile/pending → [] (skeleton). */
  const pourToiItems = useMemo(() => {
    if (recoWiped) return [];
    return recoPoolByKey[currentRecoKey] ?? [];
  }, [recoPoolByKey, currentRecoKey, recoWiped]);

  const pourToiKeys = useMemo(
    () => new Set(pourToiItems.map((item) => item.key)),
    [pourToiItems],
  );
  const pourToiFilmIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of pourToiItems) {
      const fid = filmIdOfItem(item);
      if (fid) ids.add(fid);
    }
    return ids;
  }, [pourToiItems]);
  const packFilmIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of nouveautesItems) {
      const fid = filmIdOfItem(item);
      if (fid) ids.add(fid);
    }
    return ids;
  }, [nouveautesItems]);

  /** Main grid minus pack + Pour toi keys/film_ids so nothing is listed twice. */
  const gridItems = useMemo(() => {
    if (
      packFilmIds.size === 0 &&
      pourToiKeys.size === 0 &&
      pourToiFilmIds.size === 0
    ) {
      return listItems;
    }
    return listItems.filter((item) => {
      if (pourToiKeys.has(item.key)) return false;
      const fid = filmIdOfItem(item);
      if (fid && packFilmIds.has(fid)) return false;
      if (fid && pourToiFilmIds.has(fid)) return false;
      return true;
    });
  }, [listItems, packFilmIds, pourToiKeys, pourToiFilmIds]);

  /** Cards after film_id / créneau collapse — pack included, not doubled. */
  const pourToiCardCount = useMemo(
    () => densifiedCardCount(pourToiItems),
    [pourToiItems],
  );
  const packCardCount = useMemo(
    () => densifiedCardCount(nouveautesItems),
    [nouveautesItems],
  );
  const showCinemaPack =
    packCardCount > 0 &&
    !phraseMode &&
    !searchingUi &&
    catsAllowCinemaPack(selectedCategories);
  const visiblePackCount = showCinemaPack ? packCardCount : 0;
  const gridCardCount = useMemo(
    () => densifiedCardCount(gridItems),
    [gridItems],
  );
  const haveAllItems = listItems.length >= total;
  const densifiedTotal = haveAllItems
    ? pourToiCardCount + visiblePackCount + gridCardCount
    : Math.max(densifiedTotalApi, pourToiCardCount + visiblePackCount + gridCardCount);

  // Reset infinite-scroll window when scope / filters / query change.
  useEffect(() => {
    setVisibleCount(AGENDA_PAGE_SIZE);
  }, [
    timeScope,
    selectedDay,
    year,
    month,
    query,
    selectedCommune,
    selectedLieuId,
    selectedCategories,
    selectedGenres,
  ]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((c) => c + AGENDA_PAGE_SIZE);
    if (listItems.length >= total) return;
    if (listLoadingRef.current) return;
    listLoadingRef.current = true;
    const gen = ++listFetchGen.current;
    startListSlowWatch(gen);
    const params = buildAgendaParams({
      scope: timeScope,
      commune: selectedCommune,
      q: isPhraseScope ? query.trim() : debouncedQuery.trim(),
      cats: selectedCategories,
      genres: selectedGenres,
      lieuId: selectedLieuId,
      selectedDate: selectedDay,
      year,
      month,
      offset: listItems.length,
      includeCounts: showMonthPanel,
      phraseMode: isPhraseScope && query.trim().length > 0,
      phraseTags,
    });
    void fetch(`/api/agenda?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AgendaListResponse | null) => {
        if (!data || gen !== listFetchGen.current) return;
        applyList(data, true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (gen === listFetchGen.current) listLoadingRef.current = false;
        stopListSlowWatch(gen);
      });
  }, [
    listItems.length,
    total,
    timeScope,
    selectedCommune,
    query,
    debouncedQuery,
    selectedCategories,
    selectedGenres,
    selectedLieuId,
    selectedDay,
    year,
    month,
    showMonthPanel,
    phraseTags,
    isPhraseScope,
  ]);

  const selectedItem =
    detailItem ??
    listItems.find((i) => i.key === selectedItemKey) ??
    pourToiItems.find((i) => i.key === selectedItemKey) ??
    nouveautesItems.find((i) => i.key === selectedItemKey) ??
    null;

  useEffect(() => {
    if (!selectedItemKey) {
      setDetailItem(null);
      setRelatedFilmItems([]);
      setAussiCeSoirItems([]);
      return;
    }
    const slim =
      listItems.find((i) => i.key === selectedItemKey) ??
      pourToiItems.find((i) => i.key === selectedItemKey) ??
      nouveautesItems.find((i) => i.key === selectedItemKey) ??
      null;
    if (slim) {
      setDetailItem(slim);
      // Track immediately from the slim card already on screen so a
      // cancelled / slow detail fetch cannot skip the signal (no F5).
      trackItem(slim, 'open_card');
    }
    const gen = ++detailFetchGen.current;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/agenda?id=${encodeURIComponent(selectedItemKey)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as AgendaDetailResponse;
        if (cancelled || gen !== detailFetchGen.current) return;
        setDetailItem(data.item);
        setRelatedFilmItems(data.relatedItems ?? []);
        setAussiCeSoirItems(data.aussiCeSoir ?? []);
        if (!slim) trackItem(data.item, 'open_card');
      } catch {
        /* slim already shown + tracked; keep fiche as-is */
      }
    })();
    return () => {
      cancelled = true;
    };
    // track by key so reopening the same fiche dedups in 30 min
  }, [selectedItemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const showDateLabels = !searching && scopeRange.days.length > 1;

  function syncMonthFromIso(iso: string) {
    const [y, m] = iso.split('-').map(Number);
    if (y && m) {
      setYear(y);
      setMonth(m);
    }
  }

  function handleScopeChange(scope: TimeScopeId) {
    if (scope !== timeScope && scope !== 'tous') {
      track({ kind: 'chip_time', chip: scope, genres: [], moods: [] });
    }
    setTimeScope(scope);
    setSelectedItemKey(null);
    const reuseBoot =
      selectedCommune === 'Toulouse' &&
      selectedCategories.length === 0 &&
      selectedGenres.length === 0 &&
      !selectedLieuId &&
      !query.trim();
    const snap = reuseBoot ? initialListByScope?.[scope] : undefined;
    const applySnapshot = () => {
      if (snap) {
        setListItems(snap.items);
        setNouveautesItems(snap.nouveautes);
        setTotal(snap.total);
        setDensifiedTotalApi(snap.densifiedTotal);
        setVenueOptions(snap.venues ?? []);
        skipListFetch.current = true;
        return true;
      }
      return false;
    };
    if (scope === 'tous') {
      listFetchGen.current += 1;
      setSelectedDay(null);
      setShowMonthPanel(false);
      setYear(initialYear);
      setMonth(initialMonth);
      setVisibleCount(AGENDA_PAGE_SIZE);
      if (reuseBoot && !applySnapshot()) {
        setListItems(initialItems);
        setNouveautesItems(initialNouveautes);
        setTotal(initialTotal);
        setDensifiedTotalApi(initialDensifiedTotal);
        setVenueOptions(initialVenues);
        skipListFetch.current = true;
      }
      return;
    }
    if (reuseBoot && snap) {
      listFetchGen.current += 1;
      setVisibleCount(AGENDA_PAGE_SIZE);
      applySnapshot();
    }
    if (scope === 'date') {
      const day = selectedDay || initialParisIso;
      setSelectedDay(day);
      syncMonthFromIso(day);
      setShowMonthPanel(true);
    } else if (scope === 'aujourdhui' || scope === 'soir') {
      setSelectedDay(initialParisIso);
      syncMonthFromIso(initialParisIso);
    } else {
      const next = resolveScopeRange(scope, selectedDay);
      syncMonthFromIso(next.startIso);
    }
  }

  /** Month arrows always switch to Date scope so the list matches the calendar month. */
  function goPrevMonth() {
    const nextYear = month === 1 ? year - 1 : year;
    const nextMonth = month === 1 ? 12 : month - 1;
    setTimeScope('date');
    setSelectedDay(null);
    setSelectedItemKey(null);
    setYear(nextYear);
    setMonth(nextMonth);
    setShowMonthPanel(true);
  }

  function goNextMonth() {
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    setTimeScope('date');
    setSelectedDay(null);
    setSelectedItemKey(null);
    setYear(nextYear);
    setMonth(nextMonth);
    setShowMonthPanel(true);
  }

  function handleSelectDay(iso: string) {
    setTimeScope('date');
    setSelectedDay(iso);
    syncMonthFromIso(iso);
    setSelectedItemKey(null);
    setShowMonthPanel(true);
  }

  function handleSelectVenue(lieuId: string) {
    setSelectedLieuId(lieuId);
  }

  function handleCommuneChange(next: string | null) {
    setSelectedCommune(next);
    if (selectedLieuId) {
      const lieu = venueOptions.find((l) => l.lieu_id === selectedLieuId);
      if (
        next != null &&
        (!lieu || normalizeCommune(lieu.commune) !== normalizeCommune(next))
      ) {
        setSelectedLieuId(null);
      }
    }
  }

  function handleCategoriesChange(next: string[]) {
    const added = next.filter((c) => !selectedCategories.includes(c));
    setSelectedCategories(next);
    if (next.length === 0) {
      setSelectedGenres([]);
    }
    for (const chip of added) {
      track({ kind: 'chip_cat', chip, categorie: chip, genres: [], moods: [] });
    }
  }

  function handleGenresChange(next: string[]) {
    const added = next.filter((g) => !selectedGenres.includes(g));
    setSelectedGenres(next);
    for (const chip of added) {
      track({ kind: 'chip_genre', chip, genres: [chip], moods: extractMoods(chip) });
    }
  }

  function fallbackToWeekend() {
    setTimeScope('weekend');
    setSelectedItemKey(null);
    const next = resolveScopeRange('weekend', null);
    syncMonthFromIso(next.startIso);
  }

  const monthLabel = `${MONTH_NAMES_FR[month - 1]} ${year}`;
  const n = densifiedTotal;
  const shown = pourToiCardCount + visiblePackCount + Math.min(visibleCount, gridCardCount);
  const countLabel =
    n === 0
      ? `0 ${evenementWord(0)}`
      : shown < n
        ? `${shown} sur ${n} ${evenementWord(n)}`
        : `${n} ${evenementWord(n)}`;
  const rangeLabel = searchingUi ? 'toutes dates' : contextLabel;
  const emptyScopeHint =
    timeScope === 'tous'
      ? 'à venir'
      : timeScope === 'aujourdhui'
        ? "aujourd'hui"
        : timeScope === 'soir'
          ? 'ce soir'
          : timeScope === 'weekend'
            ? 'ce week-end'
            : timeScope === 'semaine'
              ? 'cette semaine'
              : selectedDay
                ? `le ${contextLabel}`
                : contextLabel;

  const monthCalendar = (
    <MonthCalendar
      year={year}
      month={month}
      selectedDay={timeScope === 'date' ? selectedDay : null}
      counts={counts}
      onSelectDay={handleSelectDay}
      onPrevMonth={goPrevMonth}
      onNextMonth={goNextMonth}
      embedded
    />
  );

  const filterBadge =
    selectedGenres.length +
    (selectedLieuId ? 1 : 0) +
    (selectedCommune !== 'Toulouse' ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl min-w-0 overflow-x-hidden px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
      <header className="mb-2 sm:mb-4">
        <p className="hidden text-xs font-medium uppercase tracking-[0.2em] text-culture-terracotta sm:block">
          Toulouse & alentours
        </p>
        <h1 className="font-display text-2xl text-culture-ink sm:mt-1 sm:text-4xl">
          Agenda
        </h1>
        <p className="mt-2 hidden max-w-2xl text-sm text-culture-muted sm:block sm:text-base">
          Qu&apos;est-ce qu&apos;on fait ce soir ou ce week-end dans la région toulousaine&nbsp;?
        </p>
      </header>

      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-culture-line/80 bg-culture-cream/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:mb-5 sm:px-6">
        <SearchOmnibox
          value={query}
          onChange={handleQueryChange}
          placeholder="Qu’est-ce qui te ferait vibrer ?"
        />
      </div>

      <div className="space-y-2.5 sm:space-y-4">
        <TimeScopeBar
          scope={timeScope}
          onChange={handleScopeChange}
        />

        <CategoryFilter
          selected={selectedCategories}
          onChange={handleCategoriesChange}
          variant="chips"
        />

        <div className="md:hidden">
          <button
            type="button"
            onClick={() => setShowFiltersMobile((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-culture-line bg-culture-surface px-3 py-1.5 text-sm font-medium text-culture-ink hover:border-culture-terracotta/50"
            aria-expanded={showFiltersMobile}
          >
            Filtres
            {filterBadge > 0 ? (
              <span className="rounded-full bg-culture-terracotta px-1.5 text-xs text-white">
                {filterBadge}
              </span>
            ) : null}
            <span aria-hidden className="text-culture-muted">
              {showFiltersMobile ? '▴' : '▾'}
            </span>
          </button>
        </div>

        {/* Genre (and not categories): collapsed behind Filtres on mobile; always on md+ */}
        <div
          className={
            (showFiltersMobile ? 'flex' : 'hidden') +
            ' flex-col gap-2.5 md:flex md:gap-4'
          }
        >
          <GenreFilter
            availableSlugs={availableGenreSlugs}
            legend={genresLegend}
            selected={selectedGenres}
            onChange={handleGenresChange}
            selectedMains={selectedCategories}
            hideWhenNoCategory
          />
        </div>

        {/* Count + Venue chip on one row (Venue also gated by Filtres on mobile) */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-0.5 sm:pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-sm text-culture-muted">
              <span className="font-medium text-culture-ink">
                {countLabel}
              </span>
              {rangeLabel ? ` · ${rangeLabel}` : ''}
              {queryTrimmed ? ` · « ${queryTrimmed} »` : ''}
            </p>
            <div
              className={
                (showFiltersMobile ? 'flex' : 'hidden') +
                ' min-w-0 flex-wrap items-center gap-2 md:flex'
              }
            >
              <CityFilter
                communes={communes}
                selectedCommune={selectedCommune}
                onChange={handleCommuneChange}
                variant="inline"
                inactive={searchingUi}
              />
              <VenueFilter
                lieux={venueOptions}
                selectedLieuId={selectedLieuId}
                onChange={setSelectedLieuId}
                variant="inline"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowMonthPanel((v) => !v)}
            className="text-sm font-medium text-culture-terracotta hover:underline"
            aria-expanded={showMonthPanel}
          >
            {showMonthPanel ? 'Masquer le mois' : 'Voir le mois'}
            {showMonthPanel ? '' : ` (${monthLabel})`}
          </button>
        </div>

        {listFetchSlow ? (
          <div
            className="pointer-events-none flex justify-center"
            style={{ marginTop: 8 }}
          >
            <ListWaitDots />
          </div>
        ) : null}

        <MonthCalendarDrawer
          open={showMonthPanel}
          onClose={() => setShowMonthPanel(false)}
          title={monthLabel}
        >
          {monthCalendar}
        </MonthCalendarDrawer>

        <section className="space-y-3 rounded-card-lg border border-culture-soft/80 bg-culture-surface/80 p-3 sm:p-4">
          <h2 className="font-display text-xl text-culture-ink sm:text-2xl">
            Ton top 3 du moment
          </h2>
          {!recoReady && !recoWiped ? (
            <Top3Skeleton />
          ) : (
            <SeanceGrid
              items={pourToiItems}
              showDate={showDateLabels}
              onSelectItem={setSelectedItemKey}
              onSelectVenue={handleSelectVenue}
              empty={null}
              nouveauFilmIds={nouveauFilmIdSet}
              fixedSlots
            />
          )}
        </section>

        {showCinemaPack ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-culture-terracotta">
              Sorties cette semaine
            </h2>
            <SeanceGrid
              items={nouveautesItems}
              showDate={false}
              onSelectItem={setSelectedItemKey}
              onSelectVenue={handleSelectVenue}
              empty={null}
              nouveauFilmIds={nouveauFilmIdSet}
            />
          </section>
        ) : null}

        <SeanceGrid
          items={gridItems}
          showDate={showDateLabels}
          onSelectItem={setSelectedItemKey}
          onSelectVenue={handleSelectVenue}
          visibleCount={visibleCount}
          onLoadMore={handleLoadMore}
          hasMoreRemote={listItems.length < total}
          nouveauFilmIds={nouveauFilmIdSet}
          empty={
            showCinemaPack || pourToiItems.length > 0 ? null : phraseMode ? (
              <div className="rounded-2xl border border-dashed border-culture-line bg-culture-surface px-6 py-12 text-center">
                <p className="font-display text-xl text-culture-ink">
                  Aucun résultat
                </p>
                <p className="mt-2 text-sm text-culture-muted">
                  {phraseDateClash
                    ? 'Rien sur cette période — élargis les dates.'
                    : 'Essaie une autre phrase, ou efface le champ.'}
                </p>
                <button
                  type="button"
                  onClick={() => handleQueryChange('')}
                  className="mt-5 rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-culture-clay"
                >
                  Effacer
                </button>
              </div>
            ) : searchingUi ? (
              <div className="rounded-2xl border border-dashed border-culture-line bg-culture-surface px-6 py-12 text-center">
                <p className="font-display text-xl text-culture-ink">
                  Aucun résultat pour « {queryTrimmed} »
                </p>
                <p className="mt-2 text-sm text-culture-muted">
                  Rien sur les dates à venir. Essaie un autre mot, ou efface la
                  recherche.
                </p>
                <button
                  type="button"
                  onClick={() => handleQueryChange('')}
                  className="mt-5 rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-culture-clay"
                >
                  Effacer la recherche
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-culture-line bg-culture-surface px-6 py-12 text-center">
                <p className="font-display text-xl text-culture-ink">
                  Rien {emptyScopeHint}
                  {selectedCategories.length > 0 ? ' pour cette catégorie' : ''}
                </p>
                <p className="mt-2 text-sm text-culture-muted">
                  Essaie une autre période, une autre catégorie, ou élargis la
                  recherche.
                </p>
                {timeScope === 'soir' && (
                  <button
                    type="button"
                    onClick={() => handleScopeChange('aujourdhui')}
                    className="mt-5 mr-2 rounded-full border border-culture-terracotta bg-white px-5 py-2.5 text-sm font-semibold text-culture-terracotta shadow-sm transition hover:bg-culture-soft"
                  >
                    Voir aujourd&apos;hui
                  </button>
                )}
                {timeScope !== 'weekend' && (
                  <button
                    type="button"
                    onClick={fallbackToWeekend}
                    className="mt-5 rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-culture-clay"
                  >
                    Voir ce week-end
                  </button>
                )}
                {timeScope === 'weekend' && selectedCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCategoriesChange([])}
                    className="mt-5 rounded-full border border-culture-line bg-culture-surface px-5 py-2.5 text-sm font-medium text-culture-ink hover:border-culture-terracotta/50"
                  >
                    Toutes les catégories
                  </button>
                )}
              </div>
            )
          }
        />

        <LoginNudge />
      </div>

      <EventDetail
        item={selectedItem}
        onClose={() => setSelectedItemKey(null)}
        onSelectVenue={handleSelectVenue}
        relatedItems={relatedFilmItems}
        aussiCeSoirItems={aussiCeSoirItems}
        onSelectItem={setSelectedItemKey}
        onAgenda={() => selectedItem && trackItem(selectedItem, 'agenda_add')}
        onIcs={() => selectedItem && trackItem(selectedItem, 'ics')}
        onReserve={() => selectedItem && trackItem(selectedItem, 'reserve')}
        selectedCommune={selectedCommune}
        selectedLieuId={selectedLieuId}
      />
    </div>
  );
}
