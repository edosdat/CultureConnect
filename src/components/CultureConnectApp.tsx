'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  DayItem,
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
import { genreBelongsToMains, mainFromGenreSlug } from '@/lib/categories';
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

type TimeScope = 'today' | 'weekend' | 'month' | 'day';

/** Today's date as YYYY-MM-DD in Europe/Paris. */
export function getTodayIsoParis(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Fri / Sat / Sun ISO dates of the week that contains `todayIso` (Paris calendar day). */
export function getWeekendIsosParis(todayIso: string): [string, string, string] {
  const [y, m, d] = todayIso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = date.getUTCDay(); // 0=Sun … 6=Sat
  const offsetToFri = dow === 0 ? -2 : 5 - dow;
  const fri = new Date(date);
  fri.setUTCDate(fri.getUTCDate() + offsetToFri);
  const sat = new Date(fri);
  sat.setUTCDate(fri.getUTCDate() + 1);
  const sun = new Date(fri);
  sun.setUTCDate(fri.getUTCDate() + 2);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  return [fmt(fri), fmt(sat), fmt(sun)];
}

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
  } else {
    parts.push(item.evenement.titre);
    if (item.evenement.description_courte)
      parts.push(item.evenement.description_courte);
  }
  if (item.lieu?.nom) parts.push(item.lieu.nom);
  return parts.join(' ').toLowerCase();
}

export default function CultureConnectApp({
  events,
  programme,
  genresLegend,
  initialYear,
  initialMonth,
}: Props) {
  const todayIso = useMemo(() => getTodayIsoParis(), []);
  const weekendIsos = useMemo(() => getWeekendIsosParis(todayIso), [todayIso]);

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  /** Default home: Ce week-end (design brief). */
  const [timeScope, setTimeScope] = useState<TimeScope>('weekend');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  /** Main category ids: musique | theatre_danse | festival | cinema | expo_patrimoine | enfants_famille */
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLieuId, setSelectedLieuId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const listDayIso =
    timeScope === 'today'
      ? todayIso
      : timeScope === 'day'
        ? selectedDay
        : null;

  const availableGenreSlugs = useMemo(() => {
    if (selectedCategories.length === 0) return [];
    const lieuIds = selectedLieuId ? [selectedLieuId] : [];
    return genresForSelection(
      programme,
      events,
      listDayIso,
      selectedCategories,
      lieuIds,
      year,
      month,
    );
  }, [
    programme,
    events,
    listDayIso,
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
    let items: DayItem[];

    if (timeScope === 'today') {
      items = itemsForDay(
        programme,
        events,
        todayIso,
        selectedCategories,
        lieuIds,
        selectedGenres,
      );
    } else if (timeScope === 'day' && selectedDay) {
      items = itemsForDay(
        programme,
        events,
        selectedDay,
        selectedCategories,
        lieuIds,
        selectedGenres,
      );
    } else if (timeScope === 'weekend') {
      items = weekendIsos.flatMap((iso) =>
        itemsForDay(
          programme,
          events,
          iso,
          selectedCategories,
          lieuIds,
          selectedGenres,
        ),
      );
    } else {
      items = itemsForMonth(
        programme,
        events,
        year,
        month,
        selectedCategories,
        lieuIds,
        selectedGenres,
      );
    }

    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter((item) => itemSearchBlob(item).includes(q));
    }
    return items;
  }, [
    programme,
    events,
    timeScope,
    selectedDay,
    todayIso,
    weekendIsos,
    year,
    month,
    selectedCategories,
    selectedLieuId,
    selectedGenres,
    query,
  ]);

  const venueOptions = useMemo(
    () =>
      lieuxForDay(
        programme,
        events,
        listDayIso,
        selectedCategories,
        year,
        month,
        selectedGenres,
      ),
    [
      programme,
      events,
      listDayIso,
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
    setTimeScope('month');
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
    setTimeScope('month');
    setSelectedDay(null);
    setSelectedItemKey(null);
  }

  function handleSelectDay(iso: string) {
    if (timeScope === 'day' && selectedDay === iso) {
      setTimeScope('month');
      setSelectedDay(null);
    } else {
      setTimeScope('day');
      setSelectedDay(iso);
      const [y, m] = iso.split('-').map(Number);
      if (y && m) {
        setYear(y);
        setMonth(m);
      }
    }
    setSelectedItemKey(null);
  }

  function clearDaySelection() {
    setTimeScope('month');
    setSelectedDay(null);
    setSelectedItemKey(null);
  }

  function setScopeToday() {
    setTimeScope('today');
    setSelectedDay(todayIso);
    const [y, m] = todayIso.split('-').map(Number);
    if (y && m) {
      setYear(y);
      setMonth(m);
    }
    setSelectedItemKey(null);
  }

  function setScopeWeekend() {
    setTimeScope('weekend');
    setSelectedDay(null);
    const fri = weekendIsos[0];
    const [y, m] = fri.split('-').map(Number);
    if (y && m) {
      setYear(y);
      setMonth(m);
    }
    setSelectedItemKey(null);
  }

  function setScopeMonth() {
    setTimeScope('month');
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
  const listHeading =
    timeScope === 'weekend'
      ? 'Ce week-end'
      : timeScope === 'today'
        ? undefined
        : timeScope === 'month'
          ? monthLabel
          : undefined;
  const dayIsoForList =
    timeScope === 'today'
      ? todayIso
      : timeScope === 'day'
        ? selectedDay
        : null;
  const showDateLabels = timeScope === 'weekend' || timeScope === 'month';

  const scopeChipClass = (active: boolean) =>
    active
      ? 'rounded-full bg-culture-terracotta px-3 py-1.5 text-xs font-semibold text-white shadow-sm'
      : 'rounded-full border border-culture-sand bg-white px-3 py-1.5 text-xs font-medium text-culture-ink transition hover:border-culture-terracotta/40 hover:bg-culture-cream/60';

  return (
    <div className="mx-auto max-w-7xl min-w-0 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-4 lg:mb-6">
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

      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-culture-sand/80 bg-culture-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Période"
          >
            <button
              type="button"
              className={scopeChipClass(timeScope === 'today')}
              onClick={setScopeToday}
            >
              Aujourd&apos;hui
            </button>
            <button
              type="button"
              className={scopeChipClass(timeScope === 'weekend')}
              onClick={setScopeWeekend}
            >
              Ce week-end
            </button>
            <button
              type="button"
              className={scopeChipClass(timeScope === 'month')}
              onClick={setScopeMonth}
            >
              Ce mois
            </button>
          </div>
          <label className="relative block min-w-0 flex-1 sm:max-w-md">
            <span className="sr-only">Rechercher</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un spectacle, un lieu…"
              className="w-full rounded-full border border-culture-sand bg-white px-4 py-2 text-sm text-culture-ink shadow-sm outline-none placeholder:text-culture-muted focus:border-culture-terracotta/50 focus:ring-2 focus:ring-culture-terracotta/20"
            />
          </label>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="mb-6 rounded-2xl border border-culture-sand bg-white/80 p-4 shadow-sm lg:sticky lg:top-24 lg:mb-0 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
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

        <div className="min-w-0 overflow-x-hidden">
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 opacity-95">
              <MonthCalendar
                year={year}
                month={month}
                selectedDay={
                  timeScope === 'day' || timeScope === 'today'
                    ? dayIsoForList
                    : null
                }
                counts={counts}
                onSelectDay={handleSelectDay}
                onPrevMonth={goPrevMonth}
                onNextMonth={goNextMonth}
              />
            </div>
            <div className="lg:col-span-2">
              <DayEvents
                dayIso={dayIsoForList}
                monthLabel={listHeading ?? monthLabel}
                items={listItems}
                showDateLabels={showDateLabels}
                onSelectItem={setSelectedItemKey}
                onSelectVenue={handleSelectVenue}
                onClearDay={
                  timeScope === 'day' || timeScope === 'today'
                    ? clearDaySelection
                    : undefined
                }
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
