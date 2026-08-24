'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  DayItem,
  EventWithDetails,
  GenreLegend,
  Lieu,
  ProgrammeWithContext,
} from '@/lib/types';
import {
  countItemsByDay,
  genresForSelection,
  itemsForDay,
  lieuxForDay,
} from '@/lib/events';
import { genreBelongsToMains, mainFromGenreSlug } from '@/lib/categories';
import { MONTH_NAMES_FR } from '@/lib/labels';
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

type Props = {
  events: EventWithDetails[];
  programme: ProgrammeWithContext[];
  genresLegend: GenreLegend[];
  initialYear: number;
  initialMonth: number;
};

function itemSearchBlob(item: DayItem): string {
  const parts: string[] = [];
  if (item.kind === 'programme') {
    parts.push(item.programme.nom_item);
    if (item.evenement?.titre) parts.push(item.evenement.titre);
    if (item.evenement?.description_courte)
      parts.push(item.evenement.description_courte);
    if (item.programme.notes) parts.push(item.programme.notes);
    if (item.programme.description_item)
      parts.push(item.programme.description_item);
    if (item.programme.genre) parts.push(item.programme.genre);
    if (item.evenement?.casting) parts.push(item.evenement.casting);
  } else {
    parts.push(item.evenement.titre);
    if (item.evenement.description_courte)
      parts.push(item.evenement.description_courte);
    if (item.evenement.genre) parts.push(item.evenement.genre);
    if (item.evenement.casting) parts.push(item.evenement.casting);
  }
  if (item.lieu?.nom) parts.push(item.lieu.nom);
  if (item.lieu?.commune) parts.push(item.lieu.commune);
  return parts.join(' ').toLowerCase();
}

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

  useEffect(() => {
    const next = defaultTimeScope();
    if (next !== 'weekend') setTimeScope(next);
  }, []);

  const range = useMemo(
    () => resolveScopeRange(timeScope, selectedDay),
    [timeScope, selectedDay],
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

    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter((item) => itemSearchBlob(item).includes(q));
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
  ]);

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
      a.nom.localeCompare(b.nom, 'fr'),
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
    listItems.find((i) => i.key === selectedItemKey) ?? null;

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

  function goPrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
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
            : 'pour cette date';

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

  return (
    <div className="mx-auto max-w-7xl min-w-0 overflow-x-hidden px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-culture-terracotta">
          Toulouse & alentours
        </p>
        <h1 className="mt-1 font-display text-3xl text-culture-ink sm:text-4xl">
          Agenda
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-culture-muted sm:text-base">
          Qu&apos;est-ce qu&apos;on fait ce soir ou ce week-end à Toulouse&nbsp;?
        </p>
      </header>

      <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-culture-line/80 bg-culture-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <SearchOmnibox value={query} onChange={setQuery} />
      </div>

      <div className="space-y-4">
        <TimeScopeBar
          scope={timeScope}
          onChange={handleScopeChange}
          datePanel={timeScope === 'date' ? monthPanel : undefined}
        />

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

        <VenueFilter
          lieux={venueOptions}
          selectedLieuId={selectedLieuId}
          onChange={setSelectedLieuId}
          variant="inline"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-sm text-culture-muted">
            <span className="font-medium text-culture-ink">
              {n} {sortieWord(n)}
            </span>
            {contextLabel ? ` · ${contextLabel}` : ''}
            {query.trim() ? ` · « ${query.trim()} »` : ''}
          </p>
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

        <SeanceGrid
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
      />
    </div>
  );
}
