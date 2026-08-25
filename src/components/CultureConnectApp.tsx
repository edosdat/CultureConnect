'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { DayItem, GenreLegend, Lieu } from '@/lib/types';
import type { AgendaDetailResponse, AgendaListResponse } from '@/lib/slim';
import { recommendForProfile, recommendForTastes } from '@/lib/reco';
import { extractMoods, hasScorableState } from '@/lib/signals';
import { useTastesUi } from './Providers';
import { useSignals } from './SignalsProvider';
import { densifiedCardCount } from '@/lib/densify';
import { filmIdOfItem } from '@/lib/nouveautesCine';
import { genreBelongsToMains, mainFromGenreSlug } from '@/lib/categories';
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
import TimeScopeBar from './TimeScopeBar';
import SearchOmnibox from './SearchOmnibox';
import EventDetail from './EventDetail';
import LoginNudge from './LoginNudge';
import {
  hasPhraseSignal,
  parsePhraseRules,
  type PhraseTags,
} from '@/lib/phraseTags';

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
};

function sortieWord(n: number): string {
  return n <= 1 ? 'sortie' : 'sorties';
}

function normalizeCommune(c: string | null | undefined): string {
  return (c || '').trim().toLocaleLowerCase('fr');
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
  phraseTags?: PhraseTags | null;
  phraseMode?: boolean;
}): URLSearchParams {
  const p = new URLSearchParams();
  p.set('scope', opts.scope);
  if (opts.commune) p.set('commune', opts.commune);
  if (opts.phraseMode) {
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
  if (opts.selectedDate) p.set('date', opts.selectedDate);
  p.set('year', String(opts.year));
  p.set('month', String(opts.month));
  if (opts.offset) p.set('offset', String(opts.offset));
  if (opts.includeCounts) p.set('counts', '1');
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
}: Props) {
  const { data: session } = useSession();
  const { openTastes } = useTastesUi();
  const { track, trackItem } = useSignals();
  const tasteState = session?.user?.tasteState ?? null;
  const tastes =
    tasteState?.tastesText?.trim() || session?.user?.tastes?.trim() || '';
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [timeScope, setTimeScope] = useState<TimeScopeId>(initialScope);
  const [selectedDay, setSelectedDay] = useState<string | null>(initialParisIso);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
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
  const [nouveautesItems, setNouveautesItems] =
    useState<DayItem[]>(initialNouveautes);
  const [total, setTotal] = useState(initialTotal);
  const [densifiedTotalApi, setDensifiedTotalApi] = useState(
    initialDensifiedTotal,
  );
  const [venueOptions, setVenueOptions] = useState<Lieu[]>(initialVenues);
  const [availableGenreSlugs, setAvailableGenreSlugs] =
    useState<string[]>(initialGenreSlugs);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [detailItem, setDetailItem] = useState<DayItem | null>(null);
  const [relatedFilmItems, setRelatedFilmItems] = useState<DayItem[]>([]);
  const [aussiCeSoirItems, setAussiCeSoirItems] = useState<DayItem[]>([]);

  const skipListFetch = useRef(true);
  const listFetchGen = useRef(0);
  const detailFetchGen = useRef(0);

  const isPhraseScope = true;

  function applyPhraseFromQuery(text: string) {
    const q = text.trim();
    if (!q) {
      setPhraseTags(null);
      return;
    }
    const rules = parsePhraseRules(q);
    setPhraseTags(hasPhraseSignal(rules) ? rules : null);
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

  // AI only when rules yield nothing. Do not refetch on rules.
  useEffect(() => {
    if (!isPhraseScope) return;
    const q = query.trim();
    if (!q) return;
    const rules = parsePhraseRules(q);
    if (hasPhraseSignal(rules)) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch('/api/phrase-tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phrase: q }),
          });
          if (!res.ok) throw new Error('phrase-tags');
          const data = (await res.json()) as PhraseTags;
          if (!cancelled) setPhraseTags(data);
        } catch {
          if (!cancelled) {
            setPhraseTags({
              moods: [],
              genres: [],
              themes: [],
              entities: [],
              source: 'ai',
              date_from: rules.date_from,
              date_to: rules.date_to,
            });
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query, isPhraseScope]);

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
  }

  useEffect(() => {
    if (skipListFetch.current) {
      skipListFetch.current = false;
      return;
    }
    // Phrase typed but tags not ready (AI path): do not refetch the raw list.
    if (isPhraseScope && query.trim() && !phraseTags) return;
    const gen = ++listFetchGen.current;
    const delay = isPhraseScope && query.trim() ? PHRASE_FETCH_MS : 0;
    let cancelled = false;
    const id = window.setTimeout(() => {
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
        phraseMode: isPhraseScope && query.trim().length > 0,
        phraseTags,
      });
      void (async () => {
        try {
          const res = await fetch(`/api/agenda?${params.toString()}`);
          if (!res.ok) return;
          const data = (await res.json()) as AgendaListResponse;
          if (cancelled || gen !== listFetchGen.current) return;
          applyList(data);
        } catch {
          /* keep previous window */
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
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

  /** Pour toi = profile first (clicks), tastesText last; same filtered listItems. */
  const pourToiItems = useMemo(() => {
    if (tasteState && hasScorableState(tasteState)) {
      return recommendForProfile(listItems, tasteState, 10).map((s) => s.item);
    }
    if (tastes) return recommendForTastes(listItems, tastes, 10).map((s) => s.item);
    return [];
  }, [listItems, tastes, tasteState]);

  const packFilmIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of nouveautesItems) {
      const fid = filmIdOfItem(item);
      if (fid) ids.add(fid);
    }
    return ids;
  }, [nouveautesItems]);

  /** Main grid minus pack film_ids so a novelty is not listed twice. */
  const gridItems = useMemo(() => {
    if (packFilmIds.size === 0) return listItems;
    return listItems.filter((item) => {
      const fid = filmIdOfItem(item);
      if (fid && packFilmIds.has(fid)) return false;
      return true;
    });
  }, [listItems, packFilmIds]);

  /** Cards after film_id / créneau collapse — pack included, not doubled. */
  const packCardCount = useMemo(
    () => densifiedCardCount(nouveautesItems),
    [nouveautesItems],
  );
  const gridCardCount = useMemo(
    () => densifiedCardCount(gridItems),
    [gridItems],
  );
  const haveAllItems = listItems.length >= total;
  const densifiedTotal = haveAllItems
    ? packCardCount + gridCardCount
    : Math.max(densifiedTotalApi, packCardCount + gridCardCount);

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
    const gen = ++listFetchGen.current;
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
      .catch(() => undefined);
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
    if (slim) setDetailItem(slim);
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
        trackItem(data.item, 'open_card');
      } catch {
        if (slim) trackItem(slim, 'open_card');
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
    if (scope !== timeScope) {
      track({ kind: 'chip_time', chip: scope, genres: [], moods: [] });
    }
    setTimeScope(scope);
    setSelectedItemKey(null);
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
  const shown = packCardCount + Math.min(visibleCount, gridCardCount);
  const countLabel =
    n === 0
      ? `0 ${sortieWord(0)}`
      : shown < n
        ? `${shown} sur ${n} ${sortieWord(n)}`
        : `${n} ${sortieWord(n)}`;
  const rangeLabel = searchingUi ? 'toutes dates' : contextLabel;
  const emptyScopeHint =
    timeScope === 'aujourdhui'
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
          Qu&apos;est-ce qu&apos;on fait ce soir ou ce week-end à Toulouse&nbsp;?
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

        <MonthCalendarDrawer
          open={showMonthPanel}
          onClose={() => setShowMonthPanel(false)}
          title={monthLabel}
        >
          {monthCalendar}
        </MonthCalendarDrawer>

        {session?.user && pourToiItems.length > 0 && (
          <section className="space-y-3 rounded-card-lg border border-culture-soft/80 bg-culture-surface/80 p-3 sm:p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-culture-terracotta">
                  Pour toi
                </p>
                <h2 className="font-display text-xl text-culture-ink sm:text-2xl">
                  Suggestions selon tes goûts
                </h2>
              </div>
              <button
                type="button"
                onClick={openTastes}
                className="text-sm font-medium text-culture-terracotta hover:underline"
              >
                Modifier mes goûts
              </button>
            </div>
            <SeanceGrid
              items={pourToiItems}
              showDate={showDateLabels}
              onSelectItem={setSelectedItemKey}
              onSelectVenue={handleSelectVenue}
              empty={null}
            />
          </section>
        )}

        {packCardCount > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-culture-terracotta">
              Nouveautés ciné
            </h2>
            <SeanceGrid
              items={nouveautesItems}
              showDate={false}
              onSelectItem={setSelectedItemKey}
              onSelectVenue={handleSelectVenue}
              empty={null}
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
          empty={
            packCardCount > 0 ? null : phraseMode ? (
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
      />
    </div>
  );
}
