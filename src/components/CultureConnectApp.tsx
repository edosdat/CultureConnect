'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readBootCatalogue, signalBootShellReady } from '@/lib/bootShell';
import type { DayItem, GenreLegend, Lieu } from '@/lib/types';
import type { AgendaDetailResponse, AgendaListResponse } from '@/lib/slim';
import { HOME_PACK_WIRE_CAP } from '@/lib/slim';
import {
  guestBootRecoPoolKey,
  shouldPaintGuestBootReco,
  shouldSkipGuestBootRecoPost,
} from '@/lib/guestBootReco';
import {
  itemBlockedByWorkKeys,
  notInterestedBlockKeys,
  profileHasChipWeight,
  workBlockKeysOfItem,
} from '@/lib/reco';
import {
  extractMoods,
  profileHasPositiveTastes,
  profileHasZeroWeights,
} from '@/lib/signals';
import {
  markMesRecosWeekShown,
  mesRecosWeekAlreadyShown,
  type MesRecosCopyState,
} from '@/lib/mesRecosWeek';
import { signIn, useSession } from 'next-auth/react';
import {
  formatHomeEventsCounter,
  showHomeEventsCounter,
} from '@/lib/homeEventsCounter';
import { useSignals } from './SignalsProvider';
import { useShareVisit } from './ShareVisitProvider';
import { filterItemsByCommune, normalizeCommune } from '@/lib/commune';
import {
  filterSeancesForActiveFilters,
  relatedSeancesFilter,
} from '@/lib/displayFilter';
import { densify, densifiedCardCount, type DenseRow } from '@/lib/densify';
import { formatSectionBadge, sectionSlotQueryKey } from '@/lib/sectionBadge';
import { appendOnlyStripRows } from '@/lib/carouselSelect';
import { filmIdOfItem, homePackOfItem, isCinemaDayItem } from '@/lib/nouveautesCine';
import {
  catsAllowCinemaPack,
  isEnfantsOnlyChip,
} from '@/lib/categories';
import { PACK_CAT_CSS_VAR } from '@/lib/categoryColor';
import {
  genreOptionsScopeKey,
  retainSelectedGenreChips,
  visibleGenreChipSlugs,
} from '@/lib/genreChipMatch';
import {
  cineFirstPaint,
  cineRows,
  dedupAgainstTop3,
  HOME_PACK_MORE_CAT,
  displayReasonForItem,
  enfantsRows,
  expoRows,
  fillEmptyCineFromPool,
  fillEmptyRecoSlots,
  filterItemsByTitleQuery,
  packSourceItems,
  findDayItemByKey,
  leftoverSectionVisible,
  homePackShellVisible,
  packRailPaint,
  homeSectionsVisible,
  proposeSpectaclePlacement,
  searchPackVisible,
  musiqueRows,
  deepLinkBootState,
  resolveHomeCardOpen,
  shouldInvalidateProfileRecoCache,
  HOME_CHROME_STACK_CLASS,
  HOME_SECTION_TITLE_ACCENT_VAR,
  HOME_SECTION_TITLE_CLASS,
  HOME_SECTION_TITLE_RULE_CLASS,
  homeSectionAccentStyle,
  TOP3_SECTION_CLASS,
  top3Heading,
  top3PaintMode,
  theatreRows,
  top3IdentitySet,
  excludeWorksFromPool,
  visibleTop3Items,
  type HomeCardOpen,
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
import SeanceGrid from './SeanceGrid';
import Top3Skeleton from './Top3Skeleton';
import TimeScopeBar from './TimeScopeBar';
import MixHomeLink from './MixHomeLink';
import SearchOmnibox from './SearchOmnibox';
import ListWaitDots, { HomeListWaitSlot } from './ListWaitDots';
import Top3GuestCta from './Top3GuestCta';
import HomeSection from './HomeSection';
import ListImpressionProbe from './ListImpressionProbe';
import { impressionItemKey } from '@/lib/impressions';
import HomeAccroche from './HomeAccroche';
import CharteRegisterLine from './CharteRegisterLine';
import { charteCopy, charteRegister } from '@/lib/charteCopy';
import PackRailSkeleton, { PackRailEmpty } from './PackRailSkeleton';
import {
  ProposeEmptyCard,
  ProposeListFooter,
  ProposeSpectacleSheet,
} from './ProposeSpectacle';

const EventDetail = dynamic(() => import('./EventDetail'), { ssr: false });
const MonthCalendar = dynamic(() => import('./MonthCalendar'), { ssr: false });
const MonthCalendarDrawer = dynamic(() => import('./MonthCalendarDrawer'), {
  ssr: false,
});
const TastesOverlayHost = dynamic(() => import('./TastesOverlayHost'), {
  ssr: false,
});
const MesRecosSheet = dynamic(() => import('./MesRecosSheet'), {
  ssr: false,
});
import {
  CLOSE_MES_RECOS_EVENT,
  OPEN_MES_RECOS_EVENT,
} from './mesRecosUiEvents';
const LoginNudge = dynamic(() => import('./LoginNudge'), { ssr: false });
import CinemaCarousel from './CinemaCarousel';
import {
  phraseUsesTitleQ,
  type PhraseTags,
} from '@/lib/phraseTags';
import { leftoverTitleAfterDraftChange } from '@/lib/parseSearchChips';
import {
  nlCategoriesToApply,
  nlTimeScope,
  type SearchNlLieu,
  type SearchNlParse,
} from '@/lib/searchNl';
import type { SearchSuggestEntry } from '@/lib/searchSuggest';
import { clearDeepLinkUrlParams, normalizeDeepLinkId } from '@/lib/deepLink';
import DeepLinkFicheFallback from './DeepLinkFicheFallback';
import {
  OPEN_FICHE_EVENT,
  type OpenFicheDetail,
  type OpenFicheSeed,
} from './openFicheEvents';
import { peekPrefetchedAgendaItem } from '@/lib/agendaItemPrefetch';
import {
  AGENDA_VENUE_PAGE_MAX,
  buildAgendaParams,
  dateChipListGate,
  listFetchShouldSkipBoot,
  listFetchShouldSkipBootGps,
  listGenerationShouldSettle,
} from '@/lib/agendaParams';
import {
  AGENDA_REFRESH_EVENT,
  homeWindowRefreshAllowed,
  mergeRowsByKey,
} from '@/lib/pwaRefresh';
import {
  requestBrowserPosition,
  resolveNearMeResult,
  nearMeFromBoot,
  nearMeOnToggleOff,
  type GeoPos,
} from '@/lib/nearMe';
import NearMeChip from './NearMeChip';

/** First-paint pack order: hydrate / reco / GPS may only append, never replace slot 0. */
function freezeIncomingPack(
  painted: { current: DenseRow[] },
  incoming: DenseRow[],
  resetKey: string,
  lastKey: { current: string },
  opts?: { pruneMissing?: boolean; replace?: boolean },
): DenseRow[] {
  if (opts?.replace || lastKey.current !== resetKey) {
    lastKey.current = resetKey;
    painted.current = [...incoming];
    return painted.current;
  }
  const next = appendOnlyStripRows(
    painted.current,
    incoming,
    undefined,
    opts?.pruneMissing ? { pruneMissing: true } : undefined,
  );
  painted.current = next;
  return next;
}

type LivingPackId = 'theatre' | 'musique' | 'enfants' | 'expo';

type Props = {
  initialScope: TimeScopeId;
  initialParisIso: string;
  initialItems: DayItem[];
  initialNouveautes: DayItem[];
  initialTotal: number;
  initialDensifiedTotal: number;
  initialCsvEvents?: number;
  initialCsvProgramme?: number;
  initialGenreSlugs: string[];
  communes: string[];
  genresLegend: GenreLegend[];
  initialYear: number;
  initialMonth: number;
  initialNouveauFilmIds?: string[];
  /**
   * Guest 1+1+1 per date chip. Boot `tous` may already be filled from SSR
   * (cached guest populaire). Empty slots still POST `/api/agenda?reco=1`.
   */
  initialRecoByScope?: Partial<Record<TimeScopeId, DayItem[]>>;
  /**
   * Guest populaire for time scope `tous` with the city chip cleared
   * (métropole). Hydrated so that switch does not POST when SSR had it.
   */
  initialGuestMetroTop3?: DayItem[];
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
        theatreTotal?: number;
        musiqueTotal?: number;
        enfantsTotal?: number;
        expoTotal?: number;
        cineSlotTotal?: number;
        theatreSlotTotal?: number;
        musiqueSlotTotal?: number;
        enfantsSlotTotal?: number;
        expoSlotTotal?: number;
        autresSlotTotal?: number;
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
  initialTheatreTotal?: number;
  initialMusiqueTotal?: number;
  initialEnfantsTotal?: number;
  initialExpoTotal?: number;
  initialCineSlotTotal?: number;
  initialTheatreSlotTotal?: number;
  initialMusiqueSlotTotal?: number;
  initialEnfantsSlotTotal?: number;
  initialExpoSlotTotal?: number;
  initialAutresSlotTotal?: number;
  /** Local titre/artiste rows for the secondary suggest list. */
  searchSuggest?: SearchSuggestEntry[];
  /** Known venues so a typed name lists that salle's events (no chip). */
  searchLieux?: SearchNlLieu[];
  /** `?enfants=1` — séance-level « Avec les enfants », not the QUOI chip. */
  initialAvecEnfants?: boolean;
};

type RecoKind = 'guest' | 'profile' | 'wiped' | 'pending';

const RECO_BOOT_SCOPES = ['tous', 'soir', 'aujourdhui', 'weekend', 'semaine'] as const;

/** Reco cards are keyed by window so Ce soir never paints boot/tous cards. */
function excludeWorkIdsForReco(
  signals: Parameters<typeof notInterestedBlockKeys>[0] | undefined,
  extra: ReadonlySet<string> = new Set(),
): string[] {
  const ids = notInterestedBlockKeys(signals ?? []);
  for (const key of extra) ids.add(key);
  return [...ids];
}

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
  metroTop3?: DayItem[],
): Record<string, DayItem[]> {
  const out: Record<string, DayItem[]> = {};
  if (byScope) {
    for (const [scope, items] of Object.entries(byScope)) {
      // Empty boot slots are "not fetched yet" — do not flip recoReady.
      if (!items?.length) continue;
      const day = recoKeyDay(scope as TimeScopeId, null, parisIso);
      out[recoPoolKey(scope as TimeScopeId, day, commune, 'guest')] = items;
    }
  }
  if (metroTop3?.length) {
    out[guestBootRecoPoolKey('metro')] = metroTop3;
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
  initialGenreSlugs,
  communes,
  genresLegend,
  initialYear,
  initialMonth,
  initialNouveauFilmIds = [],
  initialRecoByScope,
  initialGuestMetroTop3,
  initialListByScope,
  initialOpenKey = null,
  initialOpenItem = null,
  initialRelatedItems = [],
  initialAussiCeSoir = [],
  initialVivantItems = [],
  initialVivantTotal = 0,
  initialCineTotal = 0,
  initialTheatreTotal = 0,
  initialMusiqueTotal = 0,
  initialEnfantsTotal = 0,
  initialExpoTotal = 0,
  initialCineSlotTotal = 0,
  initialTheatreSlotTotal = 0,
  initialMusiqueSlotTotal = 0,
  initialEnfantsSlotTotal = 0,
  initialExpoSlotTotal = 0,
  initialAutresSlotTotal = 0,
  searchSuggest = [],
  searchLieux = [],
  initialAvecEnfants = false,
}: Props) {
  const { track, trackItem, rememberItem, tasteState, sessionStatus } =
    useSignals();
  const {
    seanceKey: sharedSeanceKey,
    hasShareToken,
    itemKey: shareVisitItemKey,
  } = useShareVisit();
  const { data: session, status: authStatus } = useSession();
  // Session email only — never searchParams / analytics / page copy.
  const showAdminCounts =
    authStatus === 'authenticated' &&
    showHomeEventsCounter(session?.user?.email);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [timeScope, setTimeScope] = useState<TimeScopeId>(initialScope);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // `?e=` / `?id=`: always open the fiche (same as Top 3). Never pack-focus.
  const deepLinkBoot = deepLinkBootState(initialOpenKey);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(
    deepLinkBoot.selectedItemKey,
  );
  const [ficheSeed, setFicheSeed] = useState<OpenFicheSeed | null>(null);
  const [cineFocusKey, setCineFocusKey] = useState<string | null>(
    deepLinkBoot.cineFocusKey,
  );
  const [theatreFocusKey, setTheatreFocusKey] = useState<string | null>(
    deepLinkBoot.theatreFocusKey,
  );
  const [musiqueFocusKey, setMusiqueFocusKey] = useState<string | null>(
    deepLinkBoot.musiqueFocusKey,
  );
  const [enfantsFocusKey, setEnfantsFocusKey] = useState<string | null>(
    deepLinkBoot.enfantsFocusKey,
  );
  const [expoFocusKey, setExpoFocusKey] = useState<string | null>(
    deepLinkBoot.expoFocusKey,
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  /** Deep link `?enfants=1` only. No second QUOI chip. */
  const avecEnfants = initialAvecEnfants;
  /** List payload that was fetched with the mode flag (avoids a stale rail). */
  const [listAvecEnfants, setListAvecEnfants] = useState(false);
  /** P3 — hide the œuvre before the taste round-trip lands (sheet Mes recos only). */
  const [optimisticNotInterested, setOptimisticNotInterested] = useState<
    ReadonlySet<string>
  >(() => new Set());

  /** Plan C — Mes recos de la semaine (week pool sheet; ≠ home Top3 chips). */
  const [mesRecosOpen, setMesRecosOpen] = useState(false);
  const mesRecosAutoOpenedRef = useRef(false);
  const optimisticNotInterestedRef = useRef(optimisticNotInterested);
  optimisticNotInterestedRef.current = optimisticNotInterested;
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  /**
   * Salle chip is gone. Typing a venue stays text (`q`).
   * Choosing the salle suggestion pins this lieu and lists its events.
   */
  const [pickedLieuId, setPickedLieuId] = useState<string | null>(null);
  const [pickedLieuLabel, setPickedLieuLabel] = useState<string | null>(null);
  const pickedLieuRef = useRef<string | null>(null);
  const selectedLieuId = pickedLieuId;
  const [selectedCommune, setSelectedCommune] = useState<string | null>('Toulouse');
  /** User city chip only — boot GPS must not reset painted pack order. */
  const [browseCommune, setBrowseCommune] = useState<string | null>('Toulouse');
  const [nearMeActive, setNearMeActive] = useState(false);
  const [nearMePending, setNearMePending] = useState(false);
  const [userPos, setUserPos] = useState<GeoPos | null>(null);
  const [query, setQuery] = useState('');
  /** Applied title `q` — Enter to set, empty draft / × to drop. Not a debounce. */
  const [committedTitle, setCommittedTitle] = useState('');
  const [phraseTags, setPhraseTags] = useState<PhraseTags | null>(null);
  const searchDrivenRef = useRef({ scope: false, cat: false });
  const [showMonthPanel, setShowMonthPanel] = useState(false);
  const [facetsOpen, setFacetsOpen] = useState(false);
  useEffect(() => {
    if (selectedCategories.length === 0) setFacetsOpen(false);
  }, [selectedCategories]);
  const [visibleCount, setVisibleCount] = useState(AGENDA_PAGE_SIZE);

  const [listItems, setListItems] = useState<DayItem[]>(initialItems);
  const [recoPoolByKey, setRecoPoolByKey] = useState<Record<string, DayItem[]>>(
    () =>
      hydrateRecoCache(
        initialRecoByScope,
        initialParisIso,
        'Toulouse',
        initialGuestMetroTop3,
      ),
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
  const [availableGenreSlugs, setAvailableGenreSlugs] =
    useState<string[]>(initialGenreSlugs);
  const [genreOptionsReadyKey, setGenreOptionsReadyKey] = useState(() =>
    genreOptionsScopeKey({
      scope: initialScope,
      selectedDay: null,
      year: initialYear,
      month: initialMonth,
      commune: 'Toulouse',
      lieuId: null,
      cats: [],
      q: '',
    }),
  );
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
  const [theatreTotal, setTheatreTotal] = useState(initialTheatreTotal);
  const [musiqueTotal, setMusiqueTotal] = useState(initialMusiqueTotal);
  const [enfantsTotal, setEnfantsTotal] = useState(initialEnfantsTotal);
  const [expoTotal, setExpoTotal] = useState(initialExpoTotal);
  const [cineSlotTotal, setCineSlotTotal] = useState(initialCineSlotTotal);
  const [theatreSlotTotal, setTheatreSlotTotal] = useState(initialTheatreSlotTotal);
  const [musiqueSlotTotal, setMusiqueSlotTotal] = useState(initialMusiqueSlotTotal);
  const [enfantsSlotTotal, setEnfantsSlotTotal] = useState(initialEnfantsSlotTotal);
  const [expoSlotTotal, setExpoSlotTotal] = useState(initialExpoSlotTotal);
  const [autresSlotTotal, setAutresSlotTotal] = useState(initialAutresSlotTotal);
  const bootSlotKey = sectionSlotQueryKey({
    scope: initialScope,
    commune: 'Toulouse',
  });
  const [slotTotalsKey, setSlotTotalsKey] = useState(bootSlotKey);
  function applySlotTotals(
    data: {
      cineSlotTotal?: number;
      theatreSlotTotal?: number;
      musiqueSlotTotal?: number;
      enfantsSlotTotal?: number;
      expoSlotTotal?: number;
      autresSlotTotal?: number;
    },
    key: string,
  ) {
    const hasSlot =
      typeof data.cineSlotTotal === 'number' ||
      typeof data.theatreSlotTotal === 'number' ||
      typeof data.musiqueSlotTotal === 'number' ||
      typeof data.enfantsSlotTotal === 'number' ||
      typeof data.expoSlotTotal === 'number' ||
      typeof data.autresSlotTotal === 'number';
    if (!hasSlot) return;
    if (typeof data.cineSlotTotal === 'number') setCineSlotTotal(data.cineSlotTotal);
    if (typeof data.theatreSlotTotal === 'number') {
      setTheatreSlotTotal(data.theatreSlotTotal);
    }
    if (typeof data.musiqueSlotTotal === 'number') {
      setMusiqueSlotTotal(data.musiqueSlotTotal);
    }
    if (typeof data.enfantsSlotTotal === 'number') {
      setEnfantsSlotTotal(data.enfantsSlotTotal);
    }
    if (typeof data.expoSlotTotal === 'number') setExpoSlotTotal(data.expoSlotTotal);
    if (typeof data.autresSlotTotal === 'number') {
      setAutresSlotTotal(data.autresSlotTotal);
    }
    setSlotTotalsKey(key);
  }
  const [cineExpanded, setCineExpanded] = useState(false);
  const [cineLimit, setCineLimit] = useState(() => cineFirstPaint(false));
  const [theatreLimit, setTheatreLimit] = useState(HOME_PACK_WIRE_CAP);
  const [musiqueLimit, setMusiqueLimit] = useState(HOME_PACK_WIRE_CAP);
  const [enfantsLimit, setEnfantsLimit] = useState(HOME_PACK_WIRE_CAP);
  const [expoLimit, setExpoLimit] = useState(HOME_PACK_WIRE_CAP);
  const [narrowHome, setNarrowHome] = useState(false);
  const [catalogueReady, setCatalogueReady] = useState(
    () => initialItems.length > 0 || initialVivantItems.length > 0,
  );
  /** Title query whose agenda list has landed (success or failure). */
  const [settledSearchQ, setSettledSearchQ] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [packMorePending, setPackMorePending] = useState<
    Partial<Record<LivingPackId | 'cine', boolean>>
  >({});

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
  /** Scope that armed skipListFetch. Date chips must not inherit « tous ». */
  const skipListFetchScope = useRef<TimeScopeId | null>(initialScope);
  const skipListFetchBootGps = useRef(false);
  const bootFiltersRef = useRef({
    timeScope: initialScope,
    cats: [] as string[],
    genres: [] as string[],
    q: '',
    title: '',
    avecEnfants: initialAvecEnfants,
  });
  bootFiltersRef.current = {
    timeScope,
    cats: selectedCategories,
    genres: selectedGenres,
    q: query,
    title: committedTitle,
    avecEnfants,
  };

  useEffect(() => {
    let cancelled = false;
    const mergeBoot = (data: AgendaListResponse) => {
      const f = bootFiltersRef.current;
      if (f.timeScope !== initialScope) return;
      // Chip-only / title leftover must not receive the unfiltered
      // window=home rail (that was the live Balkan leak after #102).
      if (
        f.cats.length ||
        f.genres.length ||
        f.q.trim() ||
        f.title.trim() ||
        f.avecEnfants
      ) {
        return;
      }
      setListItems((prev) => {
        const seen = new Set(prev.map((item) => item.key));
        const extra = (data.items ?? []).filter((item) => !seen.has(item.key));
        return extra.length ? [...prev, ...extra] : prev;
      });
      setVivantItems((prev) => {
        const seen = new Set(prev.map((item) => item.key));
        const extra = (data.vivantItems ?? []).filter(
          (item) => !seen.has(item.key),
        );
        return extra.length ? [...prev, ...extra] : prev;
      });
      if (data.nouveautes?.length) {
        setNouveautesItems((prev) => {
          const seen = new Set(prev.map((item) => item.key));
          const extra = data.nouveautes.filter((item) => !seen.has(item.key));
          return extra.length ? [...prev, ...extra] : prev;
        });
      }
      if (typeof data.vivantTotal === 'number') setVivantTotal(data.vivantTotal);
      if (typeof data.cineTotal === 'number') setCineTotal(data.cineTotal);
      if (typeof data.theatreTotal === 'number') setTheatreTotal(data.theatreTotal);
      if (typeof data.musiqueTotal === 'number') setMusiqueTotal(data.musiqueTotal);
      if (typeof data.enfantsTotal === 'number') setEnfantsTotal(data.enfantsTotal);
      if (typeof data.expoTotal === 'number') setExpoTotal(data.expoTotal);
      applySlotTotals(
        data,
        sectionSlotQueryKey({ scope: initialScope, commune: 'Toulouse' }),
      );
      if (typeof data.total === 'number') setTotal(data.total);
      if (typeof data.densifiedTotal === 'number') {
        setDensifiedTotalApi(data.densifiedTotal);
      }
      if (data.nouveauFilmIds?.length) {
        setNouveauFilmIdSet(new Set(data.nouveauFilmIds));
      }
      setCatalogueReady(true);
    };
    // Splash script may already have started this GET. Reuse it so the
    // rail fills from the in-flight body, then drop the shell.
    void readBootCatalogue()
      .then((raw) => {
        if (cancelled) return;
        const data = raw as AgendaListResponse | null;
        if (data) mergeBoot(data);
        signalBootShellReady();
      })
      .catch(() => {
        if (!cancelled) signalBootShellReady();
      });
    return () => {
      cancelled = true;
    };
  }, [initialScope]);
  const cinePaintedRef = useRef<DenseRow[]>([]);
  const theatrePaintedRef = useRef<DenseRow[]>([]);
  const musiquePaintedRef = useRef<DenseRow[]>([]);
  const enfantsPaintedRef = useRef<DenseRow[]>([]);
  const expoPaintedRef = useRef<DenseRow[]>([]);
  const cinePaintKeyRef = useRef('');
  const theatrePaintKeyRef = useRef('');
  const musiquePaintKeyRef = useRef('');
  const enfantsPaintKeyRef = useRef('');
  const expoPaintKeyRef = useRef('');
  const packMoreLock = useRef<Partial<Record<LivingPackId, boolean>>>({});
  const genreOptionsKeyRef = useRef('');
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
  /** Keys filled by a live reco POST this session — do not re-invalidate. */
  const recoFetchedKeysRef = useRef<Set<string>>(new Set());
  const listLoadingRef = useRef(false);
  const agendaRefreshFlight = useRef(false);
  const refreshAgendaRef = useRef<() => void>(() => {});
  const detailFetchGen = useRef(0);
  /** True only while a list generation's `/api/agenda` GET is in flight. */
  const [listFetchInFlight, setListFetchInFlight] = useState(false);
  const [listSlowWhere, setListSlowWhere] = useState<
    null | 'top' | 'bottom'
  >(null);
  const listSlowTimerRef = useRef<number | null>(null);

  function startListSlowWatch(gen: number, where: 'top' | 'bottom') {
    if (gen !== listFetchGen.current) return;
    if (listSlowTimerRef.current != null) {
      window.clearTimeout(listSlowTimerRef.current);
    }
    if (where === 'bottom') {
      setListSlowWhere('bottom');
      listSlowTimerRef.current = null;
      return;
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

  /** Genre chips + pack skeleton settle together when no list GET remains. */
  function releaseListTransition(key: string) {
    setGenreOptionsReadyKey(key);
    setListFetchInFlight(false);
  }

  const titleLeftover = committedTitle;

  // Client fallback: `?e=` / `?id=` when SSR did not pass a key (client nav).
  // `?t=`-only: open the same B1 fiche once visit/store returns itemKey.
  // Same contract as deepLinkBootState — fiche only, no pack-focus.
  useEffect(() => {
    if (initialOpenKey) return;
    const params = new URLSearchParams(window.location.search);
    const fromQuery = normalizeDeepLinkId(
      params.get('e') || params.get('id') || '',
    );
    // `?t=`-only: open once visit/store returns itemKey. After Fermer
    // strips `t`, a late visit must not reopen the fiche.
    const tokenInUrl = Boolean(params.get('t'));
    const key =
      fromQuery ||
      (tokenInUrl ? normalizeDeepLinkId(shareVisitItemKey || '') : null);
    if (key) setSelectedItemKey(deepLinkBootState(key).selectedItemKey);
  }, [initialOpenKey, shareVisitItemKey]);

  // Cloche → fiche: open from already-painted home state (no cold reload).
  // Prefer inbox meta / prefetched agenda?id= so we never re-wait cold activity.
  useEffect(() => {
    function openFromKey(itemKey: string) {
      const key = normalizeDeepLinkId(itemKey);
      if (key) setSelectedItemKey(deepLinkBootState(key).selectedItemKey);
    }
    function onOpenFiche(e: Event) {
      const detail = (e as CustomEvent<OpenFicheDetail>).detail;
      const itemKey = detail?.itemKey;
      if (!itemKey) return;
      const key = normalizeDeepLinkId(itemKey);
      const peeked = key ? peekPrefetchedAgendaItem(key) : null;
      if (peeked) {
        setDetailItem(peeked);
        setFicheSeed(null);
      } else {
        setDetailItem(null);
        if (detail.title || detail.image || detail.where) {
          setFicheSeed({
            title: detail.title,
            image: detail.image,
            where: detail.where,
          });
        } else {
          setFicheSeed(null);
        }
      }
      openFromKey(itemKey);
    }
    window.addEventListener(OPEN_FICHE_EVENT, onOpenFiche);
    return () => window.removeEventListener(OPEN_FICHE_EVENT, onOpenFiche);
  }, []);

  function applyScopeFromSearch(scope: TimeScopeId, dateIso: string | null) {
    setTimeScope(scope);
    if (scope !== 'tous') beginDateChipFetch(scope);
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

  function clearVenuePick() {
    pickedLieuRef.current = null;
    setPickedLieuId(null);
    setPickedLieuLabel(null);
  }

  function handleQueryChange(next: string) {
    if (pickedLieuRef.current) clearVenuePick();
    setQuery(next);
    // Always apply — empty draft must drop leftover q even if leftover state is stale.
    setCommittedTitle((current) => leftoverTitleAfterDraftChange(next, current));
    if (!(next || '').trim()) setPhraseTags(null);
  }

  /** Bare title only. Filter chips wait for Confirmer — never on debounce or Enter-before-preview. */
  function handleSearchSubmit(raw: string) {
    if (pickedLieuRef.current) return;
    setPhraseTags(null);
    setCommittedTitle(raw.trim());
  }

  /** Venue name or unknown text: filter the cards. No date, QUOI, or salle chip. */
  const handleBareQuery = useCallback((raw: string) => {
    if (pickedLieuRef.current) return;
    setPhraseTags(null);
    setCommittedTitle(raw.trim());
  }, []);

  /**
   * Confirmer. A named QUAND chip is applied as-is.
   * No date chip → `tous` (full catalogue ≥ today Paris), not semaine / mois / 14j.
   * Never pins Salle — lieuId from the parse is ignored.
   */
  function handleNlConfirm(parsed: SearchNlParse) {
    clearVenuePick();
    const scope = nlTimeScope(parsed);
    applyScopeFromSearch(scope, parsed.selectedDate);
    searchDrivenRef.current.scope = true;

    const cats = nlCategoriesToApply(parsed);
    if (cats.length > 0) {
      setSelectedCategories(cats);
      setSelectedGenres(parsed.genres);
      searchDrivenRef.current.cat = true;
    } else if (parsed.genres.length > 0) {
      setSelectedGenres(parsed.genres);
    }
    if (parsed.commune) {
      setNearMeActive(false);
      setUserPos(null);
      setBrowseCommune(parsed.commune);
      setSelectedCommune(parsed.commune);
    }
    setPhraseTags(null);
    setCommittedTitle(parsed.titleQuery);
  }

  function handleSuggestTitre(itemKey: string) {
    clearVenuePick();
    setQuery('');
    setCommittedTitle('');
    setPhraseTags(null);
    setSelectedItemKey(itemKey);
  }

  function handleSuggestArtiste(name: string) {
    clearVenuePick();
    setQuery(name);
    setPhraseTags(null);
    setCommittedTitle(name.trim());
  }

  /** Salle suggestion: every upcoming event at that lieu. No filter-band chip. */
  function handlePickSalle(id: string, label: string) {
    const nextId = id.trim();
    const nom = label.trim();
    if (!nextId || !nom) return;
    pickedLieuRef.current = nextId;
    setPickedLieuId(nextId);
    setPickedLieuLabel(nom);
    setQuery(nom);
    setCommittedTitle('');
    setPhraseTags(null);
  }

  const queryTrimmed = query.trim();
  const phraseMode = Boolean(phraseTags && !phraseUsesTitleQ(phraseTags));
  /** Leftover title after submit — chip-only phrases are not a title search. */
  const searchingUi = titleLeftover.length > 0;
  const searching = titleLeftover.trim().length > 0;
  const phraseScopeKey =
    phraseMode && phraseTags
      ? [
          phraseTags.form || '',
          (phraseTags.genres ?? []).join(','),
          (phraseTags.moods ?? []).join(','),
          (phraseTags.themes ?? []).join(','),
          phraseTags.date_from || '',
          phraseTags.date_to || '',
        ].join(';')
      : '';
  const genreOptionsKey = genreOptionsScopeKey({
    scope: timeScope,
    selectedDay,
    year,
    month,
    commune: selectedCommune,
    lieuId: selectedLieuId,
    cats: selectedCategories,
    q: titleLeftover.trim(),
    phrase: phraseScopeKey,
  });
  genreOptionsKeyRef.current = genreOptionsKey;
  const genresLoading =
    selectedCategories.length > 0 && genreOptionsKey !== genreOptionsReadyKey;

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

  const liveSlotKey = sectionSlotQueryKey({
    scope: timeScope,
    day: selectedDay,
    year,
    month,
    commune: selectedCommune,
    lieuId: selectedLieuId,
    categories: selectedCategories,
    genres: selectedGenres,
    title: titleLeftover,
    phrase: phraseScopeKey,
  });
  const slotTotalsLive = slotTotalsKey === liveSlotKey;

  function applyList(data: AgendaListResponse, append = false) {
    setListItems((prev) => (append ? [...prev, ...data.items] : data.items));
    if (!append) {
      const leftoverOn = Boolean(titleLeftover.trim());
      setNouveautesItems(
        leftoverOn
          ? []
          : filterItemsByCommune(data.nouveautes ?? [], selectedCommune),
      );
      setVivantItems(
        leftoverOn
          ? []
          : filterItemsByCommune(data.vivantItems ?? [], selectedCommune),
      );
      if (typeof data.vivantTotal === 'number') setVivantTotal(data.vivantTotal);
      if (typeof data.cineTotal === 'number') setCineTotal(data.cineTotal);
      if (typeof data.theatreTotal === 'number') setTheatreTotal(data.theatreTotal);
      if (typeof data.musiqueTotal === 'number') setMusiqueTotal(data.musiqueTotal);
      if (typeof data.enfantsTotal === 'number') setEnfantsTotal(data.enfantsTotal);
      if (typeof data.expoTotal === 'number') setExpoTotal(data.expoTotal);
      applySlotTotals(data, liveSlotKey);
      setTotal(data.total);
      setDensifiedTotalApi(data.densifiedTotal);
      if (typeof data.csvEvents === 'number') setCsvEvents(data.csvEvents);
      if (typeof data.csvProgramme === 'number') setCsvProgramme(data.csvProgramme);
      setAvailableGenreSlugs(data.genreSlugs ?? []);
      setGenreOptionsReadyKey(genreOptionsKeyRef.current);
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
    if (!append) {
      setSettledSearchQ(titleLeftover.trim());
      setListAvecEnfants(avecEnfants);
    }
    setCatalogueReady(true);
  }

  function applyFreshList(data: AgendaListResponse) {
    setListItems((prev) => mergeRowsByKey(prev, data.items ?? []));
    const leftoverOn = Boolean(titleLeftover.trim());
    if (!leftoverOn) {
      if (data.nouveautes) {
        setNouveautesItems((prev) =>
          mergeRowsByKey(
            prev,
            filterItemsByCommune(data.nouveautes ?? [], selectedCommune),
          ),
        );
      }
      if (data.vivantItems) {
        setVivantItems((prev) =>
          mergeRowsByKey(
            prev,
            filterItemsByCommune(data.vivantItems ?? [], selectedCommune),
          ),
        );
      }
    }
    if (typeof data.vivantTotal === 'number') setVivantTotal(data.vivantTotal);
    if (typeof data.cineTotal === 'number') setCineTotal(data.cineTotal);
    if (typeof data.theatreTotal === 'number') setTheatreTotal(data.theatreTotal);
    if (typeof data.musiqueTotal === 'number') setMusiqueTotal(data.musiqueTotal);
    if (typeof data.enfantsTotal === 'number') setEnfantsTotal(data.enfantsTotal);
    if (typeof data.expoTotal === 'number') setExpoTotal(data.expoTotal);
    applySlotTotals(data, liveSlotKey);
    if (typeof data.total === 'number') setTotal(data.total);
    if (typeof data.densifiedTotal === 'number') setDensifiedTotalApi(data.densifiedTotal);
    if (typeof data.csvEvents === 'number') setCsvEvents(data.csvEvents);
    if (typeof data.csvProgramme === 'number') setCsvProgramme(data.csvProgramme);
    if (data.genreSlugs && data.genreSlugs.length > 0) {
      setAvailableGenreSlugs(data.genreSlugs);
    }
    if (data.counts) setCounts(new Map(Object.entries(data.counts)));
    if (data.nouveauFilmIds?.length) {
      setNouveauFilmIdSet(new Set(data.nouveauFilmIds));
    }
    setCatalogueReady(true);
  }

  refreshAgendaRef.current = () => {
    if (listLoadingRef.current || listFetchInFlight || agendaRefreshFlight.current) return;
    agendaRefreshFlight.current = true;
    const gen = listFetchGen.current;
    const allowHome = homeWindowRefreshAllowed({
      scope: timeScope,
      bootScope: initialScope,
      cats: selectedCategories,
      genres: selectedGenres,
      q: query,
      title: titleLeftover,
      phraseMode,
      avecEnfants,
    });
    const params = buildAgendaParams({
      scope: timeScope,
      commune: selectedCommune,
      q: titleLeftover.trim(),
      cats: selectedCategories,
      genres: selectedGenres,
      lieuId: selectedLieuId,
      selectedDate: selectedDay,
      year,
      month,
      includeListMeta: false,
      phraseMode,
      phraseTags,
      avecEnfants,
    });
    void (async () => {
      try {
        const pulls: Promise<void>[] = [];
        pulls.push(
          (async () => {
            const res = await fetch(`/api/agenda?${params.toString()}`, {
              cache: 'no-store',
            });
            if (!res.ok || gen !== listFetchGen.current) return;
            const data = (await res.json()) as AgendaListResponse;
            if (gen !== listFetchGen.current) return;
            applyFreshList(data);
          })(),
        );
        if (allowHome) {
          pulls.push(
            (async () => {
              const res = await fetch('/api/agenda?window=home', {
                cache: 'no-store',
              });
              if (!res.ok || gen !== listFetchGen.current) return;
              const data = (await res.json()) as AgendaListResponse;
              if (gen !== listFetchGen.current) return;
              const live = bootFiltersRef.current;
              if (
                !homeWindowRefreshAllowed({
                  scope: live.timeScope,
                  bootScope: initialScope,
                  cats: live.cats,
                  genres: live.genres,
                  q: live.q,
                  title: live.title,
                  phraseMode,
                  avecEnfants: live.avecEnfants,
                })
              ) {
                return;
              }
              applyFreshList(data);
            })(),
          );
        }
        await Promise.all(pulls);
      } catch {
        /* painted list stays */
      } finally {
        agendaRefreshFlight.current = false;
      }
    })();
  };

  useEffect(() => {
    const onRefresh = () => {
      refreshAgendaRef.current();
    };
    window.addEventListener(AGENDA_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(AGENDA_REFRESH_EVENT, onRefresh);
  }, []);

  const recoWiped = Boolean(
    tasteState &&
      profileHasZeroWeights(tasteState.profile) &&
      !profileHasChipWeight(tasteState.profile),
  );
  recoWipedRef.current = recoWiped;
  // Session known → profile immediately (never pending→guest). Loading stays pending until auth resolves.
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
  const guestRecoKey = recoPoolKey(
    timeScope,
    currentRecoDay,
    selectedCommune,
    'guest',
  );
  const guestBootCached = Object.prototype.hasOwnProperty.call(
    recoPoolByKey,
    guestRecoKey,
  );
  // Loading used to point at the empty profile key and paint the skeleton
  // even when SSR had already hydrated the guest trio.
  const visibleRecoKey = shouldPaintGuestBootReco({
    kind: recoKind,
    guestCached: guestBootCached,
  })
    ? guestRecoKey
    : profileRecoKey;
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
    const staleCached =
      existing !== undefined &&
      !recoFetchedKeysRef.current.has(currentRecoKey) &&
      shouldInvalidateProfileRecoCache(
        existing,
        cineTotal > 0
          ? cineTotal
          : densifiedCardCount(listItems.filter(isCinemaDayItem)),
      );
    if (
      shouldSkipGuestBootRecoPost({
        kind: recoKind,
        cached: existing !== undefined,
        stale: staleCached,
      })
    ) {
      return;
    }
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
      currentRecoKey.endsWith('|profile') &&
      !staleCached
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
            excludeWorkIds: excludeWorkIdsForReco(
              tasteStateRef.current?.signalsRecent,
              optimisticNotInterestedRef.current,
            ),
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
          recoFetchedKeysRef.current.add(key);
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
    cineTotal,
    listItems,
  ]);

  // After mount, a taste profile prefetches boot scopes (same POST reco=1). Guest stays on boot.
  // Semaine first — Mes recos sheet must paint from cache/pool without waiting on other scopes.
  // Do not cancel successful writes — JWT/tasteState identity must not drop a finished POST.
  useEffect(() => {
    if (recoKind !== 'profile') return;
    const commune = selectedCommune;
    const profile = tasteStateRef.current?.profile;
    if (!profile) return;
    const profileSnapshot = profile;
    const jobs = RECO_BOOT_SCOPES.map((scope) => {
      const day = recoKeyDay(scope, null, initialParisIso);
      return {
        scope,
        day,
        key: recoPoolKey(scope, day, commune, 'profile'),
      };
    }).filter((job) => recoPoolByKeyRef.current[job.key] === undefined);
    if (jobs.length === 0) return;
    // Prioritize semaine so Mes recos open is quasi-instant after login.
    const semaineFirst = [
      ...jobs.filter((j) => j.scope === 'semaine'),
      ...jobs.filter((j) => j.scope !== 'semaine'),
    ];
    async function fetchRecoJob(job: (typeof jobs)[number]) {
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
              moods: profileSnapshot.moods,
              genres: profileSnapshot.genres,
              themes: profileSnapshot.themes,
            },
            excludeWorkIds: excludeWorkIdsForReco(
              tasteStateRef.current?.signalsRecent,
              optimisticNotInterestedRef.current,
            ),
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
          recoFetchedKeysRef.current.add(job.key);
          if (recoKindRef.current === 'profile') {
            writeProfileRecoCache(initialParisIso, commune, next);
          }
          return next;
        });
      } catch {
        /* leave key empty */
      }
    }
    void (async () => {
      const first = semaineFirst[0];
      const rest = semaineFirst.slice(1);
      if (first?.scope === 'semaine') {
        await fetchRecoJob(first);
        await Promise.all(rest.map(fetchRecoJob));
      } else {
        await Promise.all(semaineFirst.map(fetchRecoJob));
      }
    })();
  }, [recoKind, selectedCommune, year, month, initialParisIso]);

  // Reload first-paint: merge public profile card cache (no tastes / email).
  useEffect(() => {
    const cached = readProfileRecoCache(initialParisIso, selectedCommune);
    if (Object.keys(cached).length === 0) return;
    let droppedStale = false;
    setRecoPoolByKey((prev) => {
      let changed = false;
      const next = { ...prev };
      const kept: Record<string, DayItem[]> = {};
      for (const [key, items] of Object.entries(cached)) {
        const scope = key.split('|')[0] as TimeScopeId;
        const snap = initialListByScope?.[scope];
        const cineN =
          typeof snap?.cineTotal === 'number'
            ? snap.cineTotal
            : scope === initialScope
              ? initialCineTotal
              : densifiedCardCount((snap?.items ?? []).filter(isCinemaDayItem));
        if (shouldInvalidateProfileRecoCache(items, cineN)) {
          droppedStale = true;
          changed = true;
          continue;
        }
        kept[key] = items;
        if (next[key] === undefined) {
          next[key] = items;
          changed = true;
        }
      }
      if (droppedStale) {
        writeProfileRecoCache(initialParisIso, selectedCommune, {
          ...next,
          ...kept,
        });
      }
      return changed ? next : prev;
    });
  }, [
    initialParisIso,
    selectedCommune,
    initialListByScope,
    initialScope,
    initialCineTotal,
  ]);

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

  const markDateChipListPending = useCallback((scope: TimeScopeId) => {
    const gate = dateChipListGate({
      scope,
      hasSnapshot: false,
      listSettled: false,
    });
    if (!gate.cataloguePending) return;
    setCatalogueReady(false);
    if (!gate.clearStalePackTotals) return;
    setVivantTotal(0);
    setCineTotal(0);
    setTheatreTotal(0);
    setMusiqueTotal(0);
    setEnfantsTotal(0);
    setExpoTotal(0);
  }, []);

  function releaseBootListSkip() {
    skipListFetch.current = false;
    skipListFetchScope.current = null;
  }

  function armBootListSkip(scope: TimeScopeId) {
    skipListFetch.current = true;
    skipListFetchScope.current = scope;
  }

  /** Chip without an embedded snapshot. Denied boot GPS stays armed when
   * commune does not change — that one-shot must not swallow this GET. */
  function beginDateChipFetch(scope: TimeScopeId) {
    releaseBootListSkip();
    skipListFetchBootGps.current = false;
    listFetchGen.current += 1;
    markDateChipListPending(scope);
    setListFetchInFlight(true);
  }

  useEffect(() => {
    const settle = (opts: {
      skipped: boolean;
      cancelled: boolean;
      requestStarted: boolean;
      requestFinished: boolean;
      gen: number;
      key: string;
    }) => {
      if (
        listGenerationShouldSettle({
          skipped: opts.skipped,
          cancelled: opts.cancelled,
          requestStarted: opts.requestStarted,
          requestFinished: opts.requestFinished,
          gen: opts.gen,
          currentGen: listFetchGen.current,
        })
      ) {
        releaseListTransition(opts.key);
      }
    };
    const skipBootList = listFetchShouldSkipBoot(
      skipListFetch.current,
      timeScope,
      selectedDay,
      skipListFetchScope.current,
    );
    if (skipBootList && !avecEnfants) {
      skipListFetch.current = false;
      skipListFetchScope.current = null;
      // Snapshot skip still has to drop a genre-facet skeleton.
      settle({
        skipped: true,
        cancelled: false,
        requestStarted: false,
        requestFinished: false,
        gen: listFetchGen.current,
        key: genreOptionsKey,
      });
      return;
    }
    if (skipListFetchBootGps.current) {
      const swallow = listFetchShouldSkipBootGps(
        true,
        timeScope,
        selectedCategories.length,
        titleLeftover,
        avecEnfants,
      );
      skipListFetchBootGps.current = false;
      // Boot GPS must not cancel a QUOI fetch — genre chips need that response.
      if (swallow) {
        settle({
          skipped: true,
          cancelled: false,
          requestStarted: false,
          requestFinished: false,
          gen: listFetchGen.current,
          key: genreOptionsKey,
        });
        return;
      }
    }
    skipListFetch.current = false;
    skipListFetchScope.current = null;
    const gen = ++listFetchGen.current;
    const keyAtStart = genreOptionsKey;
    const delay = 0;
    let cancelled = false;
    let requestStarted = false;
    setListFetchInFlight(true);
    const id = window.setTimeout(() => {
      if (cancelled || gen !== listFetchGen.current) {
        // Cleared before send, or a newer gen owns the GET. If this gen
        // is no longer current and never started, nothing is pending.
        settle({
          skipped: false,
          cancelled,
          requestStarted,
          requestFinished: false,
          gen,
          key: keyAtStart,
        });
        return;
      }
      requestStarted = true;
      const params = buildAgendaParams({
        scope: timeScope,
        commune: selectedCommune,
        q: titleLeftover.trim(),
        cats: selectedCategories,
        genres: selectedGenres,
        lieuId: selectedLieuId,
        selectedDate: selectedDay,
        year,
        month,
        includeListMeta: false,
        phraseMode,
        phraseTags,
        avecEnfants,
      });
      startListSlowWatch(gen, 'top');
      void (async () => {
        try {
          const res = await fetch(`/api/agenda?${params.toString()}`);
          if (cancelled || gen !== listFetchGen.current) return;
          if (!res.ok) {
            markDateChipListPending(timeScope);
            setSettledSearchQ(titleLeftover.trim());
            return;
          }
          const data = (await res.json()) as AgendaListResponse;
          if (cancelled || gen !== listFetchGen.current) return;
          applyList(data);
        } catch {
          if (cancelled || gen !== listFetchGen.current) return;
          // Date chips stay pending. « tous » keeps the previous window.
          markDateChipListPending(timeScope);
          setSettledSearchQ(titleLeftover.trim());
        } finally {
          stopListSlowWatch(gen);
          settle({
            skipped: false,
            cancelled,
            requestStarted: true,
            requestFinished: true,
            gen,
            key: keyAtStart,
          });
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
    selectedCommune,
    selectedLieuId,
    selectedCategories,
    selectedGenres,
    phraseMode,
    phraseTags,
    genreOptionsKey,
    markDateChipListPending,
    avecEnfants,
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
      avecEnfants,
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
    avecEnfants,
  ]);

  useEffect(() => {
    setSelectedGenres((prev) =>
      retainSelectedGenreChips(prev, selectedCategories, genresLegend),
    );
  }, [selectedCategories, genresLegend]);

  const genreChipSlugs = useMemo(
    () => visibleGenreChipSlugs(availableGenreSlugs, selectedGenres),
    [availableGenreSlugs, selectedGenres],
  );

  /** Signed-in / loading: |profile or [] (skeleton). Never the guest trio. */
  const activeFilter = useMemo(
    () => ({
      startIso: scopeRange.startIso,
      endIso: scopeRange.endIso,
      soir: timeScope === 'soir',
      // Title search already ignores commune on the API.
      commune: searching ? null : selectedCommune,
      lieuId: selectedLieuId,
      // Genre + extra QUOI chips must prune painted packs immediately.
      // Date-chip snapshots + append-only rails otherwise keep the unfiltered
      // catalogue after Festival / Expo / Enfants is tapped.
      genres: selectedGenres,
      categories: selectedCategories,
      titleQuery: titleLeftover,
    }),
    [
      scopeRange.startIso,
      scopeRange.endIso,
      timeScope,
      selectedCommune,
      selectedLieuId,
      searching,
      selectedGenres,
      selectedCategories,
      titleLeftover,
    ],
  );

  const pourToiItems = useMemo(() => {
    if (recoWiped) return [];
    // Date + commune/salle filter Top 3; category chips do not.
    // tous (QUAND off): Reco POST is already scoped — do not re-apply day/soir.
    return filterSeancesForActiveFilters(
      recoPoolByKey[visibleRecoKey] ?? [],
      timeScope === 'tous'
        ? {
            commune: selectedCommune,
            lieuId: selectedLieuId,
            skipDateWindow: true,
            genres: selectedGenres,
          }
        : { ...activeFilter, categories: [] },
    );
  }, [
    recoPoolByKey,
    visibleRecoKey,
    recoWiped,
    activeFilter,
    timeScope,
    selectedCommune,
    selectedLieuId,
    selectedGenres,
  ]);
  const packFilmIds = useMemo(() => {
    const ids = new Set<string>();

    for (const item of nouveautesItems) {
      const fid = filmIdOfItem(item);
      if (fid) ids.add(fid);
    }
    return ids;
  }, [nouveautesItems]);

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

  const cineSource = useMemo(() => {
    const fromList = filterSeancesForActiveFilters(listItems, activeFilter);
    const fromNouv = searching
      ? []
      : filterSeancesForActiveFilters(nouveautesItems, activeFilter);
    return packSourceItems(fromList, fromNouv, titleLeftover);
  }, [listItems, nouveautesItems, activeFilter, searching, titleLeftover]);
  const blockedWorks = useMemo(() => {
    const ids = notInterestedBlockKeys(tasteState?.signalsRecent ?? []);
    for (const key of optimisticNotInterested) ids.add(key);
    return ids;
  }, [tasteState, optimisticNotInterested]);
  const pourToiFilled = useMemo(() => {
    if (blockedWorks.size === 0) {
      return fillEmptyCineFromPool(pourToiItems, cineSource);
    }
    const hide = (item: DayItem) => !itemBlockedByWorkKeys(item, blockedWorks);
    return fillEmptyCineFromPool(
      pourToiItems.filter(hide),
      cineSource.filter(hide),
    );
  }, [pourToiItems, cineSource, blockedWorks]);

  // —— Mes recos de la semaine: ALWAYS scope=semaine profile pool (≠ chip-scoped home Top3)
  // Computed before home Top3 so we can demote sheet works from the home surface.
  const weekRecoKey = useMemo(
    () => recoPoolKey('semaine', null, selectedCommune, 'profile'),
    [selectedCommune],
  );
  const weekPourToiRaw = useMemo(() => {
    if (sessionStatus !== 'authenticated' || recoWiped) return [];
    return recoPoolByKey[weekRecoKey] ?? [];
  }, [sessionStatus, recoWiped, recoPoolByKey, weekRecoKey]);
  const weekPourToiFilled = useMemo(() => {
    // Keep week pool pure — do not fill from chip-scoped cineSource.
    if (blockedWorks.size === 0) return weekPourToiRaw;
    const hide = (item: DayItem) => !itemBlockedByWorkKeys(item, blockedWorks);
    return weekPourToiRaw.filter(hide);
  }, [weekPourToiRaw, blockedWorks]);
  const weekTop3Cards = useMemo(
    () => visibleTop3Items(weekPourToiFilled),
    [weekPourToiFilled],
  );

  const slotFillSource = useMemo(() => {
    const fromList = filterSeancesForActiveFilters(listItems, activeFilter);
    const extras = searching
      ? []
      : filterSeancesForActiveFilters(
          [...nouveautesItems, ...vivantItems],
          activeFilter,
        );
    let pool = packSourceItems(fromList, extras, titleLeftover);
    if (blockedWorks.size > 0) {
      pool = pool.filter((item) => !itemBlockedByWorkKeys(item, blockedWorks));
    }
    if (sessionStatus === 'authenticated' && weekTop3Cards.length > 0) {
      pool = excludeWorksFromPool(pool, weekTop3Cards);
    }
    return pool;
  }, [
    listItems,
    nouveautesItems,
    vivantItems,
    activeFilter,
    searching,
    titleLeftover,
    blockedWorks,
    sessionStatus,
    weekTop3Cards,
  ]);

  const top3Cards = useMemo(() => {
    // Authenticated: never show Mes recos week sheet works on home Top3
    // (two pools, zéro mélange — even when home chip is also semaine).
    // QUAND-only still needs 3 slots: refill from the date-scoped catalogue
    // after the demote, without inventing a form the window does not have.
    const pool =
      sessionStatus === 'authenticated' && weekTop3Cards.length > 0
        ? excludeWorksFromPool(pourToiFilled, weekTop3Cards)
        : pourToiFilled;
    return visibleTop3Items(fillEmptyRecoSlots(pool, slotFillSource));
  }, [pourToiFilled, weekTop3Cards, sessionStatus, slotFillSource]);
  const top3ImpressionKeys = useMemo(
    () => top3Cards.map(impressionItemKey).filter(Boolean),
    [top3Cards],
  );

  useEffect(() => {
    for (const item of top3Cards) rememberItem(item);
    for (const item of pourToiFilled) rememberItem(item);
    if (detailItem) rememberItem(detailItem);
  }, [top3Cards, pourToiFilled, detailItem, rememberItem]);
  // QUOI or a genre chip hides the section. Date, commune, salle, and
  // near-me do not. Wipe, title leftover, and phrase still hide.
  const top3Mode = top3PaintMode({
    ready: recoReady,
    wiped: recoWiped,
    cardCount: top3Cards.length,
    selectedCategories,
    selectedGenres,
    committedTitle,
    phraseActive: phraseMode,
  });
  const showTop3Section = top3Mode !== 'hidden';
  const pourToiKeys = useMemo(
    () => new Set(top3Cards.map((item) => item.key)),
    [top3Cards],
  );
  const pourToiFilmIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of top3Cards) {
      const fid = filmIdOfItem(item);
      if (fid) ids.add(fid);
    }
    return ids;
  }, [top3Cards]);
  /** Main grid minus pack + Top 3 keys/film_ids so nothing is listed twice. */
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
  }, [
    listItems,
    packFilmIds,
    pourToiKeys,
    pourToiFilmIds,
  ]);

  /** Cards after film_id / créneau collapse — pack included, not doubled. */
  const pourToiCardCount = useMemo(
    () => densifiedCardCount(pourToiFilled),
    [pourToiFilled],
  );
  const top3Set = useMemo(() => {
    // Packs / leftover dedup against displayed Top 3 (not Top 3 quota).
    return top3IdentitySet(top3Cards);
  }, [top3Cards]);
  const gpsOrigin = nearMeActive ? userPos : null;
  const packFreezeKey = [
    timeScope,
    selectedDay ?? '',
    browseCommune ?? '',
    selectedLieuId ?? '',
    selectedCategories.join(','),
    selectedGenres.join(','),
    committedTitle,
    phraseMode ? '1' : '0',
  ].join('|');
  const allCineRows = useMemo(
    () =>
      cineRows(cineSource, top3Set, {
        origin: gpsOrigin,
        titleQuery: titleLeftover,
      }),
    [cineSource, top3Set, gpsOrigin, titleLeftover],
  );
  const frozenCineRows = freezeIncomingPack(
    cinePaintedRef,
    allCineRows,
    packFreezeKey,
    cinePaintKeyRef,
    { pruneMissing: searching, replace: searching },
  );
  const visibleCineRows = frozenCineRows.slice(0, cineLimit);
  const vivantPool = useMemo(() => {
    const fromList = filterSeancesForActiveFilters(listItems, activeFilter);
    const fromVivant = searching
      ? []
      : filterSeancesForActiveFilters(vivantItems, activeFilter);
    return packSourceItems(fromList, fromVivant, titleLeftover);
  }, [vivantItems, listItems, activeFilter, searching, titleLeftover]);
  const allTheatreRows = useMemo(
    () =>
      theatreRows(vivantPool, top3Set, {
        origin: gpsOrigin,
        titleQuery: titleLeftover,
      }),
    [vivantPool, top3Set, gpsOrigin, titleLeftover],
  );
  const frozenTheatreRows = freezeIncomingPack(
    theatrePaintedRef,
    allTheatreRows,
    packFreezeKey,
    theatrePaintKeyRef,
    { pruneMissing: searching, replace: searching },
  );
  const visibleTheatreRows = frozenTheatreRows.slice(0, theatreLimit);
  const allMusiqueRows = useMemo(
    () =>
      musiqueRows(vivantPool, top3Set, {
        origin: gpsOrigin,
        titleQuery: titleLeftover,
      }),
    [vivantPool, top3Set, gpsOrigin, titleLeftover],
  );
  const frozenMusiqueRows = freezeIncomingPack(
    musiquePaintedRef,
    allMusiqueRows,
    packFreezeKey,
    musiquePaintKeyRef,
    { pruneMissing: searching, replace: searching },
  );
  const visibleMusiqueRows = frozenMusiqueRows.slice(0, musiqueLimit);
  const allEnfantsRows = useMemo(
    () =>
      enfantsRows(vivantPool, top3Set, {
        origin: gpsOrigin,
        includeCrossCatKids: isEnfantsOnlyChip(selectedCategories),
        titleQuery: titleLeftover,
      }),
    [vivantPool, top3Set, gpsOrigin, selectedCategories, titleLeftover],
  );
  const frozenEnfantsRows = freezeIncomingPack(
    enfantsPaintedRef,
    allEnfantsRows,
    packFreezeKey,
    enfantsPaintKeyRef,
    { pruneMissing: searching, replace: searching },
  );
  const visibleEnfantsRows = frozenEnfantsRows.slice(0, enfantsLimit);
  const allExpoRows = useMemo(
    () =>
      expoRows(vivantPool, top3Set, {
        origin: gpsOrigin,
        titleQuery: titleLeftover,
      }),
    [vivantPool, top3Set, gpsOrigin, titleLeftover],
  );
  const frozenExpoRows = freezeIncomingPack(
    expoPaintedRef,
    allExpoRows,
    packFreezeKey,
    expoPaintKeyRef,
    { pruneMissing: searching, replace: searching },
  );
  const visibleExpoRows = frozenExpoRows.slice(0, expoLimit);

  const cineImpressionKeys = useMemo(
    () => visibleCineRows.map((r) => impressionItemKey(r.item)).filter(Boolean),
    [visibleCineRows],
  );
  const theatreImpressionKeys = useMemo(
    () =>
      visibleTheatreRows.map((r) => impressionItemKey(r.item)).filter(Boolean),
    [visibleTheatreRows],
  );
  const musiqueImpressionKeys = useMemo(
    () =>
      visibleMusiqueRows.map((r) => impressionItemKey(r.item)).filter(Boolean),
    [visibleMusiqueRows],
  );
  const enfantsImpressionKeys = useMemo(
    () =>
      visibleEnfantsRows.map((r) => impressionItemKey(r.item)).filter(Boolean),
    [visibleEnfantsRows],
  );
  const expoImpressionKeys = useMemo(
    () => visibleExpoRows.map((r) => impressionItemKey(r.item)).filter(Boolean),
    [visibleExpoRows],
  );
  const cineFirstKey = frozenCineRows[0]?.groupKey ?? null;
  const theatreFirstKey = frozenTheatreRows[0]?.groupKey ?? null;
  const musiqueFirstKey = frozenMusiqueRows[0]?.groupKey ?? null;
  const enfantsFirstKey = frozenEnfantsRows[0]?.groupKey ?? null;
  const expoFirstKey = frozenExpoRows[0]?.groupKey ?? null;
  useEffect(() => {
    if (!cineFocusKey && cineFirstKey) setCineFocusKey(cineFirstKey);
  }, [cineFocusKey, cineFirstKey]);
  useEffect(() => {
    if (!theatreFocusKey && theatreFirstKey) setTheatreFocusKey(theatreFirstKey);
  }, [theatreFocusKey, theatreFirstKey]);
  useEffect(() => {
    if (!musiqueFocusKey && musiqueFirstKey) setMusiqueFocusKey(musiqueFirstKey);
  }, [musiqueFocusKey, musiqueFirstKey]);
  useEffect(() => {
    if (!enfantsFocusKey && enfantsFirstKey) setEnfantsFocusKey(enfantsFirstKey);
  }, [enfantsFocusKey, enfantsFirstKey]);
  useEffect(() => {
    if (!expoFocusKey && expoFirstKey) setExpoFocusKey(expoFirstKey);
  }, [expoFocusKey, expoFirstKey]);
  const livingPackRowsRef = useRef({
    theatre: 0,
    musique: 0,
    enfants: 0,
    expo: 0,
  });
  livingPackRowsRef.current = {
    theatre: frozenTheatreRows.length,
    musique: frozenMusiqueRows.length,
    enfants: frozenEnfantsRows.length,
    expo: frozenExpoRows.length,
  };
  const livingPackTotalRef = useRef({
    theatre: 0,
    musique: 0,
    enfants: 0,
    expo: 0,
  });
  livingPackTotalRef.current = {
    theatre: theatreTotal,
    musique: musiqueTotal,
    enfants: enfantsTotal,
    expo: expoTotal,
  };
  const sectionVis = homeSectionsVisible(selectedCategories);
  /** Home rails stay hidden while the kids list is showing or still loading. */
  const showHomeRails = !avecEnfants && !listAvecEnfants;
  const enfantsModeReady = avecEnfants && listAvecEnfants;
  const enfantsModePending = avecEnfants !== listAvecEnfants;
  /** One register for the whole view — follows the Enfants QUOI chip. */
  const enfantsChipOn = selectedCategories.includes('enfants_famille');
  const register = charteRegister(enfantsChipOn);
  const copy = charteCopy(enfantsChipOn);

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

  /** Densified cards on the Ciné strip (voir tout). The public badge uses cineSlotTotal. */
  const cineCount = allCineRows.length;
  const dateChipPending = dateChipListGate({
    scope: timeScope,
    hasSnapshot: false,
    listSettled: catalogueReady,
  }).cataloguePending;

  useEffect(() => {
    if (recoKind !== 'profile') return;
    const existing = recoPoolByKey[visibleRecoKey];
    if (!existing) return;
    if (recoFetchedKeysRef.current.has(visibleRecoKey)) return;
    if (!shouldInvalidateProfileRecoCache(existing, cineCount)) return;
    setRecoPoolByKey((prev) => {
      if (!(visibleRecoKey in prev)) return prev;
      const next = { ...prev };
      delete next[visibleRecoKey];
      writeProfileRecoCache(initialParisIso, selectedCommune, next);
      return next;
    });
  }, [
    recoKind,
    visibleRecoKey,
    recoPoolByKey,
    cineCount,
    initialParisIso,
    selectedCommune,
  ]);
  const theatreCount = allTheatreRows.length;
  const musiqueCount = allMusiqueRows.length;
  const enfantsCount = allEnfantsRows.length;
  const expoCount = allExpoRows.length;
  const searchPackOnly = searchingUi && !phraseDateClash;
  const showCineBlock = searchPackOnly
    ? searchPackVisible({
        sectionAllowed: sectionVis.cine,
        rowCount: visibleCineRows.length,
      })
    : homePackShellVisible({
        sectionAllowed: sectionVis.cine,
        rowCount: visibleCineRows.length,
        packTotal: dateChipPending ? 0 : cineTotal,
        cataloguePending: dateChipPending || !catalogueReady,
        phraseDateClash,
      });
  const showTheatreBlock = searchPackOnly
    ? searchPackVisible({
        sectionAllowed: sectionVis.theatre,
        rowCount: visibleTheatreRows.length,
      })
    : homePackShellVisible({
        sectionAllowed: sectionVis.theatre,
        rowCount: visibleTheatreRows.length,
        packTotal: dateChipPending ? 0 : theatreTotal,
        cataloguePending: dateChipPending || !catalogueReady,
        phraseDateClash,
      });
  const showMusiqueBlock =
    sectionVis.musique &&
    visibleMusiqueRows.length > 0 &&
    !phraseDateClash;
  const showEnfantsBlock =
    sectionVis.enfants &&
    visibleEnfantsRows.length > 0 &&
    !phraseDateClash;
  const showExpoBlock =
    sectionVis.expo &&
    visibleExpoRows.length > 0 &&
    !phraseDateClash;
  const cineRailPaint = packRailPaint({
    shellVisible: showCineBlock,
    rowCount: visibleCineRows.length,
    listInFlight: listFetchInFlight,
  });
  const theatreRailPaint = packRailPaint({
    shellVisible: showTheatreBlock,
    rowCount: visibleTheatreRows.length,
    listInFlight: listFetchInFlight,
  });
  const leftoverRows = useMemo(() => {
    const anyPackVisible =
      showCineBlock ||
      showTheatreBlock ||
      showMusiqueBlock ||
      showEnfantsBlock ||
      showExpoBlock;
    if (
      !leftoverSectionVisible({
        anyPackVisible,
        selectedCategories,
      })
    ) {
      return [];
    }
    const scoped = filterSeancesForActiveFilters(listItems, activeFilter);
    const leftover =
      searching && !anyPackVisible
        ? filterItemsByTitleQuery(scoped, titleLeftover)
        : scoped.filter((item) => !homePackOfItem(item));
    return densify(
      dedupAgainstTop3(leftover, top3Set),
      gpsOrigin ? { origin: gpsOrigin } : undefined,
    );
  }, [
    showCineBlock,
    showTheatreBlock,
    showMusiqueBlock,
    showEnfantsBlock,
    showExpoBlock,
    selectedCategories,
    listItems,
    activeFilter,
    top3Set,
    gpsOrigin,
    searching,
    titleLeftover,
  ]);
  const leftoverImpressionKeys = useMemo(
    () => leftoverRows.map((r) => impressionItemKey(r.item)).filter(Boolean),
    [leftoverRows],
  );
  const searchResultCount =
    visibleCineRows.length +
    visibleTheatreRows.length +
    visibleMusiqueRows.length +
    visibleEnfantsRows.length +
    visibleExpoRows.length +
    leftoverRows.length;
  const proposePlace = proposeSpectaclePlacement({
    query: titleLeftover,
    settled: settledSearchQ === titleLeftover.trim(),
    resultCount: searchResultCount,
    phraseDateClash,
  });
  function openProposeFlow() {
    if (authStatus === 'loading') return;
    setProposeOpen(true);
  }
  const crossSellPool = useMemo(
    () => [
      ...allTheatreRows.map((row) => row.item),
      ...allMusiqueRows.map((row) => row.item),
    ],
    [allTheatreRows, allMusiqueRows],
  );

  function applyHomeCardOpen(action: HomeCardOpen) {
    if (action.mode === 'pack') {
      if (action.pack === 'cine') {
        setCineFocusKey(action.key);
        setSelectedItemKey(null);
        document
          .getElementById('cine')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (action.pack === 'theatre') {
        setTheatreFocusKey(action.key);
        setSelectedItemKey(null);
        document
          .getElementById('theatre')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (action.pack === 'musique') {
        setMusiqueFocusKey(action.key);
        setSelectedItemKey(null);
        document
          .getElementById('musique')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (action.pack === 'enfants') {
        setEnfantsFocusKey(action.key);
        setSelectedItemKey(null);
        document
          .getElementById('enfants')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (action.pack === 'expo') {
        setExpoFocusKey(action.key);
        setSelectedItemKey(null);
        document
          .getElementById('expos')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    setSelectedItemKey(action.key);
  }

  function handleSelectHome(key: string) {
    const found = findDayItemByKey(
      key,
      listItems,
      pourToiFilled,
      pourToiItems,
      nouveautesItems,
      vivantItems,
      leftoverRows.map((r) => r.item),
    );
    applyHomeCardOpen(resolveHomeCardOpen(key, found, 'grid'));
  }

  /** Top 3: always open the fiche by key (full catalogue / `?e=`), never pack-focus. */
  function handleSelectTop3(key: string) {
    applyHomeCardOpen(resolveHomeCardOpen(key, null, 'top3'));
  }

  const dismissWork = useCallback((item: DayItem) => {
    trackItem(item, 'not_interested');
    setOptimisticNotInterested((prev) => {
      const next = new Set(prev);
      for (const key of workBlockKeysOfItem(item)) next.add(key);
      return next;
    });
  }, [trackItem]);

  const workIsNotInterested = useCallback(
    (item: DayItem) => itemBlockedByWorkKeys(item, blockedWorks),
    [blockedWorks],
  );

  // weekRecoKey / weekTop3Cards: defined above (before home top3Cards demote).
  const weekPoolReady = Object.prototype.hasOwnProperty.call(
    recoPoolByKey,
    weekRecoKey,
  );
  const mesRecosCopyState: MesRecosCopyState = useMemo(() => {
    if (weekTop3Cards.length === 0 && weekPoolReady) return 'empty';
    if (profileHasPositiveTastes(tasteState?.profile)) return 'warm';
    return 'cold';
  }, [weekTop3Cards.length, weekPoolReady, tasteState]);

  const closeMesRecos = useCallback(() => {
    setMesRecosOpen(false);
    // Closing (chrome × / CTA / Esc / card→fiche) consumes the Paris week.
    markMesRecosWeekShown();
  }, []);

  const openMesRecosManual = useCallback(() => {
    // Menu « Mes recos » — reopen WITHOUT consuming / re-gating the week.
    // Open immediately; sheet paints cached week cards or a light local loading state.
    setMesRecosOpen(true);
  }, []);

  // Prefetch MesRecosSheet chunk as soon as we know the user is signed in
  // (dynamic() otherwise waits until first open — feels slow on iPad Safari).
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    void import('./MesRecosSheet');
  }, [sessionStatus]);

  useEffect(() => {
    function onOpen() {
      openMesRecosManual();
    }
    function onClose() {
      closeMesRecos();
    }
    window.addEventListener(OPEN_MES_RECOS_EVENT, onOpen);
    window.addEventListener(CLOSE_MES_RECOS_EVENT, onClose);
    return () => {
      window.removeEventListener(OPEN_MES_RECOS_EVENT, onOpen);
      window.removeEventListener(CLOSE_MES_RECOS_EVENT, onClose);
    };
  }, [openMesRecosManual, closeMesRecos]);

  // Auto-popup 1× / Paris calendar week after Google login (guest = never).
  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      mesRecosAutoOpenedRef.current = false;
      return;
    }
    if (mesRecosAutoOpenedRef.current) return;
    if (mesRecosWeekAlreadyShown()) return;
    if (recoKind !== 'profile') return;
    // Prefer week pool ready (instant cards). Fall back: open with local loading
    // once any profile reco is ready so login never waits on a blank screen.
    if (!weekPoolReady && !recoReady) return;
    mesRecosAutoOpenedRef.current = true;
    markMesRecosWeekShown(); // « montré » = sheet mounted
    setMesRecosOpen(true);
  }, [sessionStatus, weekPoolReady, recoReady, recoKind]);

  function handleSelectMesRecosCard(key: string) {
    closeMesRecos();
    handleSelectTop3(key);
  }

  const listEmpty =
    listItems.length === 0 &&
    allCineRows.length === 0 &&
    allTheatreRows.length === 0 &&
    allMusiqueRows.length === 0 &&
    allEnfantsRows.length === 0 &&
    allExpoRows.length === 0 &&
    leftoverRows.length === 0;
  const gridCardCount = useMemo(
    () => densifiedCardCount(gridItems),
    [gridItems],
  );
  const haveAllItems = listItems.length >= total;
  const densifiedTotal = haveAllItems
    ? pourToiCardCount + visiblePackCount + gridCardCount
    : Math.max(
        densifiedTotalApi,
        pourToiCardCount + visiblePackCount + gridCardCount,
      );

  // Reset infinite-scroll window when scope / filters / query change.
  useEffect(() => {
    const venueWindow = Boolean(selectedLieuId);
    setVisibleCount(venueWindow ? AGENDA_VENUE_PAGE_MAX : AGENDA_PAGE_SIZE);
    setCineExpanded(false);
    setCineLimit(venueWindow ? AGENDA_VENUE_PAGE_MAX : cineFirstPaint(narrowHome));
    setTheatreLimit(venueWindow ? AGENDA_VENUE_PAGE_MAX : HOME_PACK_WIRE_CAP);
    setMusiqueLimit(venueWindow ? AGENDA_VENUE_PAGE_MAX : HOME_PACK_WIRE_CAP);
    setEnfantsLimit(venueWindow ? AGENDA_VENUE_PAGE_MAX : HOME_PACK_WIRE_CAP);
    setExpoLimit(venueWindow ? AGENDA_VENUE_PAGE_MAX : HOME_PACK_WIRE_CAP);
  }, [
    timeScope,
    selectedDay,
    year,
    month,
    titleLeftover,
    selectedCommune,
    selectedLieuId,
    selectedCategories,
    selectedGenres,
    nearMeActive,
    phraseTags,
  ]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((c) => c + AGENDA_PAGE_SIZE);
    if (listItems.length >= total) return;
    if (listLoadingRef.current) return;
    listLoadingRef.current = true;
    setPackMorePending((prev) => ({ ...prev, cine: true }));
    const gen = ++listFetchGen.current;
    startListSlowWatch(gen, 'bottom');
    const params = buildAgendaParams({
      scope: timeScope,
      commune: selectedCommune,
      q: titleLeftover.trim(),
      cats: selectedCategories,
      genres: selectedGenres,
      lieuId: selectedLieuId,
      selectedDate: selectedDay,
      year,
      month,
      offset: listItems.length,
      includeCounts: showMonthPanel,
      phraseMode,
      phraseTags,
      avecEnfants,
    });
    void fetch(`/api/agenda?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AgendaListResponse | null) => {
        if (!data || gen !== listFetchGen.current) return;
        applyList(data, true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (gen === listFetchGen.current) {
          listLoadingRef.current = false;
          setPackMorePending((prev) => ({ ...prev, cine: false }));
          releaseListTransition(genreOptionsKeyRef.current);
        }
        stopListSlowWatch(gen);
      });
  }, [
    listItems.length,
    total,
    timeScope,
    selectedCommune,
    titleLeftover,
    selectedCategories,
    selectedGenres,
    selectedLieuId,
    selectedDay,
    year,
    month,
    phraseMode,
    phraseTags,
    avecEnfants,
  ]);

  const handleLivingPackMore = useCallback(
    (pack: LivingPackId, expandAll = false) => {
      const bump = expandAll ? Number.POSITIVE_INFINITY : HOME_PACK_WIRE_CAP;
      if (pack === 'theatre') {
        setTheatreLimit((n) => (expandAll ? bump : n + bump));
      } else if (pack === 'musique') {
        setMusiqueLimit((n) => (expandAll ? bump : n + bump));
      } else if (pack === 'enfants') {
        setEnfantsLimit((n) => (expandAll ? bump : n + bump));
      } else {
        setExpoLimit((n) => (expandAll ? bump : n + bump));
      }
      const have = livingPackRowsRef.current[pack];
      const packTotal = livingPackTotalRef.current[pack];
      if (packTotal > 0 && have >= packTotal) return;
      if (packMoreLock.current[pack]) return;
      packMoreLock.current[pack] = true;
      setPackMorePending((prev) => ({ ...prev, [pack]: true }));
      const params = buildAgendaParams({
        scope: timeScope,
        commune: selectedCommune,
        q: titleLeftover.trim(),
        cats:
          selectedCategories.length > 0
            ? selectedCategories
            : [HOME_PACK_MORE_CAT[pack]],
        genres: selectedGenres,
        lieuId: selectedLieuId,
        selectedDate: selectedDay,
        year,
        month,
        offset: have,
        phraseMode,
        phraseTags,
        avecEnfants,
      });
      void fetch(`/api/agenda?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: AgendaListResponse | null) => {
          if (!data) return;
          const incoming = data.items ?? [];
          const leftoverOn = Boolean(titleLeftover.trim());
          const mergeUnique = (prev: DayItem[]) => {
            const seen = new Set(prev.map((item) => item.key));
            const extra = incoming.filter((item) => !seen.has(item.key));
            return extra.length ? [...prev, ...extra] : prev;
          };
          if (leftoverOn) setListItems(mergeUnique);
          else setVivantItems(mergeUnique);
          if (typeof data.theatreTotal === 'number') setTheatreTotal(data.theatreTotal);
          if (typeof data.musiqueTotal === 'number') setMusiqueTotal(data.musiqueTotal);
          if (typeof data.enfantsTotal === 'number') setEnfantsTotal(data.enfantsTotal);
          if (typeof data.expoTotal === 'number') setExpoTotal(data.expoTotal);
        })
        .catch(() => undefined)
        .finally(() => {
          packMoreLock.current[pack] = false;
          setPackMorePending((prev) => ({ ...prev, [pack]: false }));
        });
    },
    [
      timeScope,
      selectedCommune,
      titleLeftover,
      selectedCategories,
      selectedGenres,
      selectedLieuId,
      selectedDay,
      year,
      month,
      phraseMode,
      phraseTags,
      avecEnfants,
    ],
  );

  const selectedItem =
    selectedItemKey == null
      ? null
      : detailItem?.key === selectedItemKey
        ? detailItem
        : findDayItemByKey(
            selectedItemKey,
            top3Cards,
            pourToiFilled,
            pourToiItems,
            listItems,
            nouveautesItems,
            vivantItems,
            leftoverRows.map((r) => r.item),
          ) ?? peekPrefetchedAgendaItem(selectedItemKey);

  useEffect(() => {
    if (!selectedItemKey) {
      setDetailItem(null);
      setRelatedFilmItems([]);
      setAussiCeSoirItems([]);
      return;
    }
    const slim =
      findDayItemByKey(
        selectedItemKey,
        top3Cards,
        pourToiFilled,
        pourToiItems,
        listItems,
        nouveautesItems,
        vivantItems,
        leftoverRows.map((r) => r.item),
      ) ?? peekPrefetchedAgendaItem(selectedItemKey);
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
        // Share visit: keep film-wide related (Blagnac must not be stripped by Toulouse).
        if (
          selectedCommune &&
          slim &&
          isCinemaDayItem(slim) &&
          !hasShareToken &&
          !sharedSeanceKey
        ) {
          qs.set('commune', selectedCommune);
        }
        if (selectedLieuId && !hasShareToken && !sharedSeanceKey) {
          qs.set('lieu', selectedLieuId);
        }
        if (scopeRange.startIso) qs.set('date_from', scopeRange.startIso);
        if (scopeRange.endIso) qs.set('date_to', scopeRange.endIso);
        if (timeScope === 'soir') qs.set('soir', '1');
        const res = await fetch(`/api/agenda?${qs.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as AgendaDetailResponse;
        if (cancelled || gen !== detailFetchGen.current) return;
        setDetailItem(data.item);
        const relatedFilter =
          hasShareToken || sharedSeanceKey
            ? {
                ...relatedSeancesFilter(activeFilter, data.item),
                commune: null,
                lieuId: null,
              }
            : relatedSeancesFilter(activeFilter, data.item);
        setRelatedFilmItems(
          filterSeancesForActiveFilters(data.relatedItems ?? [], relatedFilter),
        );
        setAussiCeSoirItems(data.aussiCeSoir ?? []);
        if (!slim) trackItem(data.item, 'open_card');
        else rememberItem(data.item);
      } catch {
        /* slim already shown + tracked; keep fiche as-is */
      }
    })();
    return () => {
      cancelled = true;
    };
    // track by key so reopening the same fiche dedups in 30 min
  }, [selectedItemKey, activeFilter, hasShareToken, sharedSeanceKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (typeof snap.theatreTotal === 'number') setTheatreTotal(snap.theatreTotal);
        if (typeof snap.musiqueTotal === 'number') setMusiqueTotal(snap.musiqueTotal);
        if (typeof snap.enfantsTotal === 'number') setEnfantsTotal(snap.enfantsTotal);
        if (typeof snap.expoTotal === 'number') setExpoTotal(snap.expoTotal);
        applySlotTotals(
          snap,
          sectionSlotQueryKey({
            scope,
            day:
              scope === 'date'
                ? selectedDay || initialParisIso
                : scope === 'aujourdhui' || scope === 'soir'
                  ? initialParisIso
                  : null,
            year,
            month,
            commune: 'Toulouse',
          }),
        );
        setTotal(snap.total);
        setDensifiedTotalApi(snap.densifiedTotal);
        armBootListSkip(scope);
        setCatalogueReady(true);
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
        setTheatreTotal(initialTheatreTotal);
        setMusiqueTotal(initialMusiqueTotal);
        setEnfantsTotal(initialEnfantsTotal);
        setExpoTotal(initialExpoTotal);
        applySlotTotals(
          {
            cineSlotTotal: initialCineSlotTotal,
            theatreSlotTotal: initialTheatreSlotTotal,
            musiqueSlotTotal: initialMusiqueSlotTotal,
            enfantsSlotTotal: initialEnfantsSlotTotal,
            expoSlotTotal: initialExpoSlotTotal,
            autresSlotTotal: initialAutresSlotTotal,
          },
          bootSlotKey,
        );
        setTotal(initialTotal);
        setDensifiedTotalApi(initialDensifiedTotal);
        armBootListSkip('tous');
        setCatalogueReady(true);
      }
      return;
    }
    if (reuseBoot && snap) {
      listFetchGen.current += 1;
      setVisibleCount(AGENDA_PAGE_SIZE);
      applySnapshot();
    } else {
      beginDateChipFetch(scope);
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
    beginDateChipFetch('date');
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
    beginDateChipFetch('date');
    setTimeScope('date');
    setSelectedDay(null);
    setSelectedItemKey(null);
    setYear(nextYear);
    setMonth(nextMonth);
    setShowMonthPanel(true);
  }

  function handleSelectDay(iso: string) {
    beginDateChipFetch('date');
    searchDrivenRef.current.scope = false;
    setTimeScope('date');
    setSelectedDay(iso);
    syncMonthFromIso(iso);
    setSelectedItemKey(null);
    setShowMonthPanel(true);
  }

  function applyNearMeState(next: {
    active: boolean;
    pos: GeoPos | null;
    commune: string | null;
  }) {
    setNearMeActive(next.active);
    setUserPos(next.pos);
    setSelectedCommune(next.commune);
  }

  // Landing: getCurrentPosition once. Chip stays visible (no pending « … »).
  // Deny / error → Toulouse already on screen. Pos stays in React state only.
  useEffect(() => {
    let cancelled = false;
    void requestBrowserPosition().then((result) => {
      if (cancelled) return;
      // Keep the painted list/order. Do not refetch agenda with commune=null.
      // Slot totals stay the Toulouse inventory already on screen.
      skipListFetchBootGps.current = true;
      const next = nearMeFromBoot(result);
      if (next.commune !== 'Toulouse') {
        setSlotTotalsKey(
          sectionSlotQueryKey({
            scope: initialScope,
            commune: next.commune,
          }),
        );
      }
      applyNearMeState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [initialScope]);

  function handleNearMeToggle() {
    if (nearMePending) return;
    setNearMePending(true);
    void requestBrowserPosition().then((result) => {
      setNearMePending(false);
      const next = resolveNearMeResult(result, selectedCommune);
      setBrowseCommune(next.commune);
      applyNearMeState(next);
    });
  }

  function handleCommuneChange(next: string | null) {
    setNearMeActive(false);
    setUserPos(null);
    setBrowseCommune(next);
    setSelectedCommune(next);
  }

  function handleCategoriesChange(next: string[]) {
    searchDrivenRef.current.cat = false;
    const added = next.filter((c) => !selectedCategories.includes(c));
    setListFetchInFlight(true);
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
    // Paint the rail as in-flight on this commit. A skipped or
    // superseded GET still releases via releaseListTransition.
    setListFetchInFlight(true);
    setSelectedGenres(next);
    for (const chip of added) {
      track({ kind: 'chip_genre', chip, genres: [chip], moods: extractMoods(chip) });
    }
  }

  function fallbackToWeekend() {
    beginDateChipFetch('weekend');
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

  const filterBadge =
    selectedGenres.length +
    (selectedCommune !== 'Toulouse' ? 1 : 0) +
    (nearMeActive ? 1 : 0);

  const badgeDayIso =
    timeScope === 'date'
      ? selectedDay ||
        (scopeRange.startIso === scopeRange.endIso ? scopeRange.startIso : null)
      : null;
  const badgeMonthIso =
    timeScope === 'date' && !badgeDayIso ? scopeRange.startIso : null;
  const visibleSlotCount = (count: number) => (slotTotalsLive ? count : 0);
  const cineBadge = formatSectionBadge({
    count: visibleSlotCount(cineSlotTotal),
    unit: 'seance',
    scope: timeScope,
    dayIso: badgeDayIso,
    monthIso: badgeMonthIso,
  });
  const theatreBadge = formatSectionBadge({
    count: visibleSlotCount(theatreSlotTotal),
    unit: 'sortie',
    scope: timeScope,
    dayIso: badgeDayIso,
    monthIso: badgeMonthIso,
  });
  const musiqueBadge = formatSectionBadge({
    count: visibleSlotCount(musiqueSlotTotal),
    unit: 'sortie',
    scope: timeScope,
    dayIso: badgeDayIso,
    monthIso: badgeMonthIso,
  });
  const enfantsBadge = formatSectionBadge({
    count: visibleSlotCount(enfantsSlotTotal),
    unit: 'sortie',
    scope: timeScope,
    dayIso: badgeDayIso,
    monthIso: badgeMonthIso,
  });
  const expoBadge = formatSectionBadge({
    count: visibleSlotCount(expoSlotTotal),
    unit: 'sortie',
    scope: timeScope,
    dayIso: badgeDayIso,
    monthIso: badgeMonthIso,
  });
  const autresBadge = formatSectionBadge({
    count: visibleSlotCount(autresSlotTotal),
    unit: 'sortie',
    scope: timeScope,
    dayIso: badgeDayIso,
    monthIso: badgeMonthIso,
  });

  return (
    <div className="mx-auto max-w-7xl min-w-0 overflow-x-hidden px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
      <HomeAccroche />

      {/* Heights: keep HomeBootChrome + HomeListWaitSlot in sync (LAYOUT_JUMP). */}
      <div className="sticky top-[var(--a2hs-bar-h)] z-20 -mx-4 mb-2 border-b border-culture-line/80 bg-culture-cream/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <SearchOmnibox
              value={query}
              onChange={handleQueryChange}
              onSubmit={handleSearchSubmit}
              onBareQuery={handleBareQuery}
              onConfirm={handleNlConfirm}
              onPickTitre={handleSuggestTitre}
              onPickArtiste={handleSuggestArtiste}
              onPickSalle={handlePickSalle}
              venueLock={pickedLieuId ? pickedLieuLabel : null}
              genres={genresLegend.map((g) => ({ slug: g.slug, label: g.label_fr }))}
              communes={communes}
              lieux={searchLieux}
              suggest={searchSuggest}
            />
          </div>
          <MixHomeLink />
        </div>
      </div>
      <div className={HOME_CHROME_STACK_CLASS}>
        <div
          className="cc-filter-band"
          role="group"
          aria-label="Ville, quand et quoi"
        >
          <div className="cc-filter-band__place">
            <CityFilter
              communes={communes}
              selectedCommune={selectedCommune}
              onChange={handleCommuneChange}
              variant="inline"
              inactive={searchingUi}
            />
            {nearMeActive ? (
              <button
                type="button"
                onClick={() => {
                  const next = nearMeOnToggleOff();
                  setBrowseCommune(next.commune);
                  applyNearMeState(next);
                }}
                aria-pressed={false}
                className="cc-axes__chip shrink-0 rounded-full border border-culture-line bg-culture-surface font-medium text-culture-ink hover:border-culture-terracotta/50"
              >
                Toulouse
              </button>
            ) : null}
            <NearMeChip
              active={nearMeActive}
              pending={nearMePending}
              onToggle={handleNearMeToggle}
            />
          </div>
          <div className="cc-axes-row">
            <div className="cc-axes">
              <div className="cc-scroll-shell">
                <div className="cc-axes__group cc-axes__group--scroll">
                  <p className="cc-axes__label max-md:sr-only text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
                    Quand
                  </p>
                  <TimeScopeBar
                    scope={timeScope}
                    onChange={handleScopeChange}
                    hideLabel
                  />
                </div>
              </div>
              <div
                role="separator"
                aria-hidden
                className="cc-axes__rule"
              />
              <div className="cc-scroll-shell">
                <div className="cc-axes__group cc-axes__group--scroll">
                  <p className="cc-axes__label max-md:sr-only text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
                    Quoi
                  </p>
                  <CategoryFilter
                    selected={selectedCategories}
                    onChange={handleCategoriesChange}
                    variant="home"
                  />
                  {selectedCategories.length > 0 ? (
                    <div className="cc-axes__more">
                      <button
                        type="button"
                        onClick={() => setFacetsOpen((v) => !v)}
                        className="cc-axes__chip inline-flex items-center gap-1 rounded-full border border-culture-line bg-culture-surface font-medium text-culture-ink hover:border-culture-terracotta/50"
                        aria-expanded={facetsOpen}
                        aria-controls="cc-filter-facets"
                      >
                        Filtres
                        {filterBadge > 0 ? (
                          <span className="rounded-full bg-culture-terracotta px-1.5 text-xs text-planc-nuit">
                            {filterBadge}
                          </span>
                        ) : null}
                        <span aria-hidden className="text-culture-muted">
                          {facetsOpen ? '▴' : '▾'}
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          {/* GENRES: disclosure row only while Filtres is open. */}
          {selectedCategories.length > 0 && facetsOpen ? (
            <div id="cc-filter-facets" className="cc-filter-band__facets">
              <div className="cc-filter-band__genres">
                {/* GENRES: second band only when a category is on. */}
                <GenreFilter
                  availableSlugs={genreChipSlugs}
                  legend={genresLegend}
                  selected={selectedGenres}
                  onChange={handleGenresChange}
                  selectedMains={selectedCategories}
                  hideWhenNoCategory
                  loading={genresLoading}
                />
              </div>
            </div>
          ) : null}
        </div>

        {showAdminCounts ? (
          <p
            className="text-[11px] tabular-nums leading-tight text-culture-muted"
            aria-label="Totaux agenda (debug)"
          >
            {adminCountLine}
          </p>
        ) : null}

        <div className="relative">
        <HomeListWaitSlot active={listSlowWhere === 'top'} />

        <MonthCalendarDrawer
          open={showMonthPanel}
          onClose={() => setShowMonthPanel(false)}
          title={monthLabel}
        >
          {showMonthPanel ? (
            <MonthCalendar
              year={year}
              month={month}
              selectedDay={timeScope === 'date' ? selectedDay : null}
              counts={counts}
              showDayCounts
              onSelectDay={handleSelectDay}
              onPrevMonth={goPrevMonth}
              onNextMonth={goNextMonth}
              embedded
            />
          ) : null}
        </MonthCalendarDrawer>

        <CharteRegisterLine register={register} copy={copy} />

        {showTop3Section && !avecEnfants ? (
        <section
          className={TOP3_SECTION_CLASS}
          data-top3=""
          data-top3-count={recoReady ? top3Cards.length : undefined}
          data-top3-pending={top3Mode === 'skeleton' ? '' : undefined}
        >
          <h2 className={HOME_SECTION_TITLE_CLASS}>
            <span
              className={HOME_SECTION_TITLE_RULE_CLASS}
              style={homeSectionAccentStyle(HOME_SECTION_TITLE_ACCENT_VAR)}
            >
              {top3Heading(
                recoReady ? top3Cards.length : 3,
                sessionStatus === 'authenticated',
              )}
            </span>
          </h2>
          {sessionStatus !== 'authenticated' ? (
            <Top3GuestCta
              onClick={
                sessionStatus === 'unauthenticated'
                  ? () => signIn('google', { callbackUrl: '/' })
                  : undefined
              }
            />
          ) : null}
          {top3Mode !== 'skeleton' && top3ImpressionKeys.length > 0 ? (
            <ListImpressionProbe
              surface="top3"
              scope={`home:${timeScope}`}
              itemKeys={top3ImpressionKeys}
            />
          ) : null}
          {top3Mode === 'skeleton' ? (
            <Top3Skeleton />
          ) : (
            <SeanceGrid
              items={top3Cards}
              showDate={showDateLabels}
              onSelectItem={handleSelectTop3}
              empty={null}
              nouveauFilmIds={nouveauFilmIdSet}
              fixedSlots
              reasonFor={reasonFor}
              origin={gpsOrigin}
            />
          )}
        </section>
        ) : null}
        </div>

        {proposePlace === 'empty' ? (
          <ProposeEmptyCard onPropose={openProposeFlow} />
        ) : null}

        {showHomeRails &&
        listEmpty &&
        !showCineBlock &&
        !showTheatreBlock &&
        !showMusiqueBlock &&
        !showEnfantsBlock &&
        !showExpoBlock &&
        proposePlace !== 'empty' &&
        !(searchingUi && !phraseDateClash) ? (
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
                    className="min-h-10 rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-planc-nuit hover:bg-culture-clay"
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
                    className="min-h-10 rounded-full border border-culture-terracotta bg-culture-surface px-5 py-2.5 text-sm font-semibold text-culture-terracotta hover:bg-planc-nuit"
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
                  className="mt-5 mr-2 min-h-10 rounded-full border border-culture-terracotta bg-culture-surface px-5 py-2.5 text-sm font-semibold text-culture-terracotta hover:bg-planc-nuit"
                >
                  Voir aujourd&apos;hui
                </button>
              )}
              {timeScope !== 'weekend' && (
                <button
                  type="button"
                  onClick={fallbackToWeekend}
                  className="mt-5 min-h-10 rounded-full bg-culture-terracotta px-5 py-2.5 text-sm font-semibold text-planc-nuit hover:bg-culture-clay"
                >
                  Voir ce week-end
                </button>
              )}
            </div>
          )
        ) : null}


        {enfantsModeReady ? (
          <HomeSection
            id="avec-enfants"
            title="Avec les enfants"
            accentVar={PACK_CAT_CSS_VAR.enfants}
            count={total}
            shown={listItems.length}
            badge={total > 0 ? `${total} séances` : null}
            expanded={listItems.length >= total}
            onSeeAll={() => {
              if (listItems.length < total) handleLoadMore();
            }}
          >
            {listItems.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-culture-line bg-culture-surface px-6 py-8 text-center font-display text-xl text-culture-ink">
                Rien à venir avec les enfants sur cette période.
              </p>
            ) : (
              <SeanceGrid
                items={listItems}
                showDate={showDateLabels || timeScope === 'tous'}
                onSelectItem={handleSelectHome}
                nouveauFilmIds={nouveauFilmIdSet}
                origin={gpsOrigin}
                oneCardPerSeance
              />
            )}
          </HomeSection>
        ) : null}

        {enfantsModePending ? (
          <div className="flex justify-center py-10" data-enfants-mode-pending="">
            <ListWaitDots />
          </div>
        ) : null}

        {showHomeRails && cineRailPaint === 'rows' ? (
          <HomeSection
            id="cine"
            title="Ciné"
            accentVar={PACK_CAT_CSS_VAR.cine}
            count={cineCount}
            badge={cineBadge}
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
            <ListImpressionProbe
              surface="section"
              scope={`cine:${timeScope}`}
              itemKeys={cineImpressionKeys}
            />
            <CinemaCarousel
              key={`cine-q-${titleLeftover.trim().toLowerCase()}`}
              rows={visibleCineRows}
              pack="cine"
              mobile={narrowHome}
              focusKey={cineFocusKey}
              selectedCommune={selectedCommune}
              selectedLieuId={selectedLieuId}
              dateFrom={scopeRange.startIso}
              dateTo={scopeRange.endIso}
              soir={timeScope === 'soir'}
              datePinned={timeScope !== 'tous'}
              genres={selectedGenres}
              categories={selectedCategories}
              titleQuery={titleLeftover}
              hasMore={
                cineLimit < frozenCineRows.length || listItems.length < total
              }
              loadingMore={Boolean(packMorePending.cine)}
              onNeedMore={() => {
                setCineExpanded(true);
                setCineLimit((n) => n + cineFirstPaint(narrowHome));
                if (listItems.length < total) handleLoadMore();
              }}
              fallbackVivant={crossSellPool}
              onAgenda={(item) => trackItem(item, 'agenda_add')}
              onIcs={(item) => trackItem(item, 'ics')}
              onReserve={(item) => trackItem(item, 'reserve')}
              onSelectLive={handleSelectHome}
              origin={gpsOrigin}
            />
          </HomeSection>
        ) : showHomeRails && cineRailPaint === 'skeleton' ? (
          <PackRailSkeleton id="cine" title="Cinéma" showMore={false} />
        ) : showHomeRails && cineRailPaint === 'empty' ? (
          <PackRailEmpty id="cine" title="Cinéma" />
        ) : null}

        {showHomeRails && (showTheatreBlock || showMusiqueBlock) ? (
          <div
            data-en-live=""
            aria-label="En live"
            className="space-y-2.5 sm:space-y-4"
          >
            {theatreRailPaint === 'rows' ? (
              <HomeSection
                id="theatre"
                title="Théâtre & spectacle vivant"
                accentVar={PACK_CAT_CSS_VAR.theatre}
                count={theatreCount}
                badge={theatreBadge}
                shown={visibleTheatreRows.length}
                expanded={
                  theatreLimit >= frozenTheatreRows.length &&
                  frozenTheatreRows.length >= theatreTotal
                }
                onSeeAll={() => handleLivingPackMore('theatre', true)}
              >
                <ListImpressionProbe
                  surface="section"
                  scope={`theatre:${timeScope}`}
                  itemKeys={theatreImpressionKeys}
                />
                <CinemaCarousel
                  key={`theatre-q-${titleLeftover.trim().toLowerCase()}`}
                  rows={visibleTheatreRows}
                  pack="theatre"
                  mobile={narrowHome}
                  focusKey={theatreFocusKey}
                  selectedCommune={selectedCommune}
                  selectedLieuId={selectedLieuId}
                  dateFrom={scopeRange.startIso}
                  dateTo={scopeRange.endIso}
                  soir={timeScope === 'soir'}
                  datePinned={timeScope !== 'tous'}
                  genres={selectedGenres}
                  categories={selectedCategories}
                  titleQuery={titleLeftover}
                  hasMore={
                    theatreLimit < frozenTheatreRows.length ||
                    (theatreTotal > 0 &&
                      frozenTheatreRows.length < theatreTotal)
                  }
                  loadingMore={Boolean(packMorePending.theatre)}
                  onNeedMore={() => handleLivingPackMore('theatre')}
                  fallbackVivant={allMusiqueRows.map((row) => row.item)}
                  onAgenda={(item) => trackItem(item, 'agenda_add')}
                  onIcs={(item) => trackItem(item, 'ics')}
                  onReserve={(item) => trackItem(item, 'reserve')}
                  onSelectLive={handleSelectHome}
                  origin={gpsOrigin}
                />
              </HomeSection>
            ) : theatreRailPaint === 'skeleton' ? (
              <PackRailSkeleton id="theatre" title="Théâtre" />
            ) : theatreRailPaint === 'empty' ? (
              <PackRailEmpty id="theatre" title="Théâtre" />
            ) : null}

            {showMusiqueBlock ? (
              <HomeSection
                id="musique"
                title="Musique"
                accentVar={PACK_CAT_CSS_VAR.musique}
                count={musiqueCount}
                badge={musiqueBadge}
                shown={visibleMusiqueRows.length}
                expanded={
                  musiqueLimit >= frozenMusiqueRows.length &&
                  frozenMusiqueRows.length >= musiqueTotal
                }
                onSeeAll={() => handleLivingPackMore('musique', true)}
              >
                <ListImpressionProbe
                  surface="section"
                  scope={`musique:${timeScope}`}
                  itemKeys={musiqueImpressionKeys}
                />
                <CinemaCarousel
                  key={`musique-q-${titleLeftover.trim().toLowerCase()}`}
                  rows={visibleMusiqueRows}
                  pack="musique"
                  mobile={narrowHome}
                  focusKey={musiqueFocusKey}
                  selectedCommune={selectedCommune}
                  selectedLieuId={selectedLieuId}
                  dateFrom={scopeRange.startIso}
                  dateTo={scopeRange.endIso}
                  soir={timeScope === 'soir'}
                  datePinned={timeScope !== 'tous'}
                  genres={selectedGenres}
                  categories={selectedCategories}
                  titleQuery={titleLeftover}
                  hasMore={
                    musiqueLimit < frozenMusiqueRows.length ||
                    (musiqueTotal > 0 &&
                      frozenMusiqueRows.length < musiqueTotal)
                  }
                  loadingMore={Boolean(packMorePending.musique)}
                  onNeedMore={() => handleLivingPackMore('musique')}
                  fallbackVivant={allTheatreRows.map((row) => row.item)}
                  onAgenda={(item) => trackItem(item, 'agenda_add')}
                  onIcs={(item) => trackItem(item, 'ics')}
                  onReserve={(item) => trackItem(item, 'reserve')}
                  onSelectLive={handleSelectHome}
                  origin={gpsOrigin}
                />
              </HomeSection>
            ) : null}
          </div>
        ) : null}

        {showHomeRails && showEnfantsBlock ? (
          <HomeSection
            id="enfants"
            title="Enfants"
            accentVar={PACK_CAT_CSS_VAR.enfants}
            count={enfantsCount}
            badge={enfantsBadge}
            shown={visibleEnfantsRows.length}
            expanded={
              enfantsLimit >= frozenEnfantsRows.length &&
              frozenEnfantsRows.length >= enfantsTotal
            }
            onSeeAll={() => handleLivingPackMore('enfants', true)}
          >
            <ListImpressionProbe
              surface="section"
              scope={`enfants:${timeScope}`}
              itemKeys={enfantsImpressionKeys}
            />
            <CinemaCarousel
              key={`enfants-q-${titleLeftover.trim().toLowerCase()}`}
              rows={visibleEnfantsRows}
              pack="enfants"
              mobile={narrowHome}
              focusKey={enfantsFocusKey}
              selectedCommune={selectedCommune}
              selectedLieuId={selectedLieuId}
              dateFrom={scopeRange.startIso}
              dateTo={scopeRange.endIso}
              soir={timeScope === 'soir'}
              datePinned={timeScope !== 'tous'}
              genres={selectedGenres}
              categories={selectedCategories}
              titleQuery={titleLeftover}
              hasMore={
                enfantsLimit < frozenEnfantsRows.length ||
                (enfantsTotal > 0 && frozenEnfantsRows.length < enfantsTotal)
              }
              loadingMore={Boolean(packMorePending.enfants)}
              onNeedMore={() => handleLivingPackMore('enfants')}
              fallbackVivant={crossSellPool}
              onAgenda={(item) => trackItem(item, 'agenda_add')}
              onIcs={(item) => trackItem(item, 'ics')}
              onReserve={(item) => trackItem(item, 'reserve')}
              onSelectLive={handleSelectHome}
              origin={gpsOrigin}
            />
          </HomeSection>
        ) : null}

        {showHomeRails && showExpoBlock ? (
          <HomeSection
            id="expos"
            title="Expos"
            accentVar={PACK_CAT_CSS_VAR.expo}
            count={expoCount}
            badge={expoBadge}
            shown={visibleExpoRows.length}
            expanded={
              expoLimit >= frozenExpoRows.length &&
              frozenExpoRows.length >= expoTotal
            }
            onSeeAll={() => handleLivingPackMore('expo', true)}
          >
            <ListImpressionProbe
              surface="section"
              scope={`expo:${timeScope}`}
              itemKeys={expoImpressionKeys}
            />
            <CinemaCarousel
              key={`expo-q-${titleLeftover.trim().toLowerCase()}`}
              rows={visibleExpoRows}
              pack="expo"
              mobile={narrowHome}
              focusKey={expoFocusKey}
              selectedCommune={selectedCommune}
              selectedLieuId={selectedLieuId}
              dateFrom={scopeRange.startIso}
              dateTo={scopeRange.endIso}
              soir={timeScope === 'soir'}
              datePinned={timeScope !== 'tous'}
              genres={selectedGenres}
              categories={selectedCategories}
              titleQuery={titleLeftover}
              hasMore={
                expoLimit < frozenExpoRows.length ||
                (expoTotal > 0 && frozenExpoRows.length < expoTotal)
              }
              loadingMore={Boolean(packMorePending.expo)}
              onNeedMore={() => handleLivingPackMore('expo')}
              fallbackVivant={crossSellPool}
              onAgenda={(item) => trackItem(item, 'agenda_add')}
              onIcs={(item) => trackItem(item, 'ics')}
              onReserve={(item) => trackItem(item, 'reserve')}
              onSelectLive={handleSelectHome}
              origin={gpsOrigin}
            />
          </HomeSection>
        ) : null}

        {showHomeRails && leftoverRows.length > 0 ? (
          <HomeSection
            id="autres"
            title="Aussi"
            count={leftoverRows.length}
            badge={autresBadge}
            shown={leftoverRows.length}
          >
            {leftoverImpressionKeys.length > 0 ? (
              <ListImpressionProbe
                surface="section"
                scope={`autres:${timeScope}`}
                itemKeys={leftoverImpressionKeys}
              />
            ) : null}
            <SeanceGrid
              items={leftoverRows.map((r) => r.item)}
              showDate={showDateLabels}
              onSelectItem={handleSelectHome}
              nouveauFilmIds={nouveauFilmIdSet}
              origin={gpsOrigin}
            />
          </HomeSection>
        ) : null}

        {proposePlace === 'footer' ? (
          <ProposeListFooter onPropose={openProposeFlow} />
        ) : null}

        {listSlowWhere === 'bottom' ? (
          <div
            className="pointer-events-none flex justify-center"
            style={{ margin: 8 }}
          >
            <ListWaitDots />
          </div>
        ) : null}

        {proposePlace === 'empty' ? null : <LoginNudge />}
      </div>

      <TastesOverlayHost />

      <MesRecosSheet
        open={mesRecosOpen}
        onClose={closeMesRecos}
        cards={weekTop3Cards}
        copyState={mesRecosCopyState}
        poolReady={weekPoolReady}
        onSelectCard={handleSelectMesRecosCard}
        onNotInterested={dismissWork}
        notInterested={workIsNotInterested}
      />

      <ProposeSpectacleSheet
        open={proposeOpen}
        query={titleLeftover.trim()}
        onClose={() => setProposeOpen(false)}
        onNeedAuth={() => {
          setProposeOpen(false);
          void signIn('google', { callbackUrl: '/' });
        }}
      />

      {selectedItem ? (
        <EventDetail
          item={selectedItem}
          onClose={() => {
            setSelectedItemKey(null);
            setFicheSeed(null);
            clearDeepLinkUrlParams();
          }}
          relatedItems={relatedFilmItems}
          aussiCeSoirItems={aussiCeSoirItems}
          onSelectItem={handleSelectHome}
          onAgenda={() => selectedItem && trackItem(selectedItem, 'agenda_add')}
          onIcs={() => selectedItem && trackItem(selectedItem, 'ics')}
          onReserve={() => selectedItem && trackItem(selectedItem, 'reserve')}
          selectedCommune={selectedCommune}
          selectedLieuId={selectedLieuId}
          fallbackVivant={crossSellPool}
          origin={gpsOrigin}
        />
      ) : selectedItemKey ? (
        <DeepLinkFicheFallback
          item={null}
          seed={ficheSeed}
          showCatalogueShell={false}
        />
      ) : null}
    </div>
  );
}
