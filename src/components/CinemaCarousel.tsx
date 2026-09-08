'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type TouchEvent } from 'react';
import type { DayItem } from '@/lib/types';
import type { AgendaDetailResponse } from '@/lib/slim';
import type { DenseRow } from '@/lib/densify';
import {
  HERO_SCROLL_DEFER_MS,
  HERO_SWIPE_LOCK_MS,
  adoptFirstPaintHero,
  appendOnlyStripRows,
  ensureHeroKey,
  applyStoredStripOrder,
  holdThumbFocus,
  heroScrollDeferMs,
  heroWindowScrollY,
  pinFromHeroRow,
  readPackHeroPin,
  readPackStripKeys,
  resolveHeroAfterRowsChange,
  resolveHeroIndex,
  resolveThumbSelectIndex,
  shouldIgnoreHeroSwipe,
  shouldIgnoreRepeatThumbSelect,
  stripScrollLeftToHoldThumb,
  writePackHeroPin,
  writePackStripKeys,
  type CarouselHeroRow,
  type HeroPin,
} from '@/lib/carouselSelect';
import {
  calendarPayloadFromDayItem,
  downloadIcs,
  googleCalendarUrl,
} from '@/lib/calendar';
import { formatDateFr, formatLieuAffiche } from '@/lib/labels';
import { seanceTimeLabel } from '@/lib/eventTimes';
import {
  filterSeancesForActiveFilters,
  sortSeances,
  type DisplayFilter,
} from '@/lib/displayFilter';
import { seanceDateIso } from '@/lib/timeScope';
import {
  HOME_PACK_MORE_LABEL,
  isLikelyMobile,
  itemPitch,
  rowDisplayTitle,
  seanceWhen,
} from '@/lib/displayHome';
import { itemKmLabel, minKmLabel, type GeoPos } from '@/lib/nearMe';
import { cineDistanceOrigin, defaultCineSeance } from '@/lib/cineSeances';
import { pickFilmVivantComplements } from '@/lib/filmVivantComplements';
import { rawUrls, reservePickOf } from '@/lib/reserve';
import EventImage from './EventImage';
import VisualFallback, { categoryLabelOf } from './VisualFallback';
import TheatreUrgenceBadge from './TheatreUrgenceBadge';
import FilmPoster from './FilmPoster';
import FavoriteButton from './FavoriteButton';
import ShareButton from './ShareButton';
import { useSignals } from './SignalsProvider';
import VivantComplementLinks from './VivantComplementLinks';
import PressCitation from './PressCitation';
import CineSeancePicker from './CineSeancePicker';
import FicheDescription from './FicheDescription';
import { fichePressCitation, pressItemForFiche } from '@/lib/pressCitation';

export type CinemaCarouselPack =
  | 'cine'
  | 'theatre'
  | 'musique'
  | 'enfants'
  | 'expo';

const PACK_COPY: Record<
  CinemaCarouselPack,
  { more: string; prev: string; next: string; fallbackCat: string }
> = {
  cine: {
    more: HOME_PACK_MORE_LABEL.cine,
    prev: 'Films précédents',
    next: 'Films suivants',
    fallbackCat: 'Cinéma',
  },
  theatre: {
    more: HOME_PACK_MORE_LABEL.theatre,
    prev: 'Spectacles précédents',
    next: 'Spectacles suivants',
    fallbackCat: 'Théâtre',
  },
  musique: {
    more: HOME_PACK_MORE_LABEL.musique,
    prev: 'Concerts précédents',
    next: 'Concerts suivants',
    fallbackCat: 'Musique',
  },
  enfants: {
    more: HOME_PACK_MORE_LABEL.enfants,
    prev: 'Précédent',
    next: 'Suivant',
    fallbackCat: 'Enfants',
  },
  expo: {
    more: HOME_PACK_MORE_LABEL.expo,
    prev: 'Expos précédentes',
    next: 'Expos suivantes',
    fallbackCat: 'Expos',
  },
};

type Props = {
  rows: DenseRow[];
  pack?: CinemaCarouselPack;
  mobile?: boolean;
  focusKey?: string | null;
  fallbackVivant?: DayItem[];
  selectedCommune?: string | null;
  selectedLieuId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  soir?: boolean;
  /** Date or time window is on — short list. Otherwise a séances dropdown. */
  datePinned?: boolean;
  hasMore?: boolean;
  onNeedMore?: () => void;
  onAgenda?: (item: DayItem) => void;
  onIcs?: (item: DayItem) => void;
  onReserve?: (item: DayItem) => void;
  onSelectLive?: (key: string) => void;
  origin?: GeoPos | null;
};

function posterUrl(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.image_url || '').trim() ||
      (item.evenement?.image_url || '').trim()
    );
  }
  return (item.evenement.image_url || '').trim();
}

function webcalHref(itemKey: string): string {
  if (typeof window === 'undefined') return '';
  const host = window.location.host;
  const path = `/api/calendar/${encodeURIComponent(itemKey)}`;
  if (window.location.protocol === 'https:') return `webcal://${host}${path}`;
  return `${window.location.origin}${path}`;
}

function FilmThumb({
  row,
  onArm,
  onSelect,
  active,
  distanceKm,
}: {
  row: DenseRow;
  /** Touchstart: remember this film before the strip can jump. */
  onArm?: () => void;
  onSelect: (opts?: { immediateScroll?: boolean }) => void;
  active?: boolean;
  /** Default (nearest) cinema km only — never a pile of salles. */
  distanceKm?: string | null;
}) {
  const item = row.item;
  const image = posterUrl(item);
  const title = rowDisplayTitle(row);
  const when = seanceWhen(item, row.earliestHeure);
  return (
    <button
      type="button"
      data-thumb-key={row.groupKey}
      onTouchStart={(e) => {
        holdThumbFocus(e.currentTarget);
        onArm?.();
      }}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        holdThumbFocus(e.currentTarget);
        // Touch: arm only — commit on click with the armed groupKey.
        // Mouse: desktop-narrow clicks are reliable; commit now.
        if (e.pointerType === 'touch') {
          onArm?.();
          return;
        }
        onSelect({ immediateScroll: true });
      }}
      onClick={(e) => {
        if (e.detail === 0) onSelect({ immediateScroll: true });
        else onSelect();
      }}
      aria-current={active ? 'true' : undefined}
      className="group flex w-[7.5rem] shrink-0 flex-col touch-manipulation text-left focus-visible:!outline-none sm:w-[8.5rem]"
    >
      <div
        className={
          'relative aspect-[2/3] overflow-hidden rounded-lg bg-culture-sand ' +
          (active
            ? 'border-2 border-culture-terracotta shadow-sm'
            : 'border-2 border-culture-line') +
          ' group-focus-visible:ring-2 group-focus-visible:ring-inset group-focus-visible:ring-culture-ink'
        }
      >
        <EventImage
          src={image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover object-top"
          fallback={<VisualFallback item={item} compact />}
        />
        <span className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-0.75rem)] flex-wrap items-center gap-1">
          {when ? (
            <span className="rounded bg-culture-ink/85 px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-white">
              {when}
            </span>
          ) : null}
          <TheatreUrgenceBadge item={item} />
        </span>
      </div>
      <p
        title={title}
        className="mt-1.5 min-w-0 w-full break-words line-clamp-2 text-sm font-semibold leading-snug text-culture-ink"
      >
        {title}
      </p>
      {itemPitch(item) ? (
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-culture-muted">
          {itemPitch(item)}
        </p>
      ) : null}
      {distanceKm ? (
        <p className="mt-0.5 text-xs font-medium text-culture-terracotta">
          {distanceKm}
        </p>
      ) : null}
    </button>
  );
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  if (!m || !d) return formatDateFr(iso);
  return `${d}/${m}`;
}

function seanceHeure(rel: DayItem): string {
  return seanceTimeLabel(rel);
}

function compactVenue(rel: DayItem): string {
  return (rel.lieu?.nom || '').trim() || formatLieuAffiche(rel.lieu);
}

function seanceLine(rel: DayItem): string {
  const date = formatDateFr(seanceDateIso(rel) || rel.dayIso);
  const venue = formatLieuAffiche(rel.lieu);
  return [date, seanceHeure(rel), venue].filter(Boolean).join(' · ');
}

/** Dropdown option: « 01/09 · 10:30 · Pathé Wilson » */
function seanceOptionLabel(rel: DayItem): string {
  const date = formatDateShort(seanceDateIso(rel) || rel.dayIso);
  return [date, seanceHeure(rel), compactVenue(rel)].filter(Boolean).join(' · ');
}

function toHeroRow(row: DenseRow): CarouselHeroRow {
  return {
    groupKey: row.groupKey,
    itemKey: row.item.key,
    seanceKeys: row.seances?.map((s) => s.key),
  };
}

function sourceUrlOf(item: DayItem): string {
  const { page } = rawUrls(item);
  const reserve = reservePickOf(item).url;
  if (!page || page === reserve) return '';
  return page;
}

function SeanceReserveLink({
  item,
  onReserve,
  tagSource,
  compact = false,
  wide = false,
}: {
  item: DayItem;
  onReserve?: (item: DayItem) => void;
  tagSource?: DayItem | null;
  compact?: boolean;
  wide?: boolean;
}) {
  const { trackItem } = useSignals();
  const pick = reservePickOf(item);
  const wideCls = wide
    ? 'flex w-full items-center justify-center'
    : '';
  if (pick.soldOut) {
    return (
      <span
        aria-disabled="true"
        className={
          'pointer-events-none shrink-0 cursor-default rounded-full border border-culture-line bg-culture-cream px-2.5 py-1 text-xs font-medium text-culture-muted ' +
          (compact ? '' : 'inline-flex min-h-10 items-center px-4 py-2 text-sm ') +
          wideCls
        }
      >
        Sold out
      </span>
    );
  }
  if (!pick.url) return null;
  return (
    <a
      href={pick.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        trackItem(item, 'outbound_click', tagSource);
        onReserve?.(item);
      }}
      className={
        compact
          ? 'shrink-0 rounded-full bg-culture-terracotta px-2.5 py-1 text-xs font-semibold text-white hover:bg-culture-clay'
          : 'inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full bg-culture-terracotta px-3 py-2 text-sm font-semibold text-white hover:bg-culture-clay sm:px-4 ' +
            wideCls
      }
    >
      Réserver
    </a>
  );
}

export default function CinemaCarousel({
  rows: incomingRows,
  pack = 'cine',
  mobile = false,
  focusKey = null,
  selectedCommune = null,
  selectedLieuId = null,
  dateFrom = null,
  dateTo = null,
  soir = false,
  datePinned = false,
  hasMore = false,
  onNeedMore,
  onAgenda,
  onIcs,
  onReserve,
  onSelectLive,
  origin = null,
}: Props) {
  const copy = PACK_COPY[pack];
  const seancesDomId = `${pack}-seances`;
  const pinScope = [
    pack,
    dateFrom ?? '',
    dateTo ?? '',
    selectedCommune ?? '',
    selectedLieuId ?? '',
    soir ? '1' : '0',
  ].join('|');
  // Commune is not part of browse scope: boot GPS nulls it and must not
  // reshuffle an in-progress rail (left inserts / drift).
  const browseScope = [
    pack,
    dateFrom ?? '',
    dateTo ?? '',
    selectedLieuId ?? '',
    soir ? '1' : '0',
  ].join('|');
  const restoredPin = readPackHeroPin(pinScope);
  const browseScopeRef = useRef(browseScope);
  const stripOrderRef = useRef<DenseRow[]>([]);
  const [heroKey, setHeroKey] = useState<string | null>(() => {
    const firstRows = applyStoredStripOrder(
      incomingRows,
      readPackStripKeys(browseScope),
      restoredPin,
    );
    return adoptFirstPaintHero(
      firstRows.map(toHeroRow),
      focusKey ?? restoredPin?.key ?? null,
      restoredPin,
    ).key;
  });
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const heroCardRef = useRef<HTMLDivElement | null>(null);
  const seancesRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const [related, setRelated] = useState<DayItem[]>([]);
  const [aussi, setAussi] = useState<DayItem[]>([]);
  const [detailItem, setDetailItem] = useState<DayItem | null>(null);
  const [mobileCal, setMobileCal] = useState(false);
  const moreLock = useRef(0);
  const moreApi = useRef({ hasMore, onNeedMore });
  moreApi.current = { hasMore, onNeedMore };
  const userMoved = useRef(false);
  const pendingAdvance = useRef(false);
  const pinnedBySelect = useRef(false);
  const pinnedRow = useRef<DenseRow | null>(null);
  const heroPin = useRef<HeroPin | null>(restoredPin);
  const lastEmittedKey = useRef<string | null>(focusKey ?? restoredPin?.key ?? null);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);
  const touchMoved = useRef(false);
  const swipeLockUntil = useRef(0);
  const selectAt = useRef<number | null>(null);
  const armedKey = useRef<string | null>(null);
  const stripTouched = useRef(false);
  const restoringStrip = useRef(false);
  const stripAnchor = useRef<{
    key: string;
    offset: number;
    scroll: number;
  } | null>(null);
  const pinScopeRef = useRef(pinScope);
  if (pinScopeRef.current !== pinScope) {
    pinScopeRef.current = pinScope;
    heroPin.current =
      readPackHeroPin(pinScope) ?? readPackHeroPin(browseScope);
    pinnedBySelect.current = Boolean(heroPin.current);
    pinnedRow.current = null;
    lastEmittedKey.current = heroPin.current?.key ?? heroKey;
    pendingAdvance.current = false;
    const nextKey = heroPin.current?.key ?? heroKey;
    if (nextKey && nextKey !== heroKey) setHeroKey(nextKey);
  }
  if (browseScopeRef.current !== browseScope) {
    browseScopeRef.current = browseScope;
    stripOrderRef.current = [];
    stripAnchor.current = null;
  }
  if (stripOrderRef.current.length === 0) {
    stripOrderRef.current = applyStoredStripOrder(
      incomingRows,
      readPackStripKeys(browseScope),
      heroPin.current ?? restoredPin,
    );
  }
  const rows = appendOnlyStripRows(
    stripOrderRef.current,
    incomingRows,
    heroPin.current ?? restoredPin ?? heroKey,
  );
  stripOrderRef.current = rows;
  writePackStripKeys(
    browseScope,
    rows.map((row) => row.groupKey),
  );
  const stripKeys = rows.map((row) => row.groupKey).join('\n');
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const rowsLen = useRef(rows.length);

  function markMoved() {
    userMoved.current = true;
  }

  function requestMore() {
    const { hasMore: more, onNeedMore: load } = moreApi.current;
    if (!load || !more || !userMoved.current) return;
    if (Date.now() < moreLock.current) return;
    moreLock.current = Date.now() + 700;
    load();
  }

  function persistHero(row: DenseRow, key = row.groupKey) {
    const pin = pinFromHeroRow(toHeroRow(row), key);
    heroPin.current = pin;
    pinnedRow.current = row;
    pinnedBySelect.current = true;
    pendingAdvance.current = false;
    lastEmittedKey.current = key;
    writePackHeroPin(pinScope, pin);
    writePackHeroPin(browseScope, pin);
    setHeroKey(key);
  }

  function lockHeroSwipe(now = Date.now()) {
    swipeLockUntil.current = now + HERO_SWIPE_LOCK_MS;
  }

  const heroRows = rows.map(toHeroRow);
  // First paint (and remount): lock the film already on screen so later
  // cineRows / displayShuffle / reco-top3 hydrates cannot follow a new rows[0].
  // Never leave heroKey null after the first non-empty rows — that fallback
  // is resolveHeroIndex(..., null) === 0 (A→B→C in the same slot).
  const lockedHeroKey = ensureHeroKey(heroRows, heroKey, heroPin.current);
  if (rows[0] && (!heroPin.current || !heroKey)) {
    const adopted = adoptFirstPaintHero(
      heroRows,
      lockedHeroKey,
      heroPin.current ?? restoredPin,
    );
    if (adopted.pin) {
      heroPin.current = adopted.pin;
      pinnedBySelect.current = true;
      writePackHeroPin(pinScope, adopted.pin);
      writePackHeroPin(browseScope, adopted.pin);
    }
    if (adopted.key && adopted.key !== heroKey) setHeroKey(adopted.key);
  }
  const resolvedIndex = resolveHeroIndex(
    heroRows,
    heroKey ?? lockedHeroKey,
    heroPin.current,
  );
  const heroFromRows = resolvedIndex >= 0 ? rows[resolvedIndex] : null;
  if (heroFromRows) {
    pinnedRow.current = heroFromRows;
    if (
      heroPin.current &&
      heroFromRows.groupKey !== heroPin.current.groupKey
    ) {
      heroPin.current = pinFromHeroRow(toHeroRow(heroFromRows), heroFromRows.groupKey);
      writePackHeroPin(pinScope, heroPin.current);
      writePackHeroPin(browseScope, heroPin.current);
    }
  }
  const hero = heroFromRows ?? pinnedRow.current ?? rows[0];
  const heroIndex = resolvedIndex >= 0 ? resolvedIndex : 0;

  useEffect(() => {
    setMobileCal(isLikelyMobile());
  }, []);

  const stripTouchCleanup = useRef<(() => void) | null>(null);
  const bindStrip = useCallback((el: HTMLDivElement | null) => {
    stripRef.current = el;
    stripTouchCleanup.current?.();
    stripTouchCleanup.current = null;
    if (!el) return;
    const onTouchStart = (e: globalThis.TouchEvent) => {
      stripTouched.current = true;
      const btn = (e.target as Element | null)?.closest?.('button');
      if (btn instanceof HTMLElement && el.contains(btn)) {
        holdThumbFocus(btn);
      }
    };
    el.addEventListener('touchstart', onTouchStart, {
      capture: true,
      passive: true,
    });
    stripTouchCleanup.current = () =>
      el.removeEventListener('touchstart', onTouchStart, true);
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    if (focusKey === lastEmittedKey.current || focusKey === heroKey) {
      pinnedBySelect.current = true;
      return;
    }
    lastEmittedKey.current = focusKey;
    pendingAdvance.current = false;
    pinnedBySelect.current = true;
    const current = rowsRef.current;
    const row =
      current.find((r) => r.groupKey === focusKey || r.item.key === focusKey) ??
      current.find((r) => r.seances?.some((s) => s.key === focusKey));
    if (row) persistHero(row, row.groupKey);
    else setHeroKey(focusKey);
  }, [focusKey]);

  const heroItemKey = hero?.item.key ?? null;
  const [detailHeroKey, setDetailHeroKey] = useState<string | null>(heroItemKey);
  if (heroItemKey !== detailHeroKey) {
    setDetailHeroKey(heroItemKey);
    setDetailItem(null);
  }

  useEffect(() => {
    setPickedKey(null);
  }, [hero?.item.key]);
  const livingArts = pack !== 'cine';
  const displayFilter: DisplayFilter = {
    startIso: dateFrom,
    endIso: dateTo,
    soir,
    // Living-arts créneaux are one work — don't blank Ramonville rows
    // when the Toulouse chip is still on (title search / festival).
    commune: livingArts ? null : selectedCommune,
    lieuId: selectedLieuId,
  };

  useEffect(() => {
    if (!hero) return;
    const groupKeys = new Set(
      (hero.seances?.length ? hero.seances : [hero.item]).map((s) => s.key),
    );
    groupKeys.add(hero.item.key);
    const key =
      pickedKey && groupKeys.has(pickedKey) ? pickedKey : hero.item.key;
    let cancelled = false;
    const qs = new URLSearchParams();
    qs.set('id', key);
    if (selectedCommune && pack === 'cine') qs.set('commune', selectedCommune);
    if (selectedLieuId) qs.set('lieu', selectedLieuId);
    if (dateFrom) qs.set('date_from', dateFrom);
    if (dateTo) qs.set('date_to', dateTo);
    if (soir) qs.set('soir', '1');
    void fetch(`/api/agenda?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AgendaDetailResponse | null) => {
        if (cancelled) return;
        if (data) {
          setDetailItem(data.item);
          setRelated(
            filterSeancesForActiveFilters(data.relatedItems ?? [], displayFilter),
          );
          setAussi(data.aussiCeSoir ?? []);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    hero?.item.key,
    pickedKey,
    pack,
    selectedCommune,
    selectedLieuId,
    dateFrom,
    dateTo,
    soir,
  ]);

  useEffect(() => {
    const grew = rows.length > rowsLen.current;
    rowsLen.current = rows.length;
    const next = resolveHeroAfterRowsChange({
      rows: rows.map(toHeroRow),
      selectedKey: heroKey,
      pendingAdvance: pendingAdvance.current,
      pinnedBySelect: pinnedBySelect.current,
      hasMore,
      rowsGrew: grew,
      pin: heroPin.current,
    });
    pendingAdvance.current = next.pendingAdvance;
    if (next.key == null) return;
    if (next.key === heroKey) return;
    const row = rows.find((r) => r.groupKey === next.key);
    if (row) persistHero(row, next.key);
    else setHeroKey(next.key);
  }, [stripKeys, heroKey, hasMore]);

  useLayoutEffect(() => {
    const el = stripRef.current;
    const key = heroKey;
    if (!el || !key) return;
    const thumb = el.querySelector(
      `[data-thumb-key="${CSS.escape(key)}"]`,
    );
    if (!(thumb instanceof HTMLElement)) return;
    const prev = stripAnchor.current;
    if (!prev || prev.key !== key) {
      stripAnchor.current = {
        key,
        offset: thumb.offsetLeft,
        scroll: el.scrollLeft,
      };
      return;
    }
    const nextLeft = stripScrollLeftToHoldThumb({
      prevScrollLeft: prev.scroll,
      prevThumbOffset: prev.offset,
      nextThumbOffset: thumb.offsetLeft,
    });
    if (Math.abs(nextLeft - el.scrollLeft) > 1) {
      restoringStrip.current = true;
      el.scrollLeft = nextLeft;
      restoringStrip.current = false;
    }
    stripAnchor.current = {
      key,
      offset: thumb.offsetLeft,
      scroll: el.scrollLeft,
    };
  }, [stripKeys, heroKey]);

  function scrollStrip(dir: -1 | 1) {
    const el = stripRef.current;
    if (!el) return;
    markMoved();
    pinnedBySelect.current = false;
    if (dir === 1) {
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 24;
      if (atEnd || heroIndex >= rows.length - 1) {
        if (heroIndex >= rows.length - 1) pendingAdvance.current = true;
        requestMore();
      }
    }
    el.scrollBy({ left: dir * 220, behavior: 'smooth' });
  }

  function onStripScroll() {
    const el = stripRef.current;
    if (!el) return;
    if (!restoringStrip.current && stripAnchor.current) {
      const key = stripAnchor.current.key;
      const thumb = el.querySelector(
        `[data-thumb-key="${CSS.escape(key)}"]`,
      );
      stripAnchor.current = {
        key,
        offset:
          thumb instanceof HTMLElement
            ? thumb.offsetLeft
            : stripAnchor.current.offset,
        scroll: el.scrollLeft,
      };
    }
    // Layout / restore / iOS rubber-band must not requestMore (left inserts).
    if (restoringStrip.current || !stripTouched.current) return;
    markMoved();
    if (el.scrollLeft + el.clientWidth < el.scrollWidth - 96) return;
    requestMore();
  }

  /** After the tap — not mid-gesture, when scrollIntoView retargets the click. */
  function scrollHeroIntoView() {
    const card = heroCardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const top = heroWindowScrollY({
      heroTop: rect.top,
      heroBottom: rect.bottom,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
    });
    if (top == null) return;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  function queueHeroScroll(immediate = false) {
    window.setTimeout(
      scrollHeroIntoView,
      heroScrollDeferMs(immediate ? 'mouse' : 'touch'),
    );
  }

  function armThumb(row: DenseRow) {
    armedKey.current = row.groupKey;
    window.setTimeout(() => {
      if (armedKey.current === row.groupKey) armedKey.current = null;
    }, HERO_SCROLL_DEFER_MS);
  }

  function selectThumb(row: DenseRow, opts?: { immediateScroll?: boolean }) {
    const key = resolveThumbSelectIndex(armedKey.current, row.groupKey);
    armedKey.current = null;
    const now = Date.now();
    if (shouldIgnoreRepeatThumbSelect(selectAt.current, now)) return;
    selectAt.current = now;
    markMoved();
    const pinned = rows.find((r) => r.groupKey === key) ?? row;
    persistHero(pinned, key);
    lockHeroSwipe(now);
    queueHeroScroll(opts?.immediateScroll === true);
    const i = rows.findIndex((r) => r.groupKey === key);
    if (i >= rows.length - 1) {
      window.setTimeout(() => requestMore(), HERO_SCROLL_DEFER_MS);
    }
  }

  function onHeroTouchStart(e: TouchEvent) {
    if (e.target instanceof Element && e.target.closest('button, a, select, input, textarea, label')) {
      touchX.current = null;
      touchY.current = null;
      touchMoved.current = false;
      return;
    }
    const t = e.changedTouches[0];
    touchX.current = t?.clientX ?? null;
    touchY.current = t?.clientY ?? null;
    touchMoved.current = false;
  }

  function onHeroTouchMove(e: TouchEvent) {
    if (touchX.current == null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchX.current;
    const dy = t.clientY - (touchY.current ?? t.clientY);
    if (Math.abs(dx) >= 8 || Math.abs(dy) >= 8) touchMoved.current = true;
  }

  function onHeroTouchEnd(e: TouchEvent) {
    const startX = touchX.current;
    const startY = touchY.current;
    const didMove = touchMoved.current;
    touchX.current = null;
    touchY.current = null;
    touchMoved.current = false;
    const t = e.changedTouches[0];
    if (!t) return;
    if (
      shouldIgnoreHeroSwipe({
        startX,
        startY,
        endX: t.clientX,
        endY: t.clientY,
        didMove,
        lockUntil: swipeLockUntil.current,
        now: Date.now(),
      })
    ) {
      return;
    }
    const dx = t.clientX - (startX ?? t.clientX);
    markMoved();
    if (dx < 0) {
      if (heroIndex < rows.length - 1) {
        persistHero(rows[heroIndex + 1]!);
      } else {
        pendingAdvance.current = true;
        pinnedBySelect.current = false;
        heroPin.current = null;
        writePackHeroPin(pinScope, null);
        writePackHeroPin(browseScope, null);
        requestMore();
      }
    } else if (heroIndex > 0) {
      persistHero(rows[heroIndex - 1]!);
    }
  }

  if (!hero) return null;

  const item = hero.item;
  const image = posterUrl(item);
  const cat = categoryLabelOf(item);
  const groupSeances = filterSeancesForActiveFilters(
    hero.seances?.length ? hero.seances : [item],
    displayFilter,
  );
  const fromApi = filterSeancesForActiveFilters(related, displayFilter);
  const seanceKeys = new Set(groupSeances.map((s) => s.key));
  const apiByKey = new Map(fromApi.map((s) => [s.key, s]));
  const seances = sortSeances([
    ...groupSeances.map((s) => apiByKey.get(s.key) ?? s),
    ...fromApi.filter((s) => !seanceKeys.has(s.key)),
  ]);
  const cineDefault =
    pack === 'cine' ? defaultCineSeance(seances, origin) : null;
  const active =
    seances.find((s) => s.key === pickedKey) ??
    cineDefault ??
    seances.find((s) => s.key === item.key) ??
    seances[0] ??
    item;
  const when = seanceWhen(active);
  const venue = formatLieuAffiche(active.lieu);
  const kmOrigin = pack === 'cine' ? cineDistanceOrigin(origin) : origin;
  const km =
    pack === 'cine'
      ? itemKmLabel(active, kmOrigin)
      : minKmLabel(seances.length ? seances : [active], origin) ??
        itemKmLabel(active, origin);
  const cal = calendarPayloadFromDayItem(active);
  const complements =
    pack === 'cine'
      ? pickFilmVivantComplements(aussi, active, { userGps: origin })
      : [];

  const thumbs = (
    <div className="relative">
      <div
        ref={bindStrip}
        onScroll={onStripScroll}
        className="flex gap-3 overflow-x-auto overscroll-x-contain scroll-px-2 pb-1 md:scroll-px-12 md:pr-12 [overflow-anchor:none] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rows.map((row, i) => (
          <FilmThumb
            key={row.groupKey}
            row={row}
            onArm={() => armThumb(row)}
            onSelect={(opts) => selectThumb(row, opts)}
            active={hero ? row.groupKey === hero.groupKey : i === 0}
            distanceKm={
              pack === 'cine'
                ? minKmLabel(row.seances, cineDistanceOrigin(origin)) ??
                  itemKmLabel(row.item, cineDistanceOrigin(origin))
                : minKmLabel(row.seances, origin) ??
                  itemKmLabel(row.item, origin)
            }
          />
        ))}
        {hasMore && onNeedMore ? (
          <button
            type="button"
            data-pack-more={pack}
            onClick={onNeedMore}
            aria-label={copy.more}
            className="flex aspect-[2/3] w-[7.5rem] shrink-0 flex-col items-center justify-center px-2 text-center text-sm font-medium leading-snug text-culture-muted hover:text-culture-ink sm:w-[8.5rem]"
          >
            {copy.more}
          </button>
        ) : null}
      </div>
      {rows.length > 4 && !mobile ? (
        <>
          <button
            type="button"
            aria-label={copy.prev}
            onClick={() => scrollStrip(-1)}
            className="absolute left-0 top-1/3 hidden h-10 w-10 -translate-x-1 items-center justify-center rounded-full border border-culture-line bg-culture-surface/95 text-culture-ink shadow-sm md:flex"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={copy.next}
            onClick={() => scrollStrip(1)}
            className="absolute right-0 top-1/3 hidden h-10 w-10 translate-x-1 items-center justify-center rounded-full border border-culture-line bg-culture-surface/95 text-culture-ink shadow-sm md:flex"
          >
            ›
          </button>
        </>
      ) : null}
    </div>
  );

  const titleBlock = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex rounded bg-culture-terracotta px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            {cat || copy.fallbackCat}
          </span>
          <TheatreUrgenceBadge item={item} />
        </span>
        <FavoriteButton item={item} />
      </div>
      <h3 className="min-w-0 break-words font-display text-base leading-snug text-culture-ink md:text-2xl">
        {rowDisplayTitle(hero)}
      </h3>
      <p className="text-sm leading-snug text-culture-muted">
        {[venue, km, when].filter(Boolean).join(' • ')}
      </p>
    </>
  );

  return (
    <div className="space-y-3">
      <div
        ref={heroCardRef}
        data-carousel-hero=""
        onTouchStart={onHeroTouchStart}
        onTouchMove={onHeroTouchMove}
        onTouchEnd={onHeroTouchEnd}
        className="scroll-mt-16 overflow-hidden rounded-card-lg border border-culture-line bg-culture-surface shadow-card"
      >
        <FilmPoster src={image} item={item} blurBackdrop />
        <div className="flex min-w-0 flex-col gap-2 p-3 md:p-4">
          {titleBlock}
          {pack === 'cine' && seances.length > 0 ? (
            <div ref={seancesRef} id={seancesDomId}>
              <CineSeancePicker
                seances={seances}
                active={active}
                origin={origin}
                onPick={setPickedKey}
                onReserve={onReserve}
                tagSource={item}
              />
            </div>
          ) : null}
          <FicheDescription item={item} />
          {pack === 'theatre' || pack === 'musique' ? (
            <PressCitation
              citation={fichePressCitation(
                pressItemForFiche(active, detailItem),
              )}
            />
          ) : null}
          {pack === 'cine' ? (
            <VivantComplementLinks
              film={active}
              items={complements}
              onSelect={onSelectLive}
            />
          ) : null}
          {pack !== 'cine' ? (
            <div className="md:hidden">
              <SeanceReserveLink
                item={active}
                onReserve={onReserve}
                tagSource={item}
                wide
              />
            </div>
          ) : null}
          {pack !== 'cine' ? (
            <VivantComplementLinks
              film={active}
              items={complements}
              onSelect={onSelectLive}
            />
          ) : null}
          {pack !== 'cine' ? (
          <div ref={seancesRef} id={seancesDomId}>
            {seances.length > 0 ? (
              datePinned ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-culture-muted">
                    Séances
                  </p>
                  <ul className="mt-1 space-y-1.5 text-sm text-culture-ink">
                    {seances.map((rel) => (
                      <li
                        key={rel.key}
                        className="flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => setPickedKey(rel.key)}
                          className={
                            'min-w-0 flex-1 text-left ' +
                            (rel.key === active.key
                              ? 'font-medium text-culture-ink'
                              : 'text-culture-ink/80 hover:text-culture-ink')
                          }
                        >
                          {seanceLine(rel)}
                        </button>
                        <span className="hidden md:inline">
                          <SeanceReserveLink
                            item={rel}
                            onReserve={onReserve}
                            tagSource={item}
                            compact
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-culture-muted">
                    Séances
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <select
                      ref={selectRef}
                      value={active.key}
                      onChange={(e) => setPickedKey(e.target.value)}
                      aria-label="Choisir une séance"
                      className="h-11 min-w-0 w-full rounded-lg border border-culture-line bg-culture-surface px-3 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta md:flex-1"
                    >
                      {seances.map((rel) => (
                        <option key={rel.key} value={rel.key}>
                          {seanceOptionLabel(rel)}
                        </option>
                      ))}
                    </select>
                    <span className="hidden md:inline">
                      <SeanceReserveLink
                        item={active}
                        onReserve={onReserve}
                        tagSource={item}
                      />
                    </span>
                  </div>
                </div>
              )
            ) : null}
          </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {cal ? (
              <>
                <a
                  href={googleCalendarUrl(cal)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    onAgenda?.(active);
                  }}
                  className="inline-flex min-h-10 items-center rounded-full border border-culture-line bg-white px-3 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                >
                  Google Agenda
                </a>
                {mobileCal ? (
                  <a
                    href={webcalHref(active.key)}
                    onClick={() => {
                      onIcs?.(active);
                    }}
                    className="inline-flex min-h-10 items-center rounded-full border border-culture-line bg-white px-3 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                  >
                    S’abonner au calendrier
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onIcs?.(active);
                      downloadIcs(cal);
                    }}
                    className="inline-flex min-h-10 items-center rounded-full border border-culture-line bg-white px-3 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                  >
                    Télécharger (.ics)
                  </button>
                )}
              </>
            ) : null}
            <ShareButton item={active} />
            {pack !== 'cine' && sourceUrlOf(active) ? (
              <a
                href={sourceUrlOf(active)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-full border border-culture-line bg-white px-3 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
              >
                Voir la source
              </a>
            ) : null}
          </div>
        </div>
      </div>
      {thumbs}
    </div>
  );
}
