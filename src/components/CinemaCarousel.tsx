'use client';

import { useEffect, useRef, useState, type TouchEvent } from 'react';
import type { DayItem } from '@/lib/types';
import type { AgendaDetailResponse } from '@/lib/slim';
import type { DenseRow } from '@/lib/densify';
import {
  calendarPayloadFromDayItem,
  downloadIcs,
  googleCalendarUrl,
} from '@/lib/calendar';
import { formatDateFr, formatHeure, formatLieuAffiche } from '@/lib/labels';
import {
  filterSeancesForActiveFilters,
  sortSeances,
  type DisplayFilter,
} from '@/lib/displayFilter';
import { seanceDateIso } from '@/lib/timeScope';
import {
  isLikelyMobile,
  itemPitch,
  itemTitle,
  seanceWhen,
} from '@/lib/displayHome';
import { itemKmLabel, minKmLabel, type GeoPos } from '@/lib/nearMe';
import { reservePickOf } from '@/lib/reserve';
import { filterItemsByCommune } from '@/lib/commune';
import VisualFallback, { categoryLabelOf } from './VisualFallback';
import FilmPoster from './FilmPoster';
import FavoriteButton from './FavoriteButton';
import ShareButton from './ShareButton';
import VivantComplementLinks from './VivantComplementLinks';

type Props = {
  rows: DenseRow[];
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
  onSelect,
  active,
  distanceKm,
}: {
  row: DenseRow;
  onSelect: () => void;
  active?: boolean;
  distanceKm?: string | null;
}) {
  const item = row.item;
  const image = posterUrl(item);
  const when = seanceWhen(item, row.earliestHeure);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={
        'flex w-[7.5rem] shrink-0 flex-col text-left sm:w-[8.5rem] ' +
        (active ? 'ring-2 ring-culture-terracotta ring-offset-2 ring-offset-culture-cream' : '')
      }
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-culture-line bg-culture-sand">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <VisualFallback item={item} compact />
        )}
        {when ? (
          <span className="absolute left-1.5 top-1.5 rounded bg-culture-ink/85 px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-white">
            {when}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-culture-ink">
        {itemTitle(item)}
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
  return rel.kind === 'programme'
    ? formatHeure(rel.programme.heure_debut)
    : formatHeure(rel.evenement.heure_debut);
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

function SeanceReserveLink({
  item,
  onReserve,
  compact = false,
  wide = false,
}: {
  item: DayItem;
  onReserve?: (item: DayItem) => void;
  compact?: boolean;
  wide?: boolean;
}) {
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
      onClick={() => onReserve?.(item)}
      className={
        compact
          ? 'shrink-0 rounded-full bg-culture-terracotta px-2.5 py-1 text-xs font-semibold text-white hover:bg-culture-clay'
          : 'inline-flex min-h-10 shrink-0 items-center rounded-full bg-culture-terracotta px-4 py-2 text-sm font-semibold text-white hover:bg-culture-clay ' +
            wideCls
      }
    >
      Réserver
    </a>
  );
}

export default function CinemaCarousel({
  rows,
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
  const [heroIndex, setHeroIndex] = useState(0);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const seancesRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const [related, setRelated] = useState<DayItem[]>([]);
  const [aussi, setAussi] = useState<DayItem[]>([]);
  const [mobileCal, setMobileCal] = useState(false);
  const moreLock = useRef(0);
  const moreApi = useRef({ hasMore, onNeedMore });
  moreApi.current = { hasMore, onNeedMore };
  const userMoved = useRef(false);
  const pendingAdvance = useRef(false);
  const touchX = useRef<number | null>(null);

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

  useEffect(() => {
    setMobileCal(isLikelyMobile());
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    const i = rows.findIndex((r) => r.item.key === focusKey);
    if (i >= 0) setHeroIndex(i);
  }, [focusKey, rows]);

  useEffect(() => {
    if (heroIndex > rows.length - 1) setHeroIndex(0);
  }, [heroIndex, rows.length]);

  const hero = rows[heroIndex] ?? rows[0];

  useEffect(() => {
    setPickedKey(null);
  }, [hero?.item.key]);
  const displayFilter: DisplayFilter = {
    startIso: dateFrom,
    endIso: dateTo,
    soir,
    commune: selectedCommune,
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
    if (selectedCommune) qs.set('commune', selectedCommune);
    if (selectedLieuId) qs.set('lieu', selectedLieuId);
    if (dateFrom) qs.set('date_from', dateFrom);
    if (dateTo) qs.set('date_to', dateTo);
    if (soir) qs.set('soir', '1');
    void fetch(`/api/agenda?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AgendaDetailResponse | null) => {
        if (cancelled || !data) return;
        setRelated(
          filterSeancesForActiveFilters(data.relatedItems ?? [], displayFilter),
        );
        setAussi(
          filterItemsByCommune(
            data.aussiCeSoir ?? [],
            selectedCommune || 'Toulouse',
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    hero?.item.key,
    pickedKey,
    selectedCommune,
    selectedLieuId,
    dateFrom,
    dateTo,
    soir,
  ]);

  useEffect(() => {
    if (!pendingAdvance.current) return;
    if (heroIndex < rows.length - 1) {
      pendingAdvance.current = false;
      setHeroIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (!hasMore) {
      pendingAdvance.current = false;
    }
  }, [rows.length, heroIndex, hasMore]);

  function scrollStrip(dir: -1 | 1) {
    const el = stripRef.current;
    if (!el) return;
    markMoved();
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
    markMoved();
    if (el.scrollLeft + el.clientWidth < el.scrollWidth - 96) return;
    requestMore();
  }

  function onHeroTouchStart(e: TouchEvent) {
    if (e.target instanceof Element && e.target.closest('button, a, select, input, textarea, label')) {
      touchX.current = null;
      return;
    }
    touchX.current = e.changedTouches[0]?.clientX ?? null;
  }

  function onHeroTouchEnd(e: TouchEvent) {
    if (touchX.current == null) return;
    const x = e.changedTouches[0]?.clientX;
    const start = touchX.current;
    touchX.current = null;
    if (x == null) return;
    const dx = x - start;
    if (Math.abs(dx) < 40) return;
    markMoved();
    if (dx < 0) {
      if (heroIndex < rows.length - 1) {
        setHeroIndex(heroIndex + 1);
      } else {
        pendingAdvance.current = true;
        requestMore();
      }
    } else {
      setHeroIndex(Math.max(0, heroIndex - 1));
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
  const active =
    seances.find((s) => s.key === pickedKey) ??
    seances.find((s) => s.key === item.key) ??
    seances[0] ??
    item;
  const when = seanceWhen(active);
  const venue = formatLieuAffiche(active.lieu);
  const km =
    minKmLabel(seances.length ? seances : [active], origin) ??
    itemKmLabel(active, origin);
  const cal = calendarPayloadFromDayItem(active);
  const complements = filterItemsByCommune(
    aussi,
    selectedCommune || 'Toulouse',
  ).slice(0, 3);

  const thumbs = (
    <div className="relative">
      <div
        ref={stripRef}
        onScroll={onStripScroll}
        className="flex gap-3 overflow-x-auto scroll-px-2 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rows.map((row, i) => (
          <FilmThumb
            key={row.groupKey}
            row={row}
            onSelect={() => {
              markMoved();
              setHeroIndex(i);
              if (i >= rows.length - 1) requestMore();
            }}
            active={i === heroIndex}
            distanceKm={
              minKmLabel(row.seances, origin) ?? itemKmLabel(row.item, origin)
            }
          />
        ))}
        {hasMore && onNeedMore ? (
          <button
            type="button"
            onClick={onNeedMore}
            className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-culture-line bg-culture-surface text-sm font-medium text-culture-terracotta sm:w-[8.5rem]"
          >
            Plus de films
          </button>
        ) : null}
      </div>
      {rows.length > 4 && !mobile ? (
        <>
          <button
            type="button"
            aria-label="Films précédents"
            onClick={() => scrollStrip(-1)}
            className="absolute left-0 top-1/3 hidden h-10 w-10 -translate-x-1 items-center justify-center rounded-full border border-culture-line bg-culture-surface/95 text-culture-ink shadow-sm md:flex"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Films suivants"
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
        <span className="inline-flex rounded bg-culture-terracotta px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          {cat || 'Cinéma'}
        </span>
        <FavoriteButton itemKey={item.key} />
      </div>
      <h3 className="font-display text-base leading-snug text-culture-ink md:text-2xl">
        {itemTitle(item)}
      </h3>
      <p className="text-sm leading-snug text-culture-muted">
        {[venue, km, when].filter(Boolean).join(' • ')}
      </p>
    </>
  );

  const reserveWide = (
    <div className="md:hidden">
      <SeanceReserveLink item={active} onReserve={onReserve} wide />
    </div>
  );

  return (
    <div className="space-y-3">
      <div
        onTouchStart={onHeroTouchStart}
        onTouchEnd={onHeroTouchEnd}
        className="flex flex-col overflow-hidden rounded-card-lg border border-culture-line bg-culture-surface shadow-card md:flex-row md:items-start"
      >
        <div className="flex items-start gap-3 p-3 md:contents md:p-0">
          <FilmPoster
            src={image}
            item={item}
            className="h-[10.5rem] w-[7rem] shrink-0 md:h-[20rem] md:w-[13.35rem]"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1 md:hidden">
            {titleBlock}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 pb-3 md:p-4">
          <div className="hidden flex-col gap-2 md:flex">{titleBlock}</div>
          {itemPitch(item) ? (
            <p className="hidden text-sm leading-relaxed text-culture-ink md:block">
              {itemPitch(item)}
            </p>
          ) : null}
          {reserveWide}
          <VivantComplementLinks
            film={active}
            items={complements}
            onSelect={onSelectLive}
          />
          <div ref={seancesRef} id="cine-seances">
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
                      <SeanceReserveLink item={active} onReserve={onReserve} />
                    </span>
                  </div>
                </div>
              )
            ) : null}
          </div>
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
          </div>
        </div>
      </div>
      {thumbs}
    </div>
  );
}
