'use client';

import type { DayItem } from '@/lib/types';
import {
  formatDateRange,
  formatHeure,
  formatItemPrix,
  formatPrix,
  formatDateFr,
  labelCategorie,
  labelTypeItem,
} from '@/lib/labels';

type Props = {
  item: DayItem | null;
  onClose: () => void;
  onSelectVenue?: (lieuId: string) => void;
};

export default function EventDetail({ item, onClose, onSelectVenue }: Props) {
  if (!item) return null;

  if (item.kind === 'programme') {
    const { programme: p, evenement: ev, lieu } = item;
    const time =
      formatHeure(p.heure_debut) +
      (p.heure_fin ? ` – ${formatHeure(p.heure_fin)}` : '');
    const categorie = ev?.categorie ?? '';
    const url = p.url || ev?.url_source || '';

    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-culture-ink/40 p-0 sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
        onClick={onClose}
      >
        <div
          className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-culture-sand bg-culture-cream shadow-xl sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-culture-sand bg-culture-cream/95 px-5 py-4 backdrop-blur">
            <div>
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
                className="mt-2 font-display text-2xl text-culture-ink"
              >
                {p.nom_item}
              </h2>
              {ev?.titre && (
                <p className="mt-1 text-sm text-culture-muted">{ev.titre}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-culture-sand bg-white px-3 py-1 text-sm text-culture-ink hover:bg-culture-sand"
              aria-label="Fermer"
            >
              Fermer
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">
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
                      {lieu.nom}
                    </button>
                  ) : (
                    lieu.nom
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
                <p className="mt-1 font-medium text-culture-ink">{ev.titre}</p>
                {(ev.date_debut || ev.date_fin) && (
                  <p className="text-sm text-culture-muted">
                    {formatDateRange(ev.date_debut, ev.date_fin)}
                  </p>
                )}
                {ev.description_courte && (
                  <p className="mt-2 text-culture-ink leading-relaxed">
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
                <p className="mt-1 text-sm text-culture-ink">{p.notes}</p>
              </section>
            )}

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full bg-culture-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-culture-clay"
              >
                Voir la source
              </a>
            )}
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
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-culture-sand bg-culture-cream shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-culture-sand bg-culture-cream/95 px-5 py-4 backdrop-blur">
          <div>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs text-culture-terracotta">
              {labelCategorie(event.categorie)}
            </span>
            <h2
              id="event-detail-title"
              className="mt-2 font-display text-2xl text-culture-ink"
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
            className="rounded-full border border-culture-sand bg-white px-3 py-1 text-sm text-culture-ink hover:bg-culture-sand"
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
                    {lieu.nom}
                  </button>
                ) : (
                  lieu.nom
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
              <p className="mt-1 text-culture-ink leading-relaxed">
                {event.description_courte}
              </p>
            </section>
          )}

          {event.url_source && (
            <a
              href={event.url_source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full bg-culture-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-culture-clay"
            >
              Voir la source
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
