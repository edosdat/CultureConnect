'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import type {
  DayItem,
  EventWithDetails,
  GenreLegend,
  Lieu,
  ProgrammeWithContext,
} from '@/lib/types';
import { recommendForTastes } from '@/lib/reco';
import { useTastesUi } from './Providers';
import {
  countItemsByDay,
  genresForSelection,
  itemsForDateRange,
  itemsForDay,
  lieuxForDay,
} from '@/lib/events';
import {
  filmIdOfItem,
  isCinemaDayItem,
  nouveautesCine,
  pickAussiCeSoir,
} from '@/lib/nouveautesCine';
import { genreBelongsToMains, mainFromGenreSlug } from '@/lib/categories';
import { MONTH_NAMES_FR, formatLieuAffiche } from '@/lib/labels';
import {
  defaultTimeScope,
  parisParts,
  resolveScopeRange,
  scopeContextLabel,
  upcomingRange,
  type TimeScopeId,
} from '@/lib/timeScope';
import CategoryFilter from './CategoryFilter';
import GenreFilter from './GenreFilter';
import CityFilter from './CityFilter';
import VenueFilter from './VenueFilter';
import MonthCalendar from './MonthCalendar';
import MonthCalendarDrawer from './MonthCalendarDrawer';
import SeanceGrid, { densifiedCardCount } from './SeanceGrid';
import TimeScopeBar from './TimeScopeBar';
import SearchOmnibox from './SearchOmnibox';
import EventDetail from './EventDetail';
import LoginNudge from './LoginNudge';
import {
  cachedNormalizedBlob,
  matchesNormalizedHaystack,
} from '@/lib/searchText';

type Props = {
  events: EventWithDetails[];
  programme: ProgrammeWithContext[];
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

function itemHeureDebut(item: DayItem): string {
  if (item.kind === 'programme') return (item.programme.heure_debut || '').trim();
  return (item.evenement.heure_debut || '').trim();
}

/** Ce soir: heure_debut >= 19:00; exclude period cards without a clock time. */
function startsAtOrAfter19(item: DayItem): boolean {
  const h = itemHeureDebut(item);
  if (!h || h.length < 4) return false;
  return h.slice(0, 5) >= '19:00';
}

const AGENDA_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

export default function CultureConnectApp({
  events,
  programme,
  genresLegend,
  initialYear,
  initialMonth,
}: Props) {
  const { data: session } = useSession();
  const { openTastes } = useTastesUi();
  const tastes = session?.user?.tastes?.trim() ?? '';
  const paris = useMemo(() => parisParts(), []);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  // SSR: Aujourd'hui; client: Ce soir after 17h Paris
  const [timeScope, setTimeScope] = useState<TimeScopeId>('aujourdhui');
  const [selectedDay, setSelectedDay] = useState<string | null>(paris.iso);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLieuId, setSelectedLieuId] = useState<string | null>(null);
  const [selectedCommune, setSelectedCommune] = useState<string | null>('Toulouse');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showMonthPanel, setShowMonthPanel] = useState(false);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [visibleCount, setVisibleCount] = useState(AGENDA_PAGE_SIZE);

  useEffect(() => {
    setTimeScope(defaultTimeScope());
  }, []);

  // Input stays instant; filtering/range wait ~250ms. Clearing flushes immediately.
  useEffect(() => {
    if (query.trim() === '') {
      setDebouncedQuery('');
      return;
    }
    const id = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  function handleQueryChange(next: string) {
    setQuery(next);
    if (next.trim() === '') setDebouncedQuery('');
  }

  const queryTrimmed = query.trim();
  /** Immediate: chips, empty copy, count line, city chip look. */
  const searchingUi = queryTrimmed.length > 0;
  /** Debounced: date range, commune skip, matching. */
  const searching = debouncedQuery.trim().length > 0;

  /** Furthest YYYY-MM-DD in loaded programme + events (for search widen). */
  const dataMaxIso = useMemo(() => {
    let max = '';
    for (const p of programme) {
      const d = (p.programme.date || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > max) max = d;
    }
    for (const e of events) {
      for (const raw of [e.date_debut, e.date_fin]) {
        const d = (raw || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > max) max = d;
      }
    }
    return max;
  }, [programme, events]);

  const scopeRange = useMemo(
    () =>
      resolveScopeRange(timeScope, selectedDay, new Date(), {
        year,
        month,
      }),
    [timeScope, selectedDay, year, month],
  );

  const range = useMemo(() => {
    // Search: ignore TimeScope for the date range — all upcoming dates.
    if (searching) {
      return upcomingRange(paris.iso, dataMaxIso, 90);
    }
    return scopeRange;
  }, [searching, paris.iso, dataMaxIso, scopeRange]);

  const contextLabel = useMemo(
    () => scopeContextLabel(timeScope, range),
    [timeScope, range],
  );

  /** All lieux appearing in programme + events (app scope). */
  const lieuxById = useMemo(() => {
    const byId = new Map<string, Lieu>();
    for (const p of programme) {
      if (p.lieu?.lieu_id) byId.set(p.lieu.lieu_id, p.lieu);
    }
    for (const e of events) {
      if (e.lieu?.lieu_id) byId.set(e.lieu.lieu_id, e.lieu);
    }
    return byId;
  }, [programme, events]);

  const communeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const lieu of lieuxById.values()) {
      const c = (lieu.commune || '').trim();
      if (c) set.add(c);
    }
    const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
    // Ensure Toulouse is present when in data (already is if in set)
    return list;
  }, [lieuxById]);

  const communeLieuIds = useMemo(() => {
    if (!selectedCommune) return null;
    const target = normalizeCommune(selectedCommune);
    const ids: string[] = [];
    for (const lieu of lieuxById.values()) {
      if (normalizeCommune(lieu.commune) === target) {
        ids.push(lieu.lieu_id);
      }
    }
    return ids;
  }, [lieuxById, selectedCommune]);

  /**
   * Empty array = no lieu filter (all agglo).
   * When a commune is selected, pass explicit matching lieu_ids.
   */
  const lieuIdsForFilters = useMemo(() => {
    // Search: skip default commune (Toulouse) so agglo hits like Lacroix-Falgarde show.
    // Explicit venue chip still applies.
    if (searching) {
      if (selectedLieuId) return [selectedLieuId];
      return [];
    }
    if (selectedLieuId) {
      if (!selectedCommune) return [selectedLieuId];
      const lieu = lieuxById.get(selectedLieuId);
      if (
        lieu &&
        normalizeCommune(lieu.commune) === normalizeCommune(selectedCommune)
      ) {
        return [selectedLieuId];
      }
      // Inconsistent lieu vs commune — treat as commune-only filter
      return communeLieuIds && communeLieuIds.length > 0
        ? communeLieuIds
        : ['__no_match__'];
    }
    if (selectedCommune) {
      return communeLieuIds && communeLieuIds.length > 0
        ? communeLieuIds
        : ['__no_match__'];
    }
    return [];
  }, [searching, selectedLieuId, selectedCommune, lieuxById, communeLieuIds]);

  useEffect(() => {
    if (!selectedLieuId || !selectedCommune) return;
    const lieu = lieuxById.get(selectedLieuId);
    if (
      !lieu ||
      normalizeCommune(lieu.commune) !== normalizeCommune(selectedCommune)
    ) {
      setSelectedLieuId(null);
    }
  }, [selectedCommune, selectedLieuId, lieuxById]);

  function handleCommuneChange(next: string | null) {
    setSelectedCommune(next);
    if (selectedLieuId) {
      const lieu = lieuxById.get(selectedLieuId);
      if (
        next != null &&
        (!lieu || normalizeCommune(lieu.commune) !== normalizeCommune(next))
      ) {
        setSelectedLieuId(null);
      }
    }
  }

  const availableGenreSlugs = useMemo(() => {
    if (selectedCategories.length === 0) return [];
    // Don't expand over the 90-day search window — genre chips aren't the search UI.
    const days = scopeRange.days;
    const lieuIds = searching ? [] : lieuIdsForFilters;
    const set = new Set<string>();
    for (const iso of days) {
      for (const slug of genresForSelection(
        programme,
        events,
        iso,
        selectedCategories,
        lieuIds,
      )) {
        set.add(slug);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [
    programme,
    events,
    scopeRange.days,
    selectedCategories,
    lieuIdsForFilters,
    searching,
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

  const counts = useMemo(() => {
    const lieuIds = lieuIdsForFilters;
    return countItemsByDay(
      programme,
      events,
      year,
      month,
      selectedCategories,
      lieuIds,
      selectedGenres,
    );
  }, [
    programme,
    events,
    year,
    month,
    selectedCategories,
    lieuIdsForFilters,
    selectedGenres,
  ]);

  // Persist normalized search blobs across keystrokes; reset when data/legend change.
  const searchHayCache = useMemo(
    () => new Map<string, string>(),
    [programme, events, genresLegend],
  );

  const listItems = useMemo(() => {
    const lieuIds = lieuIdsForFilters;
    let items: DayItem[];

    if (searching) {
      items = itemsForDateRange(
        programme,
        events,
        range.startIso,
        range.endIso,
        selectedCategories,
        lieuIds,
        selectedGenres,
      );
      const q = debouncedQuery.trim();
      if (q) {
        items = items.filter((item) =>
          matchesNormalizedHaystack(
            cachedNormalizedBlob(searchHayCache, item, genresLegend),
            q,
          ),
        );
      }
      return items;
    }

    const seen = new Set<string>();
    items = [];
    for (const iso of range.days) {
      for (const item of itemsForDay(
        programme,
        events,
        iso,
        selectedCategories,
        lieuIds,
        selectedGenres,
        timeScope === 'aujourdhui' ||
          timeScope === 'soir' ||
          timeScope === 'weekend' ||
          timeScope === 'semaine',
      )) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        items.push(item);
      }
    }

    // Ce soir ≥19h only when not searching (scope ignored for evening filter too).
    if (timeScope === 'soir') {
      items = items.filter(startsAtOrAfter19);
    }
    return items;
  }, [
    programme,
    events,
    range.startIso,
    range.endIso,
    range.days,
    selectedCategories,
    lieuIdsForFilters,
    selectedGenres,
    debouncedQuery,
    genresLegend,
    timeScope,
    searching,
    searchHayCache,
  ]);

  /** Pour toi = reco ranked within the same filtered list (chips + ville + query + scope). */
  const pourToiItems = useMemo(() => {
    if (!tastes) return [];
    return recommendForTastes(listItems, tastes, 10).map((s) => s.item);
  }, [listItems, tastes]);

  const showNouveautesPack =
    paris.weekday === 3 &&
    !searchingUi &&
    (timeScope === 'aujourdhui' ||
      timeScope === 'soir' ||
      timeScope === 'semaine');

  const nouveautesItems = useMemo(
    () => (showNouveautesPack ? nouveautesCine(programme, paris.iso) : []),
    [showNouveautesPack, programme, paris.iso],
  );

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

  const ceSoirTonight = useMemo(() => {
    const items = itemsForDay(
      programme,
      events,
      paris.iso,
      [],
      [],
      [],
      true,
    );
    return items.filter(startsAtOrAfter19);
  }, [programme, events, paris.iso]);

  /** Cards after film_id / créneau collapse — pack included, not doubled. */
  const packCardCount = useMemo(
    () => densifiedCardCount(nouveautesItems),
    [nouveautesItems],
  );
  const gridCardCount = useMemo(
    () => densifiedCardCount(gridItems),
    [gridItems],
  );
  const densifiedTotal = packCardCount + gridCardCount;

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
  }, []);

  const venueOptions = useMemo(() => {
    if (searching) {
      // Don't scan 90 days of lieuxForDay; venue chip still works via selectedLieuId.
      return Array.from(lieuxById.values()).sort((a, b) =>
        formatLieuAffiche(a).localeCompare(formatLieuAffiche(b), 'fr'),
      );
    }
    const byId = new Map<string, Lieu>();
    for (const iso of scopeRange.days) {
      for (const lieu of lieuxForDay(
        programme,
        events,
        iso,
        selectedCategories,
        year,
        month,
        selectedGenres,
      )) {
        byId.set(lieu.lieu_id, lieu);
      }
    }
    let list = Array.from(byId.values());
    if (selectedCommune) {
      const target = normalizeCommune(selectedCommune);
      list = list.filter(
        (l) => normalizeCommune(l.commune) === target,
      );
    }
    return list.sort((a, b) =>
      formatLieuAffiche(a).localeCompare(formatLieuAffiche(b), 'fr'),
    );
  }, [
    searching,
    lieuxById,
    programme,
    events,
    scopeRange.days,
    selectedCategories,
    year,
    month,
    selectedGenres,
    selectedCommune,
  ]);

  const selectedItem =
    listItems.find((i) => i.key === selectedItemKey) ??
    pourToiItems.find((i) => i.key === selectedItemKey) ??
    nouveautesItems.find((i) => i.key === selectedItemKey) ??
    ceSoirTonight.find((i) => i.key === selectedItemKey) ??
    null;

  const aussiCeSoirItems = useMemo(() => {
    if (!selectedItem || !isCinemaDayItem(selectedItem)) return [];
    return pickAussiCeSoir(ceSoirTonight, selectedItem, 3);
  }, [selectedItem, ceSoirTonight]);

  const relatedFilmItems = useMemo(() => {
    if (!selectedItem || selectedItem.kind !== 'programme') return [];
    const fid = (selectedItem.programme.film_id || '').trim();
    if (!fid) return [];
    const pool = [...listItems, ...pourToiItems, ...nouveautesItems];
    const seen = new Set<string>();
    const out: Extract<DayItem, { kind: 'programme' }>[] = [];
    for (const i of pool) {
      if (i.kind !== 'programme') continue;
      if ((i.programme.film_id || '').trim() !== fid) continue;
      if (seen.has(i.key)) continue;
      seen.add(i.key);
      out.push(i);
    }
    out.sort((a, b) => {
      const la = formatLieuAffiche(a.lieu);
      const lb = formatLieuAffiche(b.lieu);
      const byLieu = la.localeCompare(lb, 'fr');
      if (byLieu !== 0) return byLieu;
      const da = a.programme.date || a.dayIso;
      const db = b.programme.date || b.dayIso;
      if (da !== db) return da.localeCompare(db);
      return (a.programme.heure_debut || '').localeCompare(
        b.programme.heure_debut || '',
      );
    });
    return out;
  }, [selectedItem, listItems, pourToiItems, nouveautesItems]);

  const showDateLabels = range.days.length > 1;

  function syncMonthFromIso(iso: string) {
    const [y, m] = iso.split('-').map(Number);
    if (y && m) {
      setYear(y);
      setMonth(m);
    }
  }

  function handleScopeChange(scope: TimeScopeId) {
    // Search always = all upcoming dates; keep previous chip to restore on clear.
    if (searchingUi) return;
    setTimeScope(scope);
    setSelectedItemKey(null);
    if (scope === 'date') {
      const day = selectedDay || paris.iso;
      setSelectedDay(day);
      syncMonthFromIso(day);
      setShowMonthPanel(true);
    } else if (scope === 'aujourdhui' || scope === 'soir') {
      setSelectedDay(paris.iso);
      syncMonthFromIso(paris.iso);
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

  function handleCategoriesChange(next: string[]) {
    setSelectedCategories(next);
    if (next.length === 0) {
      setSelectedGenres([]);
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
        <SearchOmnibox value={query} onChange={handleQueryChange} />
      </div>

      <div className="space-y-2.5 sm:space-y-4">
        <TimeScopeBar
          scope={searchingUi ? null : timeScope}
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
            onChange={setSelectedGenres}
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
                communes={communeOptions}
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

        {session?.user && tastes && pourToiItems.length > 0 && (
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

        {session?.user && !tastes && (
          <div className="rounded-2xl border border-dashed border-culture-line bg-culture-surface px-5 py-6 text-center sm:px-6">
            <p className="font-display text-lg text-culture-ink">
              Dis-nous ce que tu aimes
            </p>
            <p className="mt-1 text-sm text-culture-muted">
              On te proposera des sorties «&nbsp;Pour toi&nbsp;» dans l&apos;agenda.
            </p>
            <button
              type="button"
              onClick={openTastes}
              className="mt-4 rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-culture-clay"
            >
              Remplir mes goûts
            </button>
          </div>
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
            packCardCount > 0 ? null : searchingUi ? (
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
      />
    </div>
  );
}