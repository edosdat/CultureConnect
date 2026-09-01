'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayItem, GenreLegend, Lieu } from '@/lib/types';
import type { AgendaDetailResponse, AgendaListResponse } from '@/lib/slim';
import { profileHasChipWeight } from '@/lib/reco';
import { extractMoods, profileHasZeroWeights } from '@/lib/signals';
import { signIn, useSession } from 'next-auth/react';
import {
  formatHomeEventsCounter,
  showHomeEventsCounter,
} from '@/lib/homeEventsCounter';
import { useSignals } from './SignalsProvider';
import { filterItemsByCommune, normalizeCommune } from '@/lib/commune';
import { filterSeancesForActiveFilters } from '@/lib/displayFilter';
import { densify, densifiedCardCount } from '@/lib/densify';
import { filmIdOfItem, isCinemaDayItem } from '@/lib/nouveautesCine';
import { catsAllowCinemaPack, genreBelongsToMains, mainFromGenreSlug } from '@/lib/categories';
import {
  capLiveRows,
  cineFirstPaint,
  cineRows,
  dedupAgainstTop3,
  displayReasonForItem,
  liveRows,
  shouldShowTop3Section,
  top3IdentitySet,
  visibleTop3Items,
} from '@/lib/displayHome';
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
import HomeSection from './HomeSection';
import CinemaCarousel from './CinemaCarousel';
import LiveCarousel from './LiveCarousel';
import {
  phraseUsesTitleQ,
  type PhraseTags,
} from '@/lib/phraseTags';
import {
  parseSearchChips,
  searchChipsToUi,
  searchSubmitAppliesChips,
  type SearchChipParse,
} from '@/lib/parseSearchChips';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import {
  buildAgendaParams,
  listFetchShouldSkipBoot,
} from '@/lib/agendaParams';

type Props = {
  initialScope: TimeScopeId;
  initialParisIso: string;
  initialItems: DayItem[];
  initialNouveautes: DayItem[];
  initialTotal: number;
  initialDensifiedTotal: number;
  initialCsvEvents?: number;
  initialCsvProgramme?: number;
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
        vivantItems?: DayItem[];
        vivantTotal?: number;
        cineTotal?: number;
      }
    >
  >;
  /** Normalized `p:` / `e:` key from `?e=` (or `?id=`). */
  initialOpenKey?: string | null;
  initialOpenItem?: DayItem | null;
  initialRelatedItems?: DayItem[];
  initialAussiCeSoir?: DayItem[];
  initialVivantItems?: DayItem[];
  initialVivantTotal?: number;
  initialCineTotal?: number;
};

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

export default function CultureConnectApp({
  initialScope,
  initialParisIso,
  initialItems,
  initialNouveautes,
  initialTotal,
  initialDensifiedTotal,
  initialCsvEvents = 0,
  initialCsvProgramme = 0,
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
  initialVivantItems = [],
  initialVivantTotal = 0,
  initialCineTotal = 0,
}: Props) {
  const { track, trackItem, tasteState, sessionStatus } = useSignals();
  const { data: session, status: authStatus } = useSession();
  // Session email only — never searchParams / analytics / page copy.
  const showAdminCounts =
    authStatus === 'authenticated' &&
    showHomeEventsCounter(session?.user?.email);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [timeScope, setTimeScope] = useState<TimeScopeId>(initialScope);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(() => {
    if (initialOpenItem && isCinemaDayItem(initialOpenItem)) return null;
    return initialOpenKey ?? null;
  });
  const [cineFocusKey, setCineFocusKey] = useState<string | null>(() => {
    if (initialOpenItem && isCinemaDayItem(initialOpenItem)) {
      return initialOpenKey ?? null;
    }
    return null;
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLieuId, setSelectedLieuId] = useState<string | null>(null);
  const [selectedCommune, setSelectedCommune] = useState<string | null>('Toulouse');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  /** Leftover title after Enter / submit — never parsed per keystroke. */
  const [committedTitle, setCommittedTitle] = useState('');
  const [phraseTags, setPhraseTags] = useState<PhraseTags | null>(null);
  const searchDrivenRef = useRef({ scope: false, cat: false });
  const lastSearchChipsRef = useRef({ scope: '', date: '', cat: '' });
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
  const [csvEvents, setCsvEvents] = useState(initialCsvEvents);
  const [csvProgramme, setCsvProgramme] = useState(initialCsvProgramme);
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
  const [vivantItems, setVivantItems] = useState<DayItem[]>(initialVivantItems);
  const [vivantTotal, setVivantTotal] = useState(initialVivantTotal);
  const [cineTotal, setCineTotal] = useState(initialCineTotal);
  const [cineExpanded, setCineExpanded] = useState(false);
  const [cineLimit, setCineLimit] = useState(() => cineFirstPaint(false));
  const [liveExpanded, setLiveExpanded] = useState(false);
  const [narrowHome, setNarrowHome] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setNarrowHome(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!cineExpanded) setCineLimit(cineFirstPaint(narrowHome));
  }, [narrowHome, cineExpanded]);

  const skipListFetch = useRef(true);
  const listFetchGen = useRef(0);
  const countsFetchGen = useRef(0);
  const recoFetchGen = useRef(0);
  const recoWipedRef = useRef(false);
  const recoPoolByKeyRef = useRef(recoPoolByKey);
  recoPoolByKeyRef.current = recoPoolByKey;
  const tasteStateRef = useRef(tasteState);
  tasteStateRef.current = tasteState;
  const recoKindRef = useRef<RecoKind>('guest');
  const recoPostedWithChipsRef = useRef<Set<string>>(new Set());
  const listLoadingRef = useRef(false);
  const detailFetchGen = useRef(0);
  const [listSlowWhere, setListSlowWhere] = useState<
    null | 'top' | 'bottom'
  >(null);
  const listSlowTimerRef = useRef<number | null>(null);

  function startListSlowWatch(gen: number, where: 'top' | 'bottom') {
    if (gen !== listFetchGen.current) return;
    if (listSlowTimerRef.current != null) {
      window.clearTimeout(listSlowTimerRef.current);
    }
    setListSlowWhere(null);
    listSlowTimerRef.current = window.setTimeout(() => {
      if (gen === listFetchGen.current) setListSlowWhere(where);
    }, 1000);
  }

  function stopListSlowWatch(gen: number) {
    if (gen !== listFetchGen.current) return;
    if (listSlowTimerRef.current != null) {
      window.clearTimeout(listSlowTimerRef.current);
      listSlowTimerRef.current = null;
    }
    setListSlowWhere(null);
  }

  const titleLeftover = committedTitle;

  // Client fallback: `?e=` / `?id=` when SSR did not pass a key (client nav).
  useEffect(() => {
    if (initialOpenKey) return;
    const params = new URLSearchParams(window.location.search);
    const key = normalizeDeepLinkId(params.get('e') || params.get('id') || '');
    if (key) setSelectedItemKey(key);
  }, [initialOpenKey]);

  function applyScopeFromSearch(scope: TimeScopeId, dateIso: string | null) {
    setTimeScope(scope);
    if (scope === 'date') {
      if (dateIso) {
        setSelectedDay(dateIso);
        syncMonthFromIso(dateIso);
      }
      setShowMonthPanel(true);
      return;
    }
    setShowMonthPanel(false);
    if (scope === 'aujourdhui' || scope === 'soir') {
      setSelectedDay(initialParisIso);
      syncMonthFromIso(initialParisIso);
      return;
    }
    setSelectedDay(null);
    if (scope !== 'tous') {
      const next = resolveScopeRange(scope, null);
      syncMonthFromIso(next.startIso);
    }
  }

  /** Enter / search submit only. Never unchecks chips (vider ≠ décocher). */
  function applyParsedChips(parsed: SearchChipParse, raw: string) {
    if (!searchSubmitAppliesChips(raw, parsed)) return;
    const ui = searchChipsToUi(parsed, initialParisIso);
    const scopeKey = ui.scope ?? '';
    const dateKey = ui.selectedDate ?? '';
    const catKey = ui.categories.slice().sort().join(',');
    const prev = lastSearchChipsRef.current;

    if (ui.scope && (prev.scope !== scopeKey || prev.date !== dateKey)) {
      applyScopeFromSearch(ui.scope, ui.selectedDate);
      searchDrivenRef.current.scope = true;
    }

    if (ui.categories.length > 0 && prev.cat !== catKey) {
      setSelectedCategories(ui.categories);
      searchDrivenRef.current.cat = true;
    }

    lastSearchChipsRef.current = {
      scope: ui.scope ? scopeKey : prev.scope,
      date: ui.scope ? dateKey : prev.date,
      cat: ui.categories.length > 0 ? catKey : prev.cat,
    };
  }

  function handleQueryChange(next: string) {
    setQuery(next);
  }

  function handleSearchSubmit(raw: string) {
    const parsed = parseSearchChips(raw);
    applyParsedChips(parsed, raw);
    if (raw.trim()) {
      setCommittedTitle(parsed.titleQuery);
      setDebouncedQuery(parsed.titleQuery);
    }
  }

  const queryTrimmed = query.trim();
  const phraseMode = false;
  /** Leftover title after submit — chip-only phrases are not a title search. */
  const searchingUi = titleLeftover.length > 0;
  const searching = debouncedQuery.trim().length > 0;

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
      setNouveautesItems(
        filterItemsByCommune(data.nouveautes ?? [], selectedCommune),
      );
      setVivantItems(filterItemsByCommune(data.vivantItems ?? [], selectedCommune));
      if (typeof data.vivantTotal === 'number') setVivantTotal(data.vivantTotal);
      if (typeof data.cineTotal === 'number') setCineTotal(data.cineTotal);
      setTotal(data.total);
      setDensifiedTotalApi(data.densifiedTotal);
      if (typeof data.csvEvents === 'number') setCsvEvents(data.csvEvents);
      if (typeof data.csvProgramme === 'number') setCsvProgramme(data.csvProgramme);
      setVenueOptions(data.venues ?? []);
      setAvailableGenreSlugs(data.genreSlugs ?? []);
    } else {
      setTotal(data.total);
      setDensifiedTotalApi(data.densifiedTotal);
      if (typeof data.csvEvents === 'number') setCsvEvents(data.csvEvents);
      if (typeof data.csvProgramme === 'number') setCsvProgramme(data.csvProgramme);
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
  // Session known → profile immediately (never pending→guest). Loading → pending (skeleton / perso cache).
  const recoKind: RecoKind = recoWiped
    ? 'wiped'
    : sessionStatus === 'authenticated'
      ? 'profile'
      : sessionStatus === 'loading'
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
  const profileRecoKey = recoPoolKey(
    timeScope,
    currentRecoDay,
    selectedCommune,
    'profile',
  );
  const visibleRecoKey = recoKind === 'guest' ? currentRecoKey : profileRecoKey;
  const recoReady =
    !recoWiped &&
    Object.prototype.hasOwnProperty.call(recoPoolByKey, visibleRecoKey);

  useEffect(() => {
    if (recoWiped) {
      setRecoPoolByKey({});
      clearProfileRecoCache();
      return;
    }
    if (recoKind === 'pending') return;
    const profile = tasteStateRef.current?.profile;
    const sendProfile =
      recoKind === 'profile' && Boolean(profile && profileHasChipWeight(profile));
    // Guest: skip if this guest key is filled. Profile: skip only a filled |profile
    // that already came from a perso POST (never keep guest / anonymous fill).
    const existing = recoPoolByKeyRef.current[currentRecoKey];
    if (recoKind === 'guest' && existing !== undefined) return;
    if (
      recoKind === 'profile' &&
      existing !== undefined &&
      currentRecoKey.endsWith('|profile') &&
      sendProfile &&
      recoPostedWithChipsRef.current.has(currentRecoKey)
    ) {
      return;
    }
    if (
      recoKind === 'profile' &&
      existing !== undefined &&
      !sendProfile &&
      currentRecoKey.endsWith('|profile')
    ) {
      // Personal cache already on screen. Wait for chips to overwrite.
      return;
    }
    const key = currentRecoKey;
    let cancelled = false;
    const gen = ++recoFetchGen.current;
    const params = new URLSearchParams();
    params.set('reco', '1');
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
            if (sendProfile) recoPostedWithChipsRef.current.add(key);
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
    tasteState,
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
    if (
      listFetchShouldSkipBoot(skipListFetch.current, timeScope, selectedDay)
    ) {
      skipListFetch.current = false;
      return;
    }
    skipListFetch.current = false;
    if (titleLeftover && titleLeftover !== debouncedQuery.trim()) return;
    const gen = ++listFetchGen.current;
    const delay = 0;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled || gen !== listFetchGen.current) return;
      const params = buildAgendaParams({
        scope: timeScope,
        commune: selectedCommune,
        q: debouncedQuery.trim(),
        cats: selectedCategories,
        genres: selectedGenres,
        lieuId: selectedLieuId,
        selectedDate: selectedDay,
        year,
        month,
        includeListMeta: true,
        phraseMode: false,
        phraseTags,
      });
      startListSlowWatch(gen, 'top');
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
    titleLeftover,
    debouncedQuery,
    selectedCommune,
    selectedLieuId,
    selectedCategories,
    selectedGenres,
    phraseTags,
  ]);

  // Month badges: own request so a day click never waits on countItemsByDay.
  useEffect(() => {
    if (!showMonthPanel) return;
    const gen = ++countsFetchGen.current;
    const params = buildAgendaParams({
      scope: 'date',
      commune: selectedCommune,
      q: '',
      cats: selectedCategories,
      genres: selectedGenres,
      lieuId: selectedLieuId,
      selectedDate: null,
      year,
      month,
      includeCounts: true,
    });
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/agenda?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as AgendaListResponse;
        if (cancelled || gen !== countsFetchGen.current) return;
        if (data.counts) setCounts(new Map(Object.entries(data.counts)));
      } catch {
        /* keep previous badges */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    showMonthPanel,
    year,
    month,
    selectedCommune,
    selectedLieuId,
    selectedCategories,
    selectedGenres,
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

  /** Signed-in / loading: |profile or [] (skeleton). Never the guest trio. */
  const activeFilter = useMemo(
    () => ({
      startIso: scopeRange.startIso,
      endIso: scopeRange.endIso,
      soir: timeScope === 'soir',
      commune: selectedCommune,
      lieuId: selectedLieuId,
    }),
    [
      scopeRange.startIso,
      scopeRange.endIso,
      timeScope,
      selectedCommune,
      selectedLieuId,
    ],
  );

  const pourToiItems = useMemo(() => {
    if (recoWiped) return [];
    // Date + commune/salle filter Top 3; category chips do not.
    return filterSeancesForActiveFilters(
      recoPoolByKey[visibleRecoKey] ?? [],
      activeFilter,
    );
  }, [
    recoPoolByKey,
    visibleRecoKey,
    recoWiped,
    activeFilter,
  ]);

  const top3Cards = useMemo(
    () => visibleTop3Items(pourToiItems),
    [pourToiItems],
  );
  const showTop3Section = shouldShowTop3Section({
    ready: recoReady,
    wiped: recoWiped,
    cardCount: top3Cards.length,
  });
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

  const top3Set = useMemo(() => top3IdentitySet(pourToiItems), [pourToiItems]);
  const cineSource = useMemo(() => {
    const fromList = filterSeancesForActiveFilters(listItems, activeFilter);
    const fromNouv = filterSeancesForActiveFilters(nouveautesItems, activeFilter);
    const seen = new Set(fromList.map((item) => item.key));
    return [...fromList, ...fromNouv.filter((item) => !seen.has(item.key))];
  }, [listItems, nouveautesItems, activeFilter]);
  const allCineRows = useMemo(
    () => cineRows(cineSource, top3Set),
    [cineSource, top3Set],
  );
  const visibleCineRows = useMemo(
    () => allCineRows.slice(0, cineLimit),
    [allCineRows, cineLimit],
  );
  const allLiveRows = useMemo(() => {
    const seen = new Set<string>();
    const pool: DayItem[] = [];
    for (const item of [...vivantItems, ...listItems]) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      pool.push(item);
    }
    return liveRows(
      filterSeancesForActiveFilters(pool, activeFilter),
      top3Set,
    );
  }, [vivantItems, listItems, top3Set, activeFilter]);
  const visibleLiveRows = useMemo(() => {
    if (liveExpanded || timeScope !== 'tous') return allLiveRows;
    return capLiveRows(allLiveRows).slice(0, 9);
  }, [allLiveRows, liveExpanded, timeScope]);
  const livingCatOn = selectedCategories.some(
    (c) =>
      c === 'musique' ||
      c === 'theatre_danse' ||
      c === 'festival' ||
      c === 'enfants_famille',
  );
  const cineCatOn = selectedCategories.includes('cinema');
  const hideCineSection =
    selectedCategories.length > 0 && !cineCatOn;
  const hideLiveSection =
    selectedCategories.length > 0 && !livingCatOn;

  const isGuestReco = recoKind === 'guest';
  const reasonFor = useCallback(
    (item: DayItem) =>
      displayReasonForItem(item, {
        guest: isGuestReco,
        tasteState,
        scope: timeScope,
        commune: selectedCommune,
      }),
    [isGuestReco, tasteState, timeScope, selectedCommune],
  );

  /** Same unique-film set as the Ciné strip — never Toulouse-wide cineTotal. */
  const cineCount = allCineRows.length;
  const liveCount = allLiveRows.length;
  const showCineBlock =
    !hideCineSection &&
    visibleCineRows.length > 0 &&
    !phraseDateClash;
  const showLiveBlock =
    !hideLiveSection &&
    visibleLiveRows.length > 0;
  const leftoverRows = useMemo(() => {
    if (!hideCineSection || !hideLiveSection) return [];
    return densify(
      dedupAgainstTop3(
        filterSeancesForActiveFilters(listItems, activeFilter),
        top3Set,
      ),
    );
  }, [hideCineSection, hideLiveSection, listItems, activeFilter, top3Set]);

  function handleSelectHome(key: string) {
    const found =
      listItems.find((i) => i.key === key) ??
      pourToiItems.find((i) => i.key === key) ??
      nouveautesItems.find((i) => i.key === key) ??
      vivantItems.find((i) => i.key === key) ??
      leftoverRows.find((r) => r.item.key === key)?.item ??
      null;
    if (found && isCinemaDayItem(found)) {
      setCineFocusKey(key);
      setSelectedItemKey(null);
      document
        .getElementById('cine')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setSelectedItemKey(key);
  }
  const listEmpty =
    listItems.length === 0 &&
    allCineRows.length === 0 &&
    allLiveRows.length === 0 &&
    leftoverRows.length === 0;
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
    setCineExpanded(false);
    setCineLimit(cineFirstPaint(narrowHome));
    setLiveExpanded(false);
  }, [
    timeScope,
    selectedDay,
    year,
    month,
    debouncedQuery,
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
    startListSlowWatch(gen, 'bottom');
    const params = buildAgendaParams({
      scope: timeScope,
      commune: selectedCommune,
      q: debouncedQuery.trim(),
      cats: selectedCategories,
      genres: selectedGenres,
      lieuId: selectedLieuId,
      selectedDate: selectedDay,
      year,
      month,
      offset: listItems.length,
      includeCounts: showMonthPanel,
      phraseMode: false,
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
    debouncedQuery,
    selectedCategories,
    selectedGenres,
    selectedLieuId,
    selectedDay,
    year,
    month,
    phraseTags,
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
        const qs = new URLSearchParams();
        qs.set('id', selectedItemKey);
        if (selectedCommune) qs.set('commune', selectedCommune);
        if (selectedLieuId) qs.set('lieu', selectedLieuId);
        if (scopeRange.startIso) qs.set('date_from', scopeRange.startIso);
        if (scopeRange.endIso) qs.set('date_to', scopeRange.endIso);
        if (timeScope === 'soir') qs.set('soir', '1');
        const res = await fetch(`/api/agenda?${qs.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as AgendaDetailResponse;
        if (cancelled || gen !== detailFetchGen.current) return;
        setDetailItem(data.item);
        setRelatedFilmItems(
          filterSeancesForActiveFilters(data.relatedItems ?? [], activeFilter),
        );
        setAussiCeSoirItems(
          filterSeancesForActiveFilters(data.aussiCeSoir ?? [], activeFilter),
        );
        if (!slim) trackItem(data.item, 'open_card');
      } catch {
        /* slim already shown + tracked; keep fiche as-is */
      }
    })();
    return () => {
      cancelled = true;
    };
    // track by key so reopening the same fiche dedups in 30 min
  }, [selectedItemKey, activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const showDateLabels = !searching && scopeRange.days.length > 1;

  function syncMonthFromIso(iso: string) {
    const [y, m] = iso.split('-').map(Number);
    if (y && m) {
      setYear(y);
      setMonth(m);
    }
  }

  function handleScopeChange(scope: TimeScopeId) {
    searchDrivenRef.current.scope = false;
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
        setVivantItems(snap.vivantItems ?? []);
        if (typeof snap.vivantTotal === 'number') setVivantTotal(snap.vivantTotal);
        if (typeof snap.cineTotal === 'number') setCineTotal(snap.cineTotal);
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
        setVivantItems(initialVivantItems);
        setVivantTotal(initialVivantTotal);
        setCineTotal(initialCineTotal);
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
      skipListFetch.current = false;
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
    skipListFetch.current = false;
    searchDrivenRef.current.scope = false;
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
    searchDrivenRef.current.cat = false;
    const added = next.filter((c) => !selectedCategories.includes(c));
    setSelectedCategories(next);
    if (next.length === 0) {
      setSelectedGenres([]);
    }
    // Grid filter only — L() must not increment cats (chip stays chip_cat).
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
  const adminRangeLabel = searchingUi ? 'toutes dates' : contextLabel;
  const adminCountLine = formatHomeEventsCounter({
    cards: densifiedTotalApi,
    seances: total,
    csvEvents,
    csvProgramme,
    rangeLabel: adminRangeLabel,
  });
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
      showDayCounts={showAdminCounts}
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
      <h1 className="sr-only">Agenda CultureConnect</h1>

      <div className="sticky top-0 z-20 -mx-4 mb-2 border-b border-culture-line/80 bg-culture-cream/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6">
        <SearchOmnibox
          value={query}
          onChange={handleQueryChange}
          onSubmit={handleSearchSubmit}
        />
      </div>

      <div className="space-y-2.5 sm:space-y-4">
        <div className="cc-axes-row">
          <div
            className="cc-axes"
            role="group"
            aria-label="Quand et quoi"
          >
            <p className="cc-axes__label text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
              Quand
            </p>
            <TimeScopeBar
              scope={timeScope}
              onChange={handleScopeChange}
              hideLabel
            />
            <div
              role="separator"
              aria-hidden
              className="cc-axes__rule"
            />
            <p className="cc-axes__label text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
              Quoi
            </p>
            <CategoryFilter
              selected={selectedCategories}
              onChange={handleCategoriesChange}
              variant="home"
            />
          </div>
          <div className="cc-axes__more md:hidden">
            <button
              type="button"
              onClick={() => setShowFiltersMobile((v) => !v)}
              className="cc-axes__chip inline-flex items-center gap-1 rounded-full border border-culture-line bg-culture-surface font-medium text-culture-ink hover:border-culture-terracotta/50"
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
        </div>

        {/* Genres only: collapsed behind Filtres on mobile; always on md+ */}
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

        {/* Toulouse + Salles + month (Venue gated by Filtres on mobile) */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-0.5 sm:pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {showAdminCounts ? (
              <p
                className="text-[11px] tabular-nums leading-tight text-culture-muted"
                aria-label="Totaux agenda (debug)"
              >
                {adminCountLine}
              </p>
            ) : null}
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

        {listSlowWhere === 'top' ? (
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

        {showTop3Section ? (
        <section
          className="w-full space-y-3 rounded-card-lg border border-culture-soft/80 bg-culture-surface/80 p-3 sm:p-4"
          data-top3=""
          data-top3-count={recoReady ? top3Cards.length : undefined}
        >
          <h2 className="w-full font-display text-xl leading-tight text-culture-ink sm:text-2xl">
            Ton top 3 du moment
          </h2>
          {sessionStatus === 'unauthenticated' ? (
            <button
              type="button"
              onClick={() => signIn('google', { callbackUrl: '/' })}
              className="block text-left text-[14px] font-medium text-culture-terracotta hover:underline"
            >
              Connecte-toi pour tes suggestions
            </button>
          ) : null}
          {!recoReady && !recoWiped ? (
            <Top3Skeleton />
          ) : (
            <SeanceGrid
              items={top3Cards}
              showDate={showDateLabels}
              onSelectItem={handleSelectHome}
              onSelectVenue={handleSelectVenue}
              empty={null}
              nouveauFilmIds={nouveauFilmIdSet}
              fixedSlots
              reasonFor={reasonFor}
            />
          )}
        </section>
        ) : null}

        {listEmpty && !showCineBlock && !showLiveBlock ? (
          phraseMode || searchingUi ? (
            <div className="rounded-2xl border border-dashed border-culture-line bg-culture-surface px-6 py-8 text-center">
              <p className="font-display text-xl text-culture-ink">
                {phraseDateClash
                  ? 'Rien sur cette période'
                  : `Aucun résultat pour « ${queryTrimmed} »`}
              </p>
              <p className="mt-2 text-sm text-culture-muted">
                La page reste pleine : même ambiance un autre jour, ou une autre
                forme.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {timeScope !== 'tous' ? (
                  <button
                    type="button"
                    onClick={() => handleScopeChange('tous')}
                    className="min-h-10 rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white hover:bg-culture-clay"
                  >
                    Même ambiance, une autre date
                  </button>
                ) : null}
                {phraseTags?.form ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPhraseTags({ ...phraseTags, form: undefined })
                    }
                    className="min-h-10 rounded-full border border-culture-terracotta bg-white px-5 py-2.5 text-sm font-semibold text-culture-terracotta hover:bg-culture-soft"
                  >
                    Autre forme, même ambiance
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleQueryChange('')}
                  className="min-h-10 rounded-full border border-culture-line bg-culture-surface px-5 py-2.5 text-sm font-medium text-culture-ink hover:border-culture-terracotta/50"
                >
                  Effacer
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-culture-line bg-culture-surface px-6 py-8 text-center">
              <p className="font-display text-xl text-culture-ink">
                Rien {emptyScopeHint}
                {selectedCategories.length > 0 ? ' pour cette catégorie' : ''}
              </p>
              <p className="mt-2 text-sm text-culture-muted">
                {showTop3Section
                  ? 'Le top 3 reste visible. Essaie une autre période.'
                  : 'Essaie une autre période.'}
              </p>
              {timeScope === 'soir' && (
                <button
                  type="button"
                  onClick={() => handleScopeChange('aujourdhui')}
                  className="mt-5 mr-2 min-h-10 rounded-full border border-culture-terracotta bg-white px-5 py-2.5 text-sm font-semibold text-culture-terracotta hover:bg-culture-soft"
                >
                  Voir aujourd&apos;hui
                </button>
              )}
              {timeScope !== 'weekend' && (
                <button
                  type="button"
                  onClick={fallbackToWeekend}
                  className="mt-5 min-h-10 rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-white hover:bg-culture-clay"
                >
                  Voir ce week-end
                </button>
              )}
            </div>
          )
        ) : null}

        {showCineBlock ? (
          <HomeSection
            id="cine"
            title="Ciné"
            count={cineCount}
            hideCount={!showAdminCounts}
            shown={visibleCineRows.length}
            expanded={
              cineLimit >= cineCount && listItems.length >= total
            }
            onSeeAll={() => {
              setCineExpanded(true);
              setCineLimit(Number.POSITIVE_INFINITY);
              if (listItems.length < total) handleLoadMore();
            }}
          >
            <CinemaCarousel
              rows={visibleCineRows}
              mobile={narrowHome}
              focusKey={cineFocusKey}
              selectedCommune={selectedCommune}
              selectedLieuId={selectedLieuId}
              dateFrom={scopeRange.startIso}
              dateTo={scopeRange.endIso}
              soir={timeScope === 'soir'}
              datePinned={timeScope !== 'tous'}
              hasMore={
                cineLimit < allCineRows.length || listItems.length < total
              }
              onNeedMore={() => {
                setCineExpanded(true);
                setCineLimit((n) => n + cineFirstPaint(narrowHome));
                if (listItems.length < total) handleLoadMore();
              }}
              fallbackVivant={allLiveRows.map((row) => row.item)}
              onAgenda={(item) => trackItem(item, 'agenda_add')}
              onIcs={(item) => trackItem(item, 'ics')}
              onReserve={(item) => trackItem(item, 'reserve')}
              onSelectLive={handleSelectHome}
            />
          </HomeSection>
        ) : null}

        {showLiveBlock ? (
          <HomeSection
            id="en-live"
            title="En live"
            count={liveCount}
            hideCount={!showAdminCounts}
            shown={visibleLiveRows.length}
            expanded={liveExpanded}
            onSeeAll={() => setLiveExpanded(true)}
          >
            <LiveCarousel
              rows={visibleLiveRows}
              onSelectItem={handleSelectHome}
            />
          </HomeSection>
        ) : null}

        {leftoverRows.length > 0 ? (
          <HomeSection
            id="autres"
            title="Aussi"
            count={leftoverRows.length}
            hideCount={!showAdminCounts}
            shown={leftoverRows.length}
          >
            <SeanceGrid
              items={leftoverRows.map((r) => r.item)}
              showDate={showDateLabels}
              onSelectItem={handleSelectHome}
              onSelectVenue={handleSelectVenue}
              nouveauFilmIds={nouveauFilmIdSet}
            />
          </HomeSection>
        ) : null}

        {listSlowWhere === 'bottom' ? (
          <div
            className="pointer-events-none flex justify-center"
            style={{ margin: 8 }}
          >
            <ListWaitDots />
          </div>
        ) : null}

        <LoginNudge />
      </div>

      <EventDetail
        item={
          selectedItem && !isCinemaDayItem(selectedItem) ? selectedItem : null
        }
        onClose={() => setSelectedItemKey(null)}
        onSelectVenue={handleSelectVenue}
        relatedItems={relatedFilmItems}
        aussiCeSoirItems={aussiCeSoirItems}
        onSelectItem={handleSelectHome}
        onAgenda={() => selectedItem && trackItem(selectedItem, 'agenda_add')}
        onIcs={() => selectedItem && trackItem(selectedItem, 'ics')}
        onReserve={() => selectedItem && trackItem(selectedItem, 'reserve')}
        selectedCommune={selectedCommune}
        selectedLieuId={selectedLieuId}
        fallbackVivant={allLiveRows.map((row) => row.item)}
      />
    </div>
  );
}
