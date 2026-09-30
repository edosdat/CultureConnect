'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayItem, GenreLegend, Lieu } from '@/lib/types';
import type { AgendaDetailResponse, AgendaListResponse } from '@/lib/slim';
import { HOME_PACK_WIRE_CAP } from '@/lib/slim';
import {
  guestBootRecoPoolKey,
  shouldPaintGuestBootReco,
  shouldSkipGuestBootRecoPost,
} from '@/lib/guestBootReco';
import { profileHasChipWeight } from '@/lib/reco';
import {
  extractMoods,
  profileHasZeroWeights,
} from '@/lib/signals';
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
  resolveSearchSubmit,
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
import VenueFilter from './VenueFilter';
import SeanceGrid from './SeanceGrid';
import Top3Skeleton from './Top3Skeleton';
import TimeScopeBar from './TimeScopeBar';
import SearchOmnibox from './SearchOmnibox';
import ListWaitDots, { HomeListWaitSlot } from './ListWaitDots';
import Top3GuestCta from './Top3GuestCta';
import HomeSection from './HomeSection';
import ListImpressionProbe from './ListImpressionProbe';
import { impressionItemKey } from '@/lib/impressions';
import HomeAccroche from './HomeAccroche';
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
const LoginNudge = dynamic(() => import('./LoginNudge'), { ssr: false });
import CinemaCarousel from './CinemaCarousel';
import {
  phraseUsesTitleQ,
  type PhraseTags,
} from '@/lib/phraseTags';
import {
  leftoverTitleAfterDraftChange,
  searchChipsToUi,
  searchSubmitAppliesChips,
  type SearchChipParse,
} from '@/lib/parseSearchChips';
import { clearDeepLinkUrlParams, normalizeDeepLinkId } from '@/lib/deepLink';
import DeepLinkFicheFallback from './DeepLinkFicheFallback';
import {
  OPEN_FICHE_EVENT,
  type OpenFicheDetail,
  type OpenFicheSeed,
} from './openFicheEvents';
import { peekPrefetchedAgendaItem } from '@/lib/agendaItemPrefetch';
import {
  buildAgendaParams,
  dateChipListGate,
  listFetchShouldSkipBoot,
  listFetchShouldSkipBootGps,
  listGenerationShouldSettle,
} from '@/lib/agendaParams';
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
  initialVenues: Lieu[];
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
  initialVenues,
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
  /** Mode « Avec les enfants » — not a category chip. */
  const [avecEnfants, setAvecEnfants] = useState(false);
  /** List payload that was fetched with the mode flag (avoids a stale rail). */
  const [listAvecEnfants, setListAvecEnfants] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLieuId, setSelectedLieuId] = useState<string | null>(null);
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
  const lastSearchChipsRef = useRef({ scope: '', date: '', cat: '' });
  const [showMonthPanel, setShowMonthPanel] = useState(false);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
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
  const [venueOptions, setVenueOptions] = useState<Lieu[]>(initialVenues);
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
    avecEnfants: false,
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
      if (data.venues?.length) setVenueOptions(data.venues);
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
    const run = () => {
      void fetch('/api/agenda?window=home')
        .then((res) => (res.ok ? res.json() : null))
        .then((data: AgendaListResponse | null) => {
          if (cancelled || !data) return;
          mergeBoot(data);
        })
        .catch(() => undefined);
    };
    const idle = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(idle);
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
    // Always apply — empty draft must drop leftover q even if leftover state is stale.
    setCommittedTitle((current) => leftoverTitleAfterDraftChange(next, current));
    if (!(next || '').trim()) setPhraseTags(null);
  }

  function handleSearchSubmit(raw: string) {
    const intent = resolveSearchSubmit(raw);
    applyParsedChips(intent.parsed, raw);
    setPhraseTags(intent.phraseTags);
    setCommittedTitle(intent.titleQuery);
    if (intent.commune) handleCommuneChange(intent.commune);
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
      setVenueOptions(data.venues ?? []);
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
            recoFetchedKeysRef.current.add(job.key);
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
    if (skipBootList) {
      skipListFetch.current = false;
      skipListFetchScope.current = null;
      // Painted « tous » is not the kids list. A mode toggle must still GET.
      if (!avecEnfants) {
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
  const pourToiFilled = useMemo(
    () => fillEmptyCineFromPool(pourToiItems, cineSource),
    [pourToiItems, cineSource],
  );
  const top3Cards = useMemo(
    () => visibleTop3Items(pourToiFilled),
    [pourToiFilled],
  );
  const top3ImpressionKeys = useMemo(
    () => top3Cards.map(impressionItemKey).filter(Boolean),
    [top3Cards],
  );

  useEffect(() => {
    for (const item of top3Cards) rememberItem(item);
    for (const item of pourToiFilled) rememberItem(item);
    if (detailItem) rememberItem(detailItem);
  }, [top3Cards, pourToiFilled, detailItem, rememberItem]);
  // Category chips stay in the opts so a QUOI selection cannot grow a second
  // hide gate here. top3PaintMode ignores them; wipe / title / phrase still hide.
  const top3Mode = top3PaintMode({
    ready: recoReady,
    wiped: recoWiped,
    cardCount: top3Cards.length,
    selectedCategories,
    committedTitle,
    phraseActive: phraseMode,
  });
  const showTop3Section = top3Mode !== 'hidden';
  const pourToiKeys = useMemo(
    () => new Set(pourToiFilled.map((item) => item.key)),
    [pourToiFilled],
  );
  const pourToiFilmIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of pourToiFilled) {
      const fid = filmIdOfItem(item);
      if (fid) ids.add(fid);
    }
    return ids;
  }, [pourToiFilled]);
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
    return top3IdentitySet(pourToiFilled);
  }, [pourToiFilled]);
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
  const enfantsModeReady = avecEnfants && listAvecEnfants;
  const enfantsModePending = avecEnfants !== listAvecEnfants;
  /** Home rails stay hidden while the kids list is showing or still loading. */
  const showHomeRails = !avecEnfants && !listAvecEnfants;

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
    if (authStatus !== 'authenticated') {
      void signIn('google', { callbackUrl: '/' });
      return;
    }
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
    setVisibleCount(AGENDA_PAGE_SIZE);
    setCineExpanded(false);
    setCineLimit(cineFirstPaint(narrowHome));
    setTheatreLimit(HOME_PACK_WIRE_CAP);
    setMusiqueLimit(HOME_PACK_WIRE_CAP);
    setEnfantsLimit(HOME_PACK_WIRE_CAP);
    setExpoLimit(HOME_PACK_WIRE_CAP);
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
        setVenueOptions(snap.venues ?? []);
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
        setVenueOptions(initialVenues);
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

  function handleSelectVenue(lieuId: string) {
    setSelectedLieuId(lieuId);
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
    (selectedLieuId ? 1 : 0) +
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
      <div className="sticky top-0 z-20 -mx-4 mb-2 border-b border-culture-line/80 bg-culture-cream/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6">
        <SearchOmnibox
          value={query}
          onChange={handleQueryChange}
          onSubmit={handleSearchSubmit}
        />
      </div>
      <div className={HOME_CHROME_STACK_CLASS}>
        <div className="cc-axes-row">
          <div
            className="cc-axes"
            role="group"
            aria-label="Quand et quoi"
          >
            <div className="cc-axes__group">
              <p className="cc-axes__label text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
                Quand
              </p>
              <TimeScopeBar
                scope={timeScope}
                onChange={handleScopeChange}
                hideLabel
              />
            </div>
            <div
              role="separator"
              aria-hidden
              className="cc-axes__rule"
            />
            <div className="cc-axes__group">
              <p className="cc-axes__label text-[11px] font-semibold uppercase tracking-[0.14em] text-culture-muted">
                Quoi
              </p>
              <CategoryFilter
                selected={selectedCategories}
                onChange={handleCategoriesChange}
                variant="home"
              />
              <button
                type="button"
                onClick={() => setAvecEnfants((on) => !on)}
                aria-pressed={avecEnfants}
                data-enfants-mode=""
                className="cc-axes__chip shrink-0 whitespace-nowrap rounded-full font-semibold transition"
                style={{
                  borderWidth: 1.5,
                  borderStyle: 'solid',
                  borderColor: 'var(--cat-enfants)',
                  backgroundColor: avecEnfants
                    ? 'var(--cat-enfants)'
                    : 'var(--cc-surface)',
                  color: avecEnfants ? '#fff' : 'var(--cc-ink)',
                }}
              >
                Avec les enfants
              </button>
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
          </div>
        </div>

        {/* Genres: mobile shows them as soon as a QUOI chip is on (or Filtres);
            always on md+. hideWhenNoCategory keeps the block empty until QUOI. */}
        <div
          className={
            (showFiltersMobile || selectedCategories.length > 0
              ? 'flex'
              : 'hidden') + ' flex-col gap-2.5 md:flex md:gap-4'
          }
        >
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

        {/* Toulouse + Salles + month (Venue gated by Filtres on mobile) */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {showAdminCounts ? (
              <p
                className="text-[11px] tabular-nums leading-tight text-culture-muted"
                aria-label="Totaux agenda (debug)"
              >
                {adminCountLine}
              </p>
            ) : null}
            {/* First paint / SSR: Toulouse + Près de moi stay visible (no hidden / Filtres gate). */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                  className="shrink-0 rounded-full border border-culture-line bg-culture-surface px-3 py-1.5 text-sm font-medium text-culture-ink hover:border-culture-terracotta/50"
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
            <div
              className={
                (showFiltersMobile ? 'flex' : 'hidden') +
                ' min-w-0 flex-wrap items-center gap-2 md:flex'
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
              showDayCounts={showAdminCounts}
              onSelectDay={handleSelectDay}
              onPrevMonth={goPrevMonth}
              onNextMonth={goNextMonth}
              embedded
            />
          ) : null}
        </MonthCalendarDrawer>

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
              onSelectVenue={handleSelectVenue}
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
          <ProposeEmptyCard
            signedIn={authStatus === 'authenticated'}
            onPropose={openProposeFlow}
          />
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
                onSelectVenue={handleSelectVenue}
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
              onSelectVenue={handleSelectVenue}
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
          onSelectVenue={handleSelectVenue}
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
