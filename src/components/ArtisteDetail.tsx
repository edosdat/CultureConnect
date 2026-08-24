'use client';

import { useEffect } from 'react';
import type { ArtisteWithDates, GenreLegend } from '@/lib/types';
import { labelGenre, splitUpcomingPast } from '@/lib/artists';
import { formatDateFr, formatHeure } from '@/lib/labels';

type Props = {
  artiste: ArtisteWithDates | null;
  legend: GenreLegend[];
  onClose: () => void;
};

function DateRow({
  date,
  heure_debut,
  venueName,
  eventTitle,
  url,
}: {
  date: string;
  heure_debut: string;
  venueName: string;
  eventTitle: string;
  url: string;
}) {
  return (
    <li className="rounded-2xl border border-culture-sand bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium text-culture-ink">
          {formatDateFr(date)}
        </span>
        {heure_debut && (
          <span className="text-sm text-culture-muted">
            {formatHeure(heure_debut)}
          </span>
        )}
      </div>
      {venueName && (
        <p className="mt-1 text-sm text-culture-ink">{venueName}</p>
      )}
      {eventTitle && (
        <p className="mt-0.5 text-sm text-culture-muted">{eventTitle}</p>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-culture-terracotta hover:underline"
        >
          Voir le lien →
        </a>
      )}
    </li>
  );
}


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

export default function ArtisteDetail({ artiste, legend, onClose }: Props) {
  useEscapeClose(Boolean(artiste), onClose);

  if (!artiste) return null;

  const { upcoming, past } = splitUpcomingPast(artiste.dates);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-culture-ink/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="artiste-detail-title"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-culture-sand bg-culture-cream shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-culture-sand bg-culture-cream/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex flex-wrap gap-2">
              {artiste.genres.map((slug) => (
                <span
                  key={slug}
                  className="rounded-full bg-culture-sage/15 px-2.5 py-0.5 text-xs text-culture-sage"
                >
                  {labelGenre(slug, legend)}
                </span>
              ))}
            </div>
            <h2
              id="artiste-detail-title"
              className="mt-2 font-display text-2xl text-culture-ink"
            >
              {artiste.nom}
            </h2>
            <p className="mt-1 text-sm text-culture-muted">
              {artiste.upcomingCount} à venir
              {artiste.pastCount > 0 ? ` · ${artiste.pastCount} passé${artiste.pastCount > 1 ? 's' : ''}` : ''}
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

        <div className="space-y-6 px-5 py-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-culture-muted">
              Dates à venir
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-culture-muted/80">
                Aucune date à venir autour de Toulouse dans le programme actuel.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((d) => (
                  <DateRow key={`${d.programmeId}-${d.date}-${d.heure_debut}`} {...d} />
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-culture-muted">
                Dates passées
              </h3>
              <ul className="space-y-2">
                {past.map((d) => (
                  <DateRow key={`${d.programmeId}-${d.date}-${d.heure_debut}`} {...d} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
