'use client';

import { useEffect, useState } from 'react';
import type { DayItem } from '@/lib/types';
import {
  calendarPayloadFromDayItem,
  downloadIcs,
  googleCalendarUrl,
} from '@/lib/calendar';
import { isLikelyMobile } from '@/lib/displayHome';
import SeanceCard from './SeanceCard';
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

function normalizeCommune(c: string | null | undefined): string {
  return (c || '').trim().toLocaleLowerCase('fr');
}

const NOWEB_THEATER_CODES = new Set(['W3161', 'P0235', 'P2235']);

/** mvtx /noweb or known noweb theaters. Not Pathé/Kinepolis 403. Not Utopia home. */
function isSoldOutUrl(url: string): boolean {
  const raw = (url || '').trim();
  if (!raw) return false;
  if (raw.toLowerCase().includes('/noweb')) return true;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() !== 'relay.mvtx.us') return false;
    if (parsed.pathname.toLowerCase().includes('noweb')) return true;
    const theater = (parsed.searchParams.get('code_theater') || '').toUpperCase();
    return NOWEB_THEATER_CODES.has(theater);
  } catch {
    return false;
  }
}

type ReservePick = { url: string; soldOut: boolean };

function reservePickForVenueGroup(items: DayItem[]): ReservePick {
  let ticketPage = '';
  let siteWeb = '';
  let soldOut = false;
  for (const rel of items) {
    if (rel.kind !== 'programme') continue;
    const bille =
      (rel.programme.billetterie_url || '').trim() ||
      (rel.evenement?.billetterie_url || '').trim();
    if (bille) {
      if (isSoldOutUrl(bille)) {
        soldOut = true;
        continue;
      }
      return { url: bille, soldOut: false };
    }
    const page = (rel.programme.url || '').trim();
    if (page && isSoldOutUrl(page)) soldOut = true;
    else if (!ticketPage && page && looksLikeTicket(page)) ticketPage = page;
    const site = (rel.lieu?.site_web || '').trim();
    if (!siteWeb && site && !isSoldOutUrl(site)) siteWeb = site;
  }
  if (ticketPage) return { url: ticketPage, soldOut: false };
  if (soldOut) return { url: '', soldOut: true };
  return { url: siteWeb, soldOut: false };
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
  return filtered.length > 0 ? filtered : groups;
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

function looksLikeTicket(url: string): boolean {
  if (isSoldOutUrl(url)) return false;
  const u = url.toLowerCase();
  return /billet|reserv|booking|ticket|fnacspectacles|shotgun|eventbrite|dice\.fm|placeminute|billetreduc/.test(
    u,
  );
}

function rawUrls(item: DayItem): { bille: string; page: string } {
  if (item.kind === 'programme') {
    return {
      bille: (
        (item.programme.billetterie_url || '').trim() ||
        (item.evenement?.billetterie_url || '').trim()
      ),
      page: (
        (item.programme.url || '').trim() ||
        (item.evenement?.url_source || '').trim()
      ),
    };
  }
  return {
    bille: (item.evenement.billetterie_url || '').trim(),
    page: (item.evenement.url_source || '').trim(),
  };
}

function reservePickOf(item: DayItem): ReservePick {
  const { bille, page } = rawUrls(item);
  if (bille) {
    if (isSoldOutUrl(bille)) return { url: '', soldOut: true };
    return { url: bille, soldOut: false };
  }
  if (page && isSoldOutUrl(page)) return { url: '', soldOut: true };
  if (page && looksLikeTicket(page)) return { url: page, soldOut: false };
  return { url: '', soldOut: false };
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
  const showCrossSell = engaged && aussiCeSoirItems.length > 0;

  if (item.kind === 'programme') {
    const { programme: p, evenement: ev, lieu } = item;
    const time =
      formatHeure(p.heure_debut) +
      (p.heure_fin ? ` – ${formatHeure(p.heure_fin)}` : '');
    const categorie = ev?.categorie ?? '';
    const upcomingRelated = hideSeancesBeforeToday(
      relatedItems,
      parisParts().iso,
    );
    const hasFilmSeances = upcomingRelated.length > 0;

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
          <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-culture-sand bg-culture-cream/95 px-5 py-4 backdrop-blur">
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
                <p className="mt-1 text-sm text-culture-muted break-words">{ev.titre}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-culture-sand bg-white px-3 py-1 text-sm text-culture-ink hover:bg-culture-sand"
              aria-label="Fermer"
            >
              Fermer
            </button>
          </div>

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

            {hasFilmSeances && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
                  Séances
                </h3>
                <FilmSeancesList
                  items={upcomingRelated}
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
                items={aussiCeSoirItems}
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
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-culture-sand bg-culture-cream/95 px-5 py-4 backdrop-blur">
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
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-culture-sand bg-white px-3 py-1 text-sm text-culture-ink hover:bg-culture-sand"
            aria-label="Fermer"
          >
            Fermer
          </button>
        </div>

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
              items={aussiCeSoirItems}
              onSelectItem={onSelectItem}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
