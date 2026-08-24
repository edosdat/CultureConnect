'use client';

import { useEffect } from 'react';
import type { DayItem } from '@/lib/types';
import {
  calendarPayloadFromDayItem,
  downloadIcs,
  googleCalendarUrl,
} from '@/lib/calendar';
import SeanceCard from './SeanceCard';
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

type VenueGroup = {
  label: string;
  lieuId: string | null;
  rows: { key: string; date: string; heure: string }[];
};

function groupSeancesByVenue(items: DayItem[]): VenueGroup[] {
  const map = new Map<string, VenueGroup>();
  const order: string[] = [];
  for (const rel of items) {
    if (rel.kind !== 'programme') continue;
    const label = formatLieuAffiche(rel.lieu) || rel.lieu?.commune || 'Lieu';
    const lieuId = rel.lieu?.lieu_id || rel.programme.lieu_id || null;
    const key = lieuId || `label:${label}`;
    if (!map.has(key)) {
      map.set(key, { label, lieuId, rows: [] });
      order.push(key);
    }
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
  for (const g of map.values()) {
    g.rows.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return a.heure.localeCompare(b.heure);
    });
  }
  return order
    .map((k) => map.get(k)!)
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

function FilmSeancesList({
  items,
  onSelectVenue,
}: {
  items: DayItem[];
  onSelectVenue?: (lieuId: string) => void;
}) {
  const groups = groupSeancesByVenue(items);
  if (groups.length === 0) return null;
  return (
    <ul className="mt-2 space-y-3 text-sm text-culture-ink">
      {groups.map((g) => (
        <li key={g.lieuId || g.label}>
          <p className="font-medium">
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
      <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
        Aussi ce soir
      </h3>
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

function reserveUrlOf(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.billetterie_url || '').trim() ||
      (item.evenement?.billetterie_url || '').trim()
    );
  }
  return (item.evenement.billetterie_url || '').trim();
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
}: Props) {
  useEscapeClose(Boolean(item), onClose);

  if (!item) return null;

  const cal = calendarPayloadFromDayItem(item);

  if (item.kind === 'programme') {
    const { programme: p, evenement: ev, lieu } = item;
    const time =
      formatHeure(p.heure_debut) +
      (p.heure_fin ? ` – ${formatHeure(p.heure_fin)}` : '');
    const categorie = ev?.categorie ?? '';
    const url = p.url || ev?.url_source || '';
    const hasFilmSeances = relatedItems.length > 0;

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
              {ev?.titre && (
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
                  items={relatedItems}
                  onSelectVenue={
                    onSelectVenue
                      ? (lieuId) => {
                          onSelectVenue(lieuId);
                          onClose();
                        }
                      : undefined
                  }
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
                {ev.description_courte && (
                  <p className="mt-2 text-culture-ink leading-relaxed break-words">
                    {ev.description_courte}
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

            <AussiCeSoirSection
              items={aussiCeSoirItems}
              onSelectItem={onSelectItem}
            />

            <div className="flex flex-wrap gap-2">
              {cal && (
                <>
                  <a
                    href={googleCalendarUrl(cal)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onAgenda?.()}
                    className="inline-flex items-center rounded-full bg-culture-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-culture-clay"
                  >
                    Google Agenda
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      onIcs?.();
                      downloadIcs(cal);
                    }}
                    className="inline-flex items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                  >
                    Télécharger (.ics)
                  </button>
                </>
              )}
              {reserveUrlOf(item) && (
                <a
                  href={reserveUrlOf(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onReserve?.()}
                  className="inline-flex items-center rounded-full border border-culture-terracotta bg-white px-4 py-2 text-sm font-medium text-culture-terracotta hover:bg-culture-soft"
                >
                  Réserver
                </a>
              )}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                >
                  Voir la source
                </a>
              )}
            </div>
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

          {event.description_courte && (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
                Description
              </h3>
              <p className="mt-1 text-culture-ink leading-relaxed break-words">
                {event.description_courte}
              </p>
            </section>
          )}

          <AussiCeSoirSection
            items={aussiCeSoirItems}
            onSelectItem={onSelectItem}
          />

          <div className="flex flex-wrap gap-2">
            {cal && (
              <>
                <a
                  href={googleCalendarUrl(cal)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onAgenda?.()}
                  className="inline-flex items-center rounded-full bg-culture-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-culture-clay"
                >
                  Google Agenda
                </a>
                <button
                  type="button"
                  onClick={() => {
                      onIcs?.();
                      downloadIcs(cal);
                    }}
                  className="inline-flex items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
                >
                  Télécharger (.ics)
                </button>
              </>
            )}
            {reserveUrlOf(item) && (
              <a
                href={reserveUrlOf(item)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onReserve?.()}
                className="inline-flex items-center rounded-full border border-culture-terracotta bg-white px-4 py-2 text-sm font-medium text-culture-terracotta hover:bg-culture-soft"
                >
                Réserver
                </a>
              )}
            {event.url_source && (
              <a
                href={event.url_source}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-culture-sand bg-white px-4 py-2 text-sm font-medium text-culture-ink hover:bg-culture-sand"
              >
                Voir la source
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
