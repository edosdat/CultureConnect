'use client';

import { useEffect, useState } from 'react';
import type { DayItem } from '@/lib/types';
import {
  calendarPayloadFromDayItem,
  downloadIcs,
  googleCalendarUrl,
} from '@/lib/calendar';
import { filterItemsByCommune, normalizeCommune } from '@/lib/commune';
import { filterSeancesForActiveFilters } from '@/lib/displayFilter';
import { isLikelyMobile, itemImageUrl } from '@/lib/displayHome';
import SeanceCard from './SeanceCard';
import FilmPoster from './FilmPoster';
import ShareButton from './ShareButton';
import FavoriteButton from './FavoriteButton';
import {
  formatDateRange,
  formatHeure,
  formatItemPrix,
  formatLieuAffiche,
  formatPrix,
  formatDateFr,
  labelCategorie,
  labelTypeItem,
} from '@/lib/labels';
import {
  hideSeancesBeforeToday,
  isNotBeforeToday,
  parisParts,
  seanceDateIso,
} from '@/lib/timeScope';
import {
  rawUrls,
  reservePickForVenueGroup,
  reservePickOf,
} from '@/lib/reserve';
import { isCinemaDayItem } from '@/lib/nouveautesCine';
import VivantComplementLinks from './VivantComplementLinks';

type Props = {
  item: DayItem | null;
  onClose: () => void;
  onSelectVenue?: (lieuId: string) => void;
  /** All screenings of the same film_id in current scope (incl. selected) */
  relatedItems?: DayItem[];
  /** 1–3 vivant suggestions for a cinema fiche (same modal). */
  aussiCeSoirItems?: DayItem[];
  onSelectItem?: (key: string) => void;
  onAgenda?: () => void;
  onIcs?: () => void;
  onReserve?: () => void;
  /** Agenda city already selected (incl. Toulouse default). Null = whole agglo. */
  selectedCommune?: string | null;
  /** Agenda venue already selected. */
  selectedLieuId?: string | null;
  /** Display fallback when pickAussiCeSoir is empty (tomorrow / weekend vivant). */
  fallbackVivant?: DayItem[];
};

function useEscapeClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);
}

function ReserveControl({
  url,
  soldOut,
  onReserve,
  shrink = false,
}: {
  url: string;
  soldOut: boolean;
  onReserve?: () => void;
  shrink?: boolean;
}) {
  const width = shrink ? ' shrink-0' : '';
  if (soldOut) {
    return (
      <span
        aria-disabled="true"
        className={
          'pointer-events-none inline-flex cursor-default items-center rounded-full border border-culture-line bg-culture-cream px-4 py-2 text-sm font-medium text-culture-muted' +
          width
        }
      >
        Sold out
      </span>
    );
  }
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onReserve?.()}
      className={
          'inline-flex min-h-10 items-center rounded-full bg-culture-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-culture-clay' +
        width
      }
    >
      Réserver
    </a>
  );
}

type VenueGroup = {
  label: string;
  lieuId: string | null;
  commune: string;
  rows: { key: string; date: string; heure: string }[];
  reserveUrl: string;
  soldOut: boolean;
};

function groupSeancesByVenue(items: DayItem[]): VenueGroup[] {
  const map = new Map<string, VenueGroup>();
  const seancesByKey = new Map<string, DayItem[]>();
  const order: string[] = [];
  const todayIso = parisParts().iso;
  for (const rel of items) {
    if (rel.kind !== 'programme') continue;
    if (!isNotBeforeToday(seanceDateIso(rel), todayIso)) continue;
    const label = formatLieuAffiche(rel.lieu) || rel.lieu?.commune || 'Lieu';
    const lieuId = rel.lieu?.lieu_id || rel.programme.lieu_id || null;
    const commune = rel.lieu?.commune || '';
    const key = lieuId || `label:${label}`;
    if (!map.has(key)) {
      map.set(key, { label, lieuId, commune, rows: [], reserveUrl: '', soldOut: false });
      seancesByKey.set(key, []);
      order.push(key);
    }
    seancesByKey.get(key)!.push(rel);
    const heure =
      formatHeure(rel.programme.heure_debut) +
      (rel.programme.heure_fin
        ? ` – ${formatHeure(rel.programme.heure_fin)}`
        : '');
    map.get(key)!.rows.push({
      key: rel.key,
      date: rel.programme.date || rel.dayIso,
      heure,
    });
  }
  for (const [key, g] of map) {
    g.rows.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return a.heure.localeCompare(b.heure);
    });
    const pick = reservePickForVenueGroup(seancesByKey.get(key) || []);
    g.reserveUrl = pick.url;
    g.soldOut = pick.soldOut;
  }
  return order
    .map((k) => map.get(k)!)
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

function filterVenueGroups(
  groups: VenueGroup[],
  selectedCommune?: string | null,
  selectedLieuId?: string | null,
): VenueGroup[] {
  if (groups.length === 0) return groups;
  let filtered = groups;
  if (selectedLieuId) {
    filtered = groups.filter((g) => g.lieuId === selectedLieuId);
  } else if (selectedCommune) {
    const target = normalizeCommune(selectedCommune);
    filtered = groups.filter((g) => normalizeCommune(g.commune) === target);
  }
  return filtered;
}

function FilmSeancesList({
  items,
  onSelectVenue,
  onReserve,
  selectedCommune,
  selectedLieuId,
}: {
  items: DayItem[];
  onSelectVenue?: (lieuId: string) => void;
  onReserve?: () => void;
  selectedCommune?: string | null;
  selectedLieuId?: string | null;
}) {
  const allGroups = groupSeancesByVenue(items);
  if (allGroups.length === 0) return null;
  const groups = filterVenueGroups(allGroups, selectedCommune, selectedLieuId);
  if (groups.length === 0) return null;
  return (
    <ul className="mt-2 space-y-3 text-sm text-culture-ink">
      {groups.map((g) => (
        <li key={g.lieuId || g.label}>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 font-medium">
              {g.lieuId && onSelectVenue ? (
                <button
                  type="button"
                  onClick={() => onSelectVenue(g.lieuId!)}
                  className="text-left text-culture-terracotta hover:underline"
                >
                  {g.label}
                </button>
              ) : (
                g.label
              )}
            </p>
            <ReserveControl
              url={g.reserveUrl}
              soldOut={g.soldOut}
              onReserve={onReserve}
              shrink
            />
          </div>
          <ul className="mt-1 space-y-0.5 text-culture-muted">
            {g.rows.map((row) => (
              <li key={row.key} className="flex flex-wrap gap-x-2">
                <span>{formatDateFr(row.date)}</span>
                {row.heure ? <span>· {row.heure}</span> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function AussiCeSoirSection({
  items,
  onSelectItem,
}: {
  items: DayItem[];
  onSelectItem?: (key: string) => void;
}) {
  if (items.length === 0 || !onSelectItem) return null;
  return (
    <section>
      <p className="text-sm font-medium text-culture-ink">
        C’est noté pour ce soir. Et samedi, il y a ça à 10 min de chez toi.
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((it) => (
          <li key={it.key}>
            <SeanceCard item={it} compact onSelect={onSelectItem} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function webcalHref(itemKey: string): string {
  if (typeof window === 'undefined') return '';
  const host = window.location.host;
  const path = `/api/calendar/${encodeURIComponent(itemKey)}`;
  if (window.location.protocol === 'https:') return `webcal://${host}${path}`;
  return `${window.location.origin}${path}`;
}

function reserveUrlOf(item: DayItem): string {
  return reservePickOf(item).url;
}

function reserveSoldOut(item: DayItem): boolean {
  return reservePickOf(item).soldOut;
}

function sourceUrlOf(item: DayItem): string {
  const { page } = rawUrls(item);
  const reserve = reserveUrlOf(item);
  if (!page || page === reserve) return '';
  return page;
}

function pitchOf(item: DayItem): string {
  if (item.kind === 'programme') {
    const ev = item.evenement;
    return (
      (ev?.description_longue || '').trim() ||
      (item.programme.description_item || '').trim() ||
      (ev?.description_courte || '').trim()
    );
  }
  return (
    (item.evenement.description_longue || '').trim() ||
    (item.evenement.description_courte || '').trim()
  );
}

function creditNamesOf(item: DayItem): string[] {
  const ev = item.evenement;
  const raw = (ev?.casting || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function EventDetail({
  item,
  onClose,
  onSelectVenue,
  relatedItems = [],
  aussiCeSoirItems = [],
  onSelectItem,
  onAgenda,
  onIcs,
  onReserve,
  selectedCommune,
  selectedLieuId,
  fallbackVivant = [],
}: Props) {
  useEscapeClose(Boolean(item), onClose);
  const [engaged, setEngaged] = useState(false);
  const [mobileCal, setMobileCal] = useState(false);

  useEffect(() => {
    setEngaged(false);
  }, [item?.key]);

  useEffect(() => {
    setMobileCal(isLikelyMobile());
  }, []);

  function markEngaged() {
    setEngaged(true);
  }

  if (!item) return null;

  const cal = calendarPayloadFromDayItem(item);
  const openKey = item.key;
  const cinemaFiche = isCinemaDayItem(item);
  const crossSellItems = cinemaFiche
    ? filterItemsByCommune(
        aussiCeSoirItems,
        selectedCommune || 'Toulouse',
      ).slice(0, 3)
    : aussiCeSoirItems.length > 0
      ? filterItemsByCommune(aussiCeSoirItems, selectedCommune)
      : filterItemsByCommune(fallbackVivant, selectedCommune)
          .filter((it) => it.key !== openKey)
          .slice(0, 2);
  const showCrossSell = !cinemaFiche && engaged && crossSellItems.length > 0;

  if (item.kind === 'programme') {
    const { programme: p, evenement: ev, lieu } = item;
    const time =
      formatHeure(p.heure_debut) +
      (p.heure_fin ? ` – ${formatHeure(p.heure_fin)}` : '');
    const categorie = ev?.categorie ?? '';
    const upcomingRelated = filterSeancesForActiveFilters(
      hideSeancesBeforeToday(relatedItems, parisParts().iso),
      { commune: selectedCommune, lieuId: selectedLieuId },
    );
    const selfMatches =
      filterSeancesForActiveFilters([item], {
        commune: selectedCommune,
        lieuId: selectedLieuId,
      }).length > 0;
    const seancesForList =
      upcomingRelated.length > 0
        ? upcomingRelated
        : selfMatches
          ? [item]
          : [];
    const hasFilmSeances = seancesForList.length > 0;

    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-culture-ink/40 p-0 sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
        onClick={onClose}
      >
        <div
          className="max-h-[92vh] w-full max-w-2xl min-w-0 overflow-y-auto overflow-x-hidden rounded-t-3xl border border-culture-sand bg-culture-cream shadow-xl sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-start justify-end border-b border-culture-sand bg-culture-cream/95 px-5 py-3 backdrop-blur">
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-culture-sand bg-white px-3 py-1 text-sm text-culture-ink hover:bg-culture-sand"
              aria-label="Fermer"
            >
              Fermer
            </button>
          </div>

          {cinemaFiche ? (
            <div className="flex flex-row items-start gap-3 px-5 pt-4 md:gap-4">
              <FilmPoster
                src={itemImageUrl(item)}
                item={item}
                className="h-[10.5rem] w-[7rem] shrink-0 md:h-[20rem] md:w-[13.35rem]"
              />
              <div className="min-w-0 flex-1 break-words">
                <div className="flex flex-wrap gap-2">
                  {categorie && (
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs text-culture-terracotta">
                      {labelCategorie(categorie)}
                    </span>
                  )}
                  {p.type_item && (
                    <span className="rounded-full bg-culture-sage/15 px-2.5 py-0.5 text-xs text-culture-sage">
                      {labelTypeItem(p.type_item)}
                    </span>
                  )}
                </div>
                <h2
                  id="event-detail-title"
                  className="mt-2 font-display text-base leading-snug text-culture-ink break-words md:text-2xl"
                >
                  {p.nom_item}
                </h2>
                {creditNamesOf(item).length > 0 && (
                  <p className="mt-1 text-sm text-culture-ink break-words">
                    {creditNamesOf(item).join(' · ')}
                  </p>
                )}
                {ev?.titre && ev.titre !== p.nom_item && (
                  <p className="mt-1 text-sm text-culture-muted break-words">
                    {ev.titre}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="px-5 pt-4">
              <div className="min-w-0 break-words">
                <div className="flex flex-wrap gap-2">
                  {categorie && (
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs text-culture-terracotta">
                      {labelCategorie(categorie)}
                    </span>
                  )}
                  {p.type_item && (
                    <span className="rounded-full bg-culture-sage/15 px-2.5 py-0.5 text-xs text-culture-sage">
                      {labelTypeItem(p.type_item)}
                    </span>
                  )}
                </div>
                <h2
                  id="event-detail-title"
                  className="mt-2 font-display text-2xl text-culture-ink break-words"
                >
                  {p.nom_item}
                </h2>
                {creditNamesOf(item).length > 0 && (
                  <p className="mt-1 text-sm text-culture-ink break-words">
                    {creditNamesOf(item).join(' · ')}
                  </p>
                )}
                {ev?.titre && ev.titre !== p.nom_item && (
                  <p className="mt-1 text-sm text-culture-muted break-words">
                    {ev.titre}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-5 px-5 py-5">
            {pitchOf(item) ? (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
                  Description
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-culture-ink leading-relaxed break-words">
                  {pitchOf(item)}
                </p>
              </section>
            ) : null}

            {!hasFilmSeances && (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-culture-muted">Date</dt>
                  <dd className="font-medium text-culture-ink">
                    {p.date ? formatDateFr(p.date) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-culture-muted">Horaires</dt>
                  <dd className="font-medium text-culture-ink">
                    {time || 'Non indiqués'}
                  </dd>
                </div>
                <div>
                  <dt className="text-culture-muted">Prix</dt>
                  <dd className="font-medium text-culture-ink">
                    {formatItemPrix(p.prix_item, ev)}
                  </dd>
                </div>
                {p.scene_salle && (
                  <div>
                    <dt className="text-culture-muted">Salle / scène</dt>
                    <dd className="font-medium text-culture-ink">{p.scene_salle}</dd>
                  </div>
                )}
              </dl>
            )}

            {hasFilmSeances && (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-culture-muted">Prix</dt>
                  <dd className="font-medium text-culture-ink">
                    {formatItemPrix(p.prix_item, ev)}
                  </dd>
                </div>
              </dl>
            )}

            {cinemaFiche ? (
              <VivantComplementLinks
                film={item}
                items={crossSellItems}
                onSelect={onSelectItem}
              />
            ) : null}

            {hasFilmSeances && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
                  Séances
                </h3>
                <FilmSeancesList
                  items={seancesForList}
                  onSelectVenue={
                    onSelectVenue
                      ? (lieuId) => {
                          onSelectVenue(lieuId);
                          onClose();
                        }
                      : undefined
                  }
                  onReserve={() => {
                    markEngaged();
                    onReserve?.();
                  }}
                  selectedCommune={selectedCommune}
                  selectedLieuId={selectedLieuId}
                />
              </section>
            )}

            {!hasFilmSeances && lieu && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
                  Lieu
                </h3>
                <p className="mt-1 font-medium text-culture-ink">
                  {onSelectVenue ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectVenue(lieu.lieu_id);
                        onClose();
                      }}
                      className="text-left text-culture-terracotta hover:underline"
                    >
                      {formatLieuAffiche(lieu)}
                    </button>
                  ) : (
                    formatLieuAffiche(lieu)
                  )}
                </p>
                <p className="text-sm text-culture-muted">
                  {[lieu.adresse, lieu.commune].filter(Boolean).join(', ') ||
                    lieu.commune ||
                    'Adresse non indiquée'}
                </p>
                {lieu.site_web && (
                  <a
                    href={lieu.site_web}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-sm text-culture-terracotta hover:underline"
                  >
                    Site du lieu
                  </a>
                )}
              </section>
            )}

            {ev && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
                  Cadre / évènement
                </h3>
                <p className="mt-1 font-medium text-culture-ink break-words">{ev.titre}</p>
                {(ev.date_debut || ev.date_fin) && (
                  <p className="text-sm text-culture-muted">
                    {formatDateRange(ev.date_debut, ev.date_fin)}
                  </p>
                )}
              </section>
            )}

            {p.notes && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
                  Notes
                </h3>
                <p className="mt-1 text-sm text-culture-ink break-words">{p.notes}</p>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {!hasFilmSeances && (
                <ReserveControl
                  url={reserveUrlOf(item)}
                  soldOut={reserveSoldOut(item)}
                  onReserve={() => {
                    markEngaged();
                    onReserve?.();
                  }}
                />
              )}
              {cal && (
                <>
                  <a
                    href={googleCalendarUrl(cal)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      markEngaged();
                      onAgenda?.();
                    }}
                    className="inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                  >
                    Google Agenda
                  </a>
                  {mobileCal ? (
                    <a
                      href={webcalHref(item.key)}
                      onClick={() => {
                        markEngaged();
                        onIcs?.();
                      }}
                      className="inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                    >
                      S’abonner au calendrier
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        markEngaged();
                        onIcs?.();
                        downloadIcs(cal);
                      }}
                      className="inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                    >
                      Télécharger (.ics)
                    </button>
                  )}
                </>
              )}
              <ShareButton item={item} />
              <FavoriteButton itemKey={item.key} />
              {sourceUrlOf(item) && (
                <a
                  href={sourceUrlOf(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                >
                  Voir la source
                </a>
              )}
            </div>

            {showCrossSell ? (
              <AussiCeSoirSection
                items={crossSellItems}
                onSelectItem={onSelectItem}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // Fallback: parent evenement without programme row that day
  const { evenement: event, lieu } = item;
  const time =
    formatHeure(event.heure_debut) +
    (event.heure_fin ? ` – ${formatHeure(event.heure_fin)}` : '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-culture-ink/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-detail-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl min-w-0 overflow-y-auto overflow-x-hidden rounded-t-3xl border border-culture-sand bg-culture-cream shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-end border-b border-culture-sand bg-culture-cream/95 px-5 py-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-culture-sand bg-white px-3 py-1 text-sm text-culture-ink hover:bg-culture-sand"
            aria-label="Fermer"
          >
            Fermer
          </button>
        </div>

        {cinemaFiche ? (
          <div className="flex flex-row items-start gap-3 px-5 pt-4 md:gap-4">
            <FilmPoster
              src={itemImageUrl(item)}
              item={item}
              className="h-[10.5rem] w-[7rem] shrink-0 md:h-[20rem] md:w-[13.35rem]"
            />
            <div className="min-w-0 flex-1 break-words">
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs text-culture-terracotta">
                {labelCategorie(event.categorie)}
              </span>
              <h2
                id="event-detail-title"
                className="mt-2 font-display text-base leading-snug text-culture-ink break-words md:text-2xl"
              >
                {event.titre}
              </h2>
              {creditNamesOf(item).length > 0 && (
                <p className="mt-1 text-sm text-culture-ink break-words">
                  {creditNamesOf(item).join(' · ')}
                </p>
              )}
              <p className="mt-1 text-xs uppercase tracking-wide text-culture-muted">
                Sur la période (pas de séance datée ce jour)
              </p>
            </div>
          </div>
        ) : (
          <div className="px-5 pt-4">
            <div className="min-w-0 break-words">
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs text-culture-terracotta">
                {labelCategorie(event.categorie)}
              </span>
              <h2
                id="event-detail-title"
                className="mt-2 font-display text-2xl text-culture-ink break-words"
              >
                {event.titre}
              </h2>
              {creditNamesOf(item).length > 0 && (
                <p className="mt-1 text-sm text-culture-ink break-words">
                  {creditNamesOf(item).join(' · ')}
                </p>
              )}
              <p className="mt-1 text-xs uppercase tracking-wide text-culture-muted">
                Sur la période (pas de séance datée ce jour)
              </p>
            </div>
          </div>
        )}

        <div className="space-y-5 px-5 py-5">
          {pitchOf(item) ? (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
                Description
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-culture-ink leading-relaxed break-words">
                {pitchOf(item)}
              </p>
            </section>
          ) : null}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-culture-muted">Dates</dt>
              <dd className="font-medium text-culture-ink">
                {formatDateRange(event.date_debut, event.date_fin)}
              </dd>
            </div>
            <div>
              <dt className="text-culture-muted">Horaires</dt>
              <dd className="font-medium text-culture-ink">
                {time || 'Non indiqués'}
              </dd>
            </div>
            <div>
              <dt className="text-culture-muted">Prix</dt>
              <dd className="font-medium text-culture-ink">{formatPrix(event)}</dd>
            </div>
            <div>
              <dt className="text-culture-muted">Statut</dt>
              <dd className="font-medium capitalize text-culture-ink">
                {event.statut || '—'}
              </dd>
            </div>
          </dl>

          {lieu && (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
                Lieu
              </h3>
              <p className="mt-1 font-medium text-culture-ink">
                {onSelectVenue ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectVenue(lieu.lieu_id);
                      onClose();
                    }}
                    className="text-left text-culture-terracotta hover:underline"
                  >
                    {formatLieuAffiche(lieu)}
                  </button>
                ) : (
                  formatLieuAffiche(lieu)
                )}
              </p>
              <p className="text-sm text-culture-muted">
                {[lieu.adresse, lieu.commune].filter(Boolean).join(', ') ||
                  lieu.commune ||
                  'Adresse non indiquée'}
              </p>
              {lieu.site_web && (
                <a
                  href={lieu.site_web}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm text-culture-terracotta hover:underline"
                >
                  Site du lieu
                </a>
              )}
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <ReserveControl
              url={reserveUrlOf(item)}
              soldOut={reserveSoldOut(item)}
              onReserve={() => {
                markEngaged();
                onReserve?.();
              }}
            />
            {cal && (
              <>
                <a
                  href={googleCalendarUrl(cal)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    markEngaged();
                    onAgenda?.();
                  }}
                  className="inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                >
                  Google Agenda
                </a>
                {mobileCal ? (
                  <a
                    href={webcalHref(item.key)}
                    onClick={() => {
                      markEngaged();
                      onIcs?.();
                    }}
                    className="inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                  >
                    S’abonner au calendrier
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      markEngaged();
                      onIcs?.();
                      downloadIcs(cal);
                    }}
                    className="inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                  >
                    Télécharger (.ics)
                  </button>
                )}
              </>
            )}
            <ShareButton item={item} />
            <FavoriteButton itemKey={item.key} />
            {sourceUrlOf(item) && (
              <a
                href={sourceUrlOf(item)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
              >
                Voir la source
              </a>
            )}
          </div>

          {showCrossSell ? (
            <AussiCeSoirSection
              items={crossSellItems}
              onSelectItem={onSelectItem}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
