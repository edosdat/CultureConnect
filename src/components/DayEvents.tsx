'use client';

import type { DayItem } from '@/lib/types';
import {
  formatDateFr,
  formatHeure,
  formatItemPrix,
  formatPrix,
  labelCategorie,
  labelTypeItem,
} from '@/lib/labels';

type Props = {
  dayIso: string | null;
  monthLabel: string;
  items: DayItem[];
  showDateLabels?: boolean;
  onSelectItem: (key: string) => void;
  onSelectVenue?: (lieuId: string) => void;
  onClearDay?: () => void;
};

function VenueLink({
  lieu,
  onSelectVenue,
}: {
  lieu: { lieu_id: string; nom: string; commune: string };
  onSelectVenue?: (lieuId: string) => void;
}) {
  const label = `${lieu.nom}${lieu.commune ? ` · ${lieu.commune}` : ''}`;
  if (!onSelectVenue) return <>{label}</>;
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelectVenue(lieu.lieu_id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelectVenue(lieu.lieu_id);
        }
      }}
      className="cursor-pointer text-culture-terracotta hover:underline"
      title="Filtrer sur ce lieu"
    >
      {label}
    </span>
  );
}

export default function DayEvents({
  dayIso,
  monthLabel,
  items,
  showDateLabels = false,
  onSelectItem,
  onSelectVenue,
  onClearDay,
}: Props) {
  const programmeCount = items.filter((i) => i.kind === 'programme').length;
  const fallbackCount = items.length - programmeCount;
  const isMonthView = !dayIso;

  const title = isMonthView ? monthLabel : formatDateFr(dayIso);
  const subtitle =
    items.length === 0
      ? isMonthView
        ? 'Aucun élément ce mois-ci (avec les filtres actuels).'
        : 'Aucun élément ce jour-là (avec les filtres actuels).'
      : `${items.length} élément${items.length > 1 ? 's' : ''}` +
        (fallbackCount > 0 && programmeCount > 0
          ? ` · ${programmeCount} séance${programmeCount > 1 ? 's' : ''}`
          : '') +
        (isMonthView ? ' ce mois' : '');

  return (
    <div className="rounded-2xl border border-culture-sand bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl text-culture-ink">{title}</h2>
          <p className="mt-1 text-sm text-culture-muted">{subtitle}</p>
        </div>
        {onClearDay && (
          <button
            type="button"
            onClick={onClearDay}
            className="shrink-0 rounded-full border border-culture-sand bg-culture-cream/60 px-3 py-1.5 text-xs font-medium text-culture-terracotta transition hover:border-culture-terracotta/50 hover:bg-culture-cream"
          >
            Voir tout le mois
          </button>
        )}
      </div>

      {isMonthView && items.length === 0 && (
        <p className="mt-4 text-sm text-culture-muted">
          Affinez les filtres ou choisissez un jour dans le calendrier.
        </p>
      )}

      <ul className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        {items.map((item) => {
          if (item.kind === 'programme') {
            const { programme: p, evenement: ev, lieu } = item;
            const time =
              formatHeure(p.heure_debut) +
              (p.heure_fin ? ` – ${formatHeure(p.heure_fin)}` : '');
            const categorie = ev?.categorie ?? '';
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onSelectItem(item.key)}
                  className="w-full rounded-xl border border-culture-sand bg-culture-cream/50 p-3 text-left transition hover:border-culture-terracotta/50 hover:bg-culture-cream"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {showDateLabels && (
                      <span className="rounded-full bg-culture-terracotta/10 px-2 py-0.5 text-xs font-medium text-culture-terracotta">
                        {formatDateFr(item.dayIso)}
                      </span>
                    )}
                    {categorie && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-culture-terracotta">
                        {labelCategorie(categorie)}
                      </span>
                    )}
                    {p.type_item && (
                      <span className="rounded-full bg-culture-sage/15 px-2 py-0.5 text-xs text-culture-sage">
                        {labelTypeItem(p.type_item)}
                      </span>
                    )}
                    {time && (
                      <span className="text-xs font-medium text-culture-ink">
                        {time}
                      </span>
                    )}
                    <span className="text-xs text-culture-sage">
                      {formatItemPrix(p.prix_item, ev)}
                    </span>
                  </div>
                  <div className="mt-1 font-medium text-culture-ink">
                    {p.nom_item}
                  </div>
                  {ev?.titre && (
                    <div className="mt-0.5 text-xs text-culture-muted">
                      {ev.titre}
                    </div>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-culture-muted">
                    {lieu && (
                      <VenueLink lieu={lieu} onSelectVenue={onSelectVenue} />
                    )}
                    {p.scene_salle && (
                      <span className="text-xs">· {p.scene_salle}</span>
                    )}
                  </div>
                </button>
              </li>
            );
          }

          const { evenement: ev, lieu } = item;
          const time =
            formatHeure(ev.heure_debut) +
            (ev.heure_fin ? ` – ${formatHeure(ev.heure_fin)}` : '');
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelectItem(item.key)}
                className="w-full rounded-xl border border-dashed border-culture-sand bg-white p-3 text-left transition hover:border-culture-terracotta/50 hover:bg-culture-cream/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {showDateLabels && (
                    <span className="rounded-full bg-culture-terracotta/10 px-2 py-0.5 text-xs font-medium text-culture-terracotta">
                      {formatDateFr(item.dayIso)}
                    </span>
                  )}
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs text-culture-terracotta ring-1 ring-culture-sand">
                    {labelCategorie(ev.categorie)}
                  </span>
                  <span className="rounded-full bg-culture-cream px-2 py-0.5 text-[10px] uppercase tracking-wide text-culture-muted">
                    Sur la période
                  </span>
                  {time && (
                    <span className="text-xs text-culture-muted">{time}</span>
                  )}
                  <span className="text-xs text-culture-sage">
                    {formatPrix(ev)}
                  </span>
                </div>
                <div className="mt-1 font-medium text-culture-ink">{ev.titre}</div>
                {lieu && (
                  <div className="mt-0.5 text-sm text-culture-muted">
                    <VenueLink lieu={lieu} onSelectVenue={onSelectVenue} />
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
