'use client';

import { useEffect, useMemo, useState } from 'react';
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
  itemsForDay,
  lieuxForDay,
} from '@/lib/events';
import { genreBelongsToMains, mainFromGenreSlug } from '@/lib/categories';
import { MONTH_NAMES_FR, formatLieuAffiche } from '@/lib/labels';
import {
  defaultTimeScope,
  parisParts,
  resolveScopeRange,
  scopeContextLabel,
  type TimeScopeId,
} from '@/lib/timeScope';
import CategoryFilter from './CategoryFilter';
import GenreFilter from './GenreFilter';
import VenueFilter from './VenueFilter';
import MonthCalendar from './MonthCalendar';
import SeanceGrid from './SeanceGrid';
import TimeScopeBar from './TimeScopeBar';
import SearchOmnibox from './SearchOmnibox';
import EventDetail from './EventDetail';
import { itemSearchBlob, matchesSearch } from '@/lib/searchText';

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
  // Start weekend to match SSR; bump to "Ce soir" after 17h Paris on client
  const [timeScope, setTimeScope] = useState<TimeScopeId>('weekend');
  const [selectedDay, setSelectedDay] = useState<string | null>(paris.iso);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLieuId, setSelectedLieuId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showMonthPanel, setShowMonthPanel] = useState(false);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  useEffect(() => {
    const next = defaultTimeScope();
    if (next !== 'weekend') setTimeScope(next);
  }, []);

  const range = useMemo(
    () =>
      resolveScopeRange(timeScope, selectedDay, new Date(), {
        year,
        month,
      }),
    [timeScope, selectedDay, year, month],
  );

  const contextLabel = useMemo(
    () => scopeContextLabel(timeScope, range),
    [timeScope, range],
  );

  const availableGenreSlugs = useMemo(() => {
    if (selectedCategories.length === 0) return [];
    const lieuIds = selectedLieuId ? [selectedLieuId] : [];
    const set = new Set<string>();
    for (const iso of range.days) {
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
  }, [programme, events, range.days, selectedCategories, selectedLieuId]);

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
    const lieuIds = selectedLieuId ? [selectedLieuId] : [];
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
    selectedLieuId,
    selectedGenres,
  ]);

  const listItems = useMemo(() => {
    const lieuIds = selectedLieuId ? [selectedLieuId] : [];
    const seen = new Set<string>();
    let items: DayItem[] = [];
    for (const iso of range.days) {
      for (const item of itemsForDay(
        programme,
        events,
        iso,
        selectedCategories,
        lieuIds,
        selectedGenres,
      )) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        items.push(item);
      }
    }

    const q = query.trim();
    if (q) {
      items = items.filter((item) =>
        matchesSearch(itemSearchBlob(item, genresLegend), q),
      );
    }
    return items;
  }, [
    programme,
    events,
    range.days,
    selectedCategories,
    selectedLieuId,
    selectedGenres,
    query,
    genresLegend,
  ]);

  /** Time-scope pool without category/genre/lieu chips — chips must not crush Pour toi. */
  const pourToiPool = useMemo(() => {
    const seen = new Set<string>();
    const items: DayItem[] = [];
    for (const iso of range.days) {
      for (const item of itemsForDay(
        programme,
        events,
        iso,
        [],
        [],
        [],
      )) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        items.push(item);
      }
    }
    return items;
  }, [programme, events, range.days]);

  const pourToiItems = useMemo(() => {
    if (!tastes) return [];
    return recommendForTastes(pourToiPool, tastes, 10).map((s) => s.item);
  }, [pourToiPool, tastes]);

  const venueOptions = useMemo(() => {
    const byId = new Map<string, Lieu>();
    for (const iso of range.days) {
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
    return Array.from(byId.values()).sort((a, b) =>
      formatLieuAffiche(a).localeCompare(formatLieuAffiche(b), 'fr'),
    );
  }, [
    programme,
    events,
    range.days,
    selectedCategories,
    year,
    month,
    selectedGenres,
  ]);

  const selectedItem =
    listItems.find((i) => i.key === selectedItemKey) ??
    pourToiItems.find((i) => i.key === selectedItemKey) ??
    null;

  const relatedFilmItems = useMemo(() => {
    if (!selectedItem || selectedItem.kind !== 'programme') return [];
    const fid = (selectedItem.programme.film_id || '').trim();
    if (!fid) return [];
    const pool = [...listItems, ...pourToiItems];
    const seen = new Set<string>();
    const out: DayItem[] = [];
    for (const i of pool) {
      if (i.key === selectedItem.key) continue;
      if (i.kind !== 'programme') continue;
      if ((i.programme.film_id || '').trim() !== fid) continue;
      if (seen.has(i.key)) continue;
      seen.add(i.key);
      out.push(i);
    }
    // Prefer one row per venue (earliest time)
    const byVenue = new Map<string, DayItem>();
    for (const i of out) {
      if (i.kind !== 'programme') continue;
      const vid = i.lieu?.lieu_id || i.programme.lieu_id || i.key;
      const prev = byVenue.get(vid);
      if (!prev) {
        byVenue.set(vid, i);
        continue;
      }
      const t = i.programme.heure_debut || '';
      const pt =
        prev.kind === 'programme' ? prev.programme.heure_debut || '' : '';
      if (t && (!pt || t < pt)) byVenue.set(vid, i);
    }
    return Array.from(byVenue.values()).sort((a, b) =>
      formatLieuAffiche(a.lieu).localeCompare(formatLieuAffiche(b.lieu), 'fr'),
    );
  }, [selectedItem, listItems, pourToiItems]);

  const showDateLabels = range.days.length > 1;

  function syncMonthFromIso(iso: string) {
    const [y, m] = iso.split('-').map(Number);
    if (y && m) {
      setYear(y);
      setMonth(m);
    }
  }

  function handleScopeChange(scope: TimeScopeId) {
    setTimeScope(scope);
    setSelectedItemKey(null);
    if (scope === 'date') {
      const day = selectedDay || paris.iso;
      setSelectedDay(day);
      syncMonthFromIso(day);
      setShowMonthPanel(true);
    } else if (scope === 'soir') {
      setSelectedDay(paris.iso);
      syncMonthFromIso(paris.iso);
    } else {
      const next = resolveScopeRange(scope, selectedDay);
      syncMonthFromIso(next.startIso);
    }
  }

  function clearDayIfOutsideMonth(nextYear: number, nextMonth: number) {
    if (timeScope !== 'date') return;
    setSelectedDay((prev) => {
      if (!prev) return null;
      const [y, m] = prev.split('-').map(Number);
      if (y === nextYear && m === nextMonth) return prev;
      return null;
    });
    setSelectedItemKey(null);
  }

  function goPrevMonth() {
    const nextYear = month === 1 ? year - 1 : year;
    const nextMonth = month === 1 ? 12 : month - 1;
    setYear(nextYear);
    setMonth(nextMonth);
    clearDayIfOutsideMonth(nextYear, nextMonth);
  }

  function goNextMonth() {
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    setYear(nextYear);
    setMonth(nextMonth);
    clearDayIfOutsideMonth(nextYear, nextMonth);
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
  const n = listItems.length;
  const emptyScopeHint =
    timeScope === 'soir'
      ? 'ce soir'
      : timeScope === 'weekend'
        ? 'ce week-end'
        : timeScope === 'semaine'
          ? 'cette semaine'
          : selectedDay
            ? `le ${contextLabel}`
            : contextLabel;

  const monthPanel = (
    <div className="max-w-md">
      <MonthCalendar
        year={year}
        month={month}
        selectedDay={timeScope === 'date' ? selectedDay : null}
        counts={counts}
        onSelectDay={handleSelectDay}
        onPrevMonth={goPrevMonth}
        onNextMonth={goNextMonth}
      />
    </div>
  );

  const filterBadge =
    selectedCategories.length +
    selectedGenres.length +
    (selectedLieuId ? 1 : 0);

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
        <SearchOmnibox value={query} onChange={setQuery} />
      </div>

      <div className="space-y-2.5 sm:space-y-4">
        <TimeScopeBar
          scope={timeScope}
          onChange={handleScopeChange}
          datePanel={timeScope === 'date' ? monthPanel : undefined}
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

        {/* Category + Genre: collapsed behind Filtres on mobile; always on md+ */}
        <div
          className={
            (showFiltersMobile ? 'flex' : 'hidden') +
            ' flex-col gap-2.5 md:flex md:gap-4'
          }
        >
          <CategoryFilter
            selected={selectedCategories}
            onChange={handleCategoriesChange}
            variant="chips"
          />

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
                {n} {sortieWord(n)}
              </span>
              {contextLabel ? ` · ${contextLabel}` : ''}
              {query.trim() ? ` · « ${query.trim()} »` : ''}
            </p>
            <div
              className={
                (showFiltersMobile ? 'block' : 'hidden') + ' min-w-0 md:block'
              }
            >
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

        {showMonthPanel && timeScope !== 'date' && monthPanel}

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
              collapseFilmsById={Boolean(query.trim())}
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

        <SeanceGrid
              collapseFilmsById={Boolean(query.trim())}
          items={listItems}
          showDate={showDateLabels}
          onSelectItem={setSelectedItemKey}
          onSelectVenue={handleSelectVenue}
          empty={
            <div className="rounded-2xl border border-dashed border-culture-line bg-culture-surface px-6 py-12 text-center">
              <p className="font-display text-xl text-culture-ink">
                Rien {emptyScopeHint}
                {selectedCategories.length > 0 ? ' pour cette catégorie' : ''}
              </p>
              <p className="mt-2 text-sm text-culture-muted">
                Essaie une autre période, une autre catégorie, ou élargis la
                recherche.
              </p>
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
          }
        />
      </div>

      <EventDetail
        item={selectedItem}
        onClose={() => setSelectedItemKey(null)}
        onSelectVenue={handleSelectVenue}
        relatedItems={relatedFilmItems}
      />
    </div>
  );
}
