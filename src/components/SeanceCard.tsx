'use client';

import type { DayItem } from '@/lib/types';
import {
  formatDateFr,
  formatHeure,
  formatItemPrix,
  formatPrix,
  labelCategorie,
} from '@/lib/labels';
import { MAIN_CATEGORY_LABELS, mainFromCategorie, mainFromGenreSlug } from '@/lib/categories';
import { catBg, catGradient } from '@/lib/categoryColor';

type Props = {
  item: DayItem;
  showDate?: boolean;
  onSelect: (key: string) => void;
  onSelectVenue?: (lieuId: string) => void;
};

function categoryLabelFor(item: DayItem): string {
  if (item.kind === 'programme') {
    const cat = item.evenement?.categorie ?? '';
    const main = mainFromCategorie(cat) ?? mainFromGenreSlug(item.programme.genre);
    if (main) return MAIN_CATEGORY_LABELS[main];
    return labelCategorie(cat);
  }
  const main =
    mainFromCategorie(item.evenement.categorie) ??
    mainFromGenreSlug(item.evenement.genre);
  if (main) return MAIN_CATEGORY_LABELS[main];
  return labelCategorie(item.evenement.categorie);
}

export default function SeanceCard({
  item,
  showDate = false,
  onSelect,
  onSelectVenue,
}: Props) {
  const catLabel = categoryLabelFor(item);
  const imageUrl =
    item.kind === 'programme'
      ? item.programme.image_url || item.evenement?.image_url || ''
      : item.evenement.image_url || '';

  const title =
    item.kind === 'programme' ? item.programme.nom_item : item.evenement.titre;

  const time =
    item.kind === 'programme'
      ? formatHeure(item.programme.heure_debut) +
        (item.programme.heure_fin
          ? ` – ${formatHeure(item.programme.heure_fin)}`
          : '')
      : formatHeure(item.evenement.heure_debut) +
        (item.evenement.heure_fin
          ? ` – ${formatHeure(item.evenement.heure_fin)}`
          : '');

  const price =
    item.kind === 'programme'
      ? formatItemPrix(item.programme.prix_item, item.evenement)
      : formatPrix(item.evenement);

  const lieu = item.lieu;
  const isPeriod = item.kind === 'fallback';

  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className="group flex w-full min-w-0 flex-col overflow-hidden rounded-card border border-culture-line bg-culture-surface text-left shadow-card transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className={
          'relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br ' +
          catGradient(catLabel)
        }
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-end p-3">
            <span className="font-display text-2xl text-white/90">
              {(catLabel || title).slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
        {catLabel && (
          <span
            className={
              'absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white shadow-sm ' +
              catBg(catLabel)
            }
          >
            {catLabel}
          </span>
        )}
        {isPeriod && (
          <span className="absolute right-3 top-3 rounded-full bg-culture-surface/95 px-2 py-0.5 text-[10px] uppercase tracking-wide text-culture-muted">
            Sur la période
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3.5 sm:p-4">
        {showDate && (
          <span className="text-xs font-medium text-culture-terracotta">
            {formatDateFr(item.dayIso)}
          </span>
        )}
        <h3 className="font-display text-lg leading-snug text-culture-ink line-clamp-2">
          {title}
        </h3>
        <p className="text-sm text-culture-ink">
          {[time, price].filter(Boolean).join(' · ')}
        </p>
        {lieu && (
          <p className="mt-auto pt-1 text-sm text-culture-muted">
            <span
              role={onSelectVenue ? 'link' : undefined}
              tabIndex={onSelectVenue ? 0 : undefined}
              onClick={
                onSelectVenue
                  ? (e) => {
                      e.stopPropagation();
                      onSelectVenue(lieu.lieu_id);
                    }
                  : undefined
              }
              onKeyDown={
                onSelectVenue
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectVenue(lieu.lieu_id);
                      }
                    }
                  : undefined
              }
              className={
                onSelectVenue
                  ? 'cursor-pointer hover:text-culture-terracotta hover:underline'
                  : undefined
              }
              title={onSelectVenue ? 'Filtrer sur ce lieu' : undefined}
            >
              {lieu.nom}
              {lieu.commune ? ` · ${lieu.commune}` : ''}
            </span>
          </p>
        )}
      </div>
    </button>
  );
}
