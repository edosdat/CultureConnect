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
import VisualFallback, { categoryLabelOf } from './VisualFallback';
import FavoriteButton from './FavoriteButton';
import ShareButton from './ShareButton';

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
}: {
  row: DenseRow;
  onSelect: () => void;
  active?: boolean;
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
            className="h-full w-full object-cover"
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

export default function CinemaCarousel({
  rows,
  mobile = false,
  focusKey = null,
  fallbackVivant = [],
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
}: Props) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const seancesRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const [related, setRelated] = useState<DayItem[]>([]);
  const [aussi, setAussi] = useState<DayItem[]>([]);
  const [engaged, setEngaged] = useState(false);
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
    setEngaged(false);
    setAussi([]);
    const key = hero.item.key;
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
          filterSeancesForActiveFilters(data.aussiCeSoir ?? [], displayFilter),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    hero?.item.key,
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
  const seances = sortSeances([
    ...groupSeances,
    ...fromApi.filter((s) => !seanceKeys.has(s.key)),
  ]);
  const active =
    seances.find((s) => s.key === pickedKey) ??
    seances.find((s) => s.key === item.key) ??
    seances[0] ??
    item;
  const when = seanceWhen(active);
  const venue = formatLieuAffiche(active.lieu);
  const cal = calendarPayloadFromDayItem(active);
  const crossSell = filterSeancesForActiveFilters(
    aussi.length > 0
      ? aussi
      : fallbackVivant.filter((it) => it.key !== item.key),
    displayFilter,
  ).slice(0, 2);

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

  const panel = (
    <div
      className={
        'flex min-h-0 flex-col gap-2 overflow-y-auto p-3 sm:p-4 ' +
        (mobile ? 'max-h-[16rem]' : 'max-h-[20rem]')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex rounded bg-culture-terracotta px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          {cat || 'Cinéma'}
        </span>
        <FavoriteButton itemKey={item.key} />
      </div>
      <h3 className="font-display text-xl leading-snug text-culture-ink sm:text-2xl">
        {itemTitle(item)}
      </h3>
      {itemPitch(item) ? (
        <p className="text-sm leading-relaxed text-culture-ink">{itemPitch(item)}</p>
      ) : null}
      <p className="text-sm text-culture-muted">
        {[venue, when].filter(Boolean).join(' • ')}
      </p>
      <div ref={seancesRef} id="cine-seances">
        {seances.length > 0 ? (
          datePinned ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-culture-muted">
                Séances
              </p>
              <ul className="mt-1 space-y-1 text-sm text-culture-ink">
                {seances.map((rel) => (
                  <li key={rel.key}>
                    <button
                      type="button"
                      onClick={() => setPickedKey(rel.key)}
                      className={
                        'w-full text-left ' +
                        (rel.key === active.key
                          ? 'font-medium text-culture-ink'
                          : 'text-culture-ink/80 hover:text-culture-ink')
                      }
                    >
                      {seanceLine(rel)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-culture-muted">
                Séances
              </span>
              <select
                ref={selectRef}
                value={active.key}
                onChange={(e) => setPickedKey(e.target.value)}
                aria-label="Choisir une séance"
                className="mt-1 h-11 w-full rounded-lg border border-culture-line bg-culture-surface px-3 text-sm text-culture-ink shadow-sm focus:border-culture-terracotta focus:outline-none focus:ring-1 focus:ring-culture-terracotta"
              >
                {seances.map((rel) => (
                  <option key={rel.key} value={rel.key}>
                    {seanceOptionLabel(rel)}
                  </option>
                ))}
              </select>
            </label>
          )
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const box = seancesRef.current;
            const select = selectRef.current;
            if (select) {
              select.focus();
              try {
                select.showPicker?.();
              } catch {
                /* native picker not available */
              }
            }
            box?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }}
          className="inline-flex min-h-10 items-center rounded-full bg-culture-terracotta px-4 py-2 text-sm font-semibold text-white hover:bg-culture-clay"
        >
          Voir les séances
        </button>
        {cal ? (
          <>
            <a
              href={googleCalendarUrl(cal)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setEngaged(true);
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
                  setEngaged(true);
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
                  setEngaged(true);
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
      {engaged && crossSell.length > 0 ? (
        <div className="border-t border-culture-line pt-2">
          <p className="text-sm font-medium text-culture-ink">
            C’est noté pour ce soir. Et samedi, il y a ça à 10 min de chez toi.
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {crossSell.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => onSelectLive?.(it.key)}
                  className="text-left text-culture-terracotta hover:underline"
                >
                  {itemTitle(it)}
                  {it.dayIso ? ` · ${formatDateFr(it.dayIso)}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-3">
      <div
        onTouchStart={onHeroTouchStart}
        onTouchEnd={onHeroTouchEnd}
        className="overflow-hidden rounded-card-lg border border-culture-line bg-culture-surface shadow-card md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(17rem,1fr)]"
      >
        <div
          className={
            'relative w-full overflow-hidden bg-culture-sand ' +
            (mobile ? 'aspect-[16/7] max-h-40' : 'aspect-[16/9] max-h-[20rem]')
          }
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0">
              <VisualFallback item={item} />
            </div>
          )}
        </div>
        {panel}
      </div>
      {thumbs}
    </div>
  );
}
