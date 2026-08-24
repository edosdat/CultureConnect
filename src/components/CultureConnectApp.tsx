'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  EventWithDetails,
  GenreLegend,
  ProgrammeWithContext,
} from '@/lib/types';
import {
  countItemsByDay,
  genresForSelection,
  itemsForDay,
  itemsForMonth,
  lieuxForDay,
} from '@/lib/events';
import { genreBelongsToMains } from '@/lib/categories';
import { MONTH_NAMES_FR } from '@/lib/labels';
import CategoryFilter from './CategoryFilter';
import GenreFilter from './GenreFilter';
import VenueFilter from './VenueFilter';
import MonthCalendar from './MonthCalendar';
import DayEvents from './DayEvents';
import EventDetail from './EventDetail';

type Props = {
  events: EventWithDetails[];
  programme: ProgrammeWithContext[];
  genresLegend: GenreLegend[];
  initialYear: number;
  initialMonth: number;
};

export default function CultureConnectApp({
  events,
  programme,
  genresLegend,
  initialYear,
  initialMonth,
}: Props) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  /** Main category ids: musique | theatre_danse | festival | cinema | expo_patrimoine | enfants_famille */
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLieuId, setSelectedLieuId] = useState<string | null>(null);

  const availableGenreSlugs = useMemo(() => {
    if (selectedCategories.length === 0) return [];
    const lieuIds = selectedLieuId ? [selectedLieuId] : [];
    return genresForSelection(
      programme,
      events,
      selectedDay,
      selectedCategories,
      lieuIds,
      year,
      month,
    );
  }, [
    programme,
    events,
    selectedDay,
    selectedCategories,
    selectedLieuId,
    year,
    month,
  ]);

  // Drop genre selections that no longer belong to selected mains / available set.
  useEffect(() => {
    setSelectedGenres((prev) => {
      if (prev.length === 0) return prev;
      if (selectedCategories.length === 0) return [];
      const legendBySlug = new Map(genresLegend.map((g) => [g.slug, g]));
      const next = prev.filter((slug) => {
        if (!availableGenreSlugs.includes(slug)) return false;
        const g = legendBySlug.get(slug);
        if (!g) return false;
        return genreBelongsToMains(g, selectedCategories);
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
    if (selectedDay) {
      return itemsForDay(
        programme,
        events,
        selectedDay,
        selectedCategories,
        lieuIds,
        selectedGenres,
      );
    }
    return itemsForMonth(
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
    selectedDay,
    year,
    month,
    selectedCategories,
    selectedLieuId,
    selectedGenres,
  ]);

  const venueOptions = useMemo(
    () =>
      lieuxForDay(
        programme,
        events,
        selectedDay,
        selectedCategories,
        year,
        month,
        selectedGenres,
      ),
    [
      programme,
      events,
      selectedDay,
      selectedCategories,
      year,
      month,
      selectedGenres,
    ],
  );

  const selectedItem =
    listItems.find((i) => i.key === selectedItemKey) ?? null;

  function goPrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDay(null);
    setSelectedItemKey(null);
  }

  function goNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDay(null);
    setSelectedItemKey(null);
  }

  function handleSelectDay(iso: string) {
    // Toggle: click again on selected day clears selection (global month view)
    if (selectedDay === iso) {
      setSelectedDay(null);
    } else {
      setSelectedDay(iso);
    }
    setSelectedItemKey(null);
  }

  function clearDaySelection() {
    setSelectedDay(null);
    setSelectedItemKey(null);
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

  const monthLabel = `${MONTH_NAMES_FR[month - 1]} ${year}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 lg:mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-culture-terracotta">
          Toulouse & alentours
        </p>
        <h1 className="mt-1 font-display text-4xl text-culture-ink sm:text-5xl">
          CultureConnect
        </h1>
        <p className="mt-3 max-w-2xl text-culture-muted">
          Calendrier culturel — films, concerts, théâtre et plus : chaque séance
          du jour, autour de Toulouse.
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="mb-6 rounded-2xl border border-culture-sand bg-white/80 p-4 shadow-sm lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div className="space-y-5">
            <CategoryFilter
              selected={selectedCategories}
              onChange={handleCategoriesChange}
            />
            <GenreFilter
              availableSlugs={availableGenreSlugs}
              legend={genresLegend}
              selected={selectedGenres}
              onChange={setSelectedGenres}
              selectedMains={selectedCategories}
            />
            <VenueFilter
              lieux={venueOptions}
              selectedLieuId={selectedLieuId}
              onChange={setSelectedLieuId}
            />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <MonthCalendar
                year={year}
                month={month}
                selectedDay={selectedDay}
                counts={counts}
                onSelectDay={handleSelectDay}
                onPrevMonth={goPrevMonth}
                onNextMonth={goNextMonth}
              />
            </div>
            <div className="lg:col-span-2">
              <DayEvents
                dayIso={selectedDay}
                monthLabel={monthLabel}
                items={listItems}
                showDateLabels={!selectedDay}
                onSelectItem={setSelectedItemKey}
                onSelectVenue={handleSelectVenue}
                onClearDay={selectedDay ? clearDaySelection : undefined}
              />
            </div>
          </div>
        </div>
      </div>

      <EventDetail
        item={selectedItem}
        onClose={() => setSelectedItemKey(null)}
        onSelectVenue={handleSelectVenue}
      />
    </div>
  );
}
