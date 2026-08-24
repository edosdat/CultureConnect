'use client';

import type { CSSProperties } from 'react';
import type { DayItem } from '@/lib/types';
import {
  formatDateFr,
  formatHeure,
  formatItemPrix,
  formatLieuAffiche,
  formatPrix,
  labelCategorie,
} from '@/lib/labels';
import { MAIN_CATEGORY_LABELS, mainFromCategorie, mainFromGenreSlug } from '@/lib/categories';
import { catBg, catCssVar, catGradient } from '@/lib/categoryColor';

type Props = {
  item: DayItem;
  showDate?: boolean;
  onSelect: (key: string) => void;
  onSelectVenue?: (lieuId: string) => void;
  /** Soft-collapse: extra créneaux / séances sharing group key */
  extraSlots?: number;
  /** Soft-collapse film: nombre total de salles distinctes */
  salleCount?: number;
  /** Soft-collapse film: earliest screening time (HH:MM) */
  earliestHeure?: string;
  /** Soft-collapse film: short cities summary */
  citiesSummary?: string;
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

function CategoryPill({ label }: { label: string }) {
  return (
    <span
      className={
        'inline-flex w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white shadow-sm ' +
        catBg(label)
      }
    >
      {label}
    </span>
  );
}

export default function SeanceCard({
  item,
  showDate = false,
  onSelect,
  onSelectVenue,
  extraSlots = 0,
  salleCount = 0,
  earliestHeure = '',
  citiesSummary = '',
}: Props) {
  const catLabel = categoryLabelFor(item);
  const imageUrl =
    item.kind === 'programme'
      ? item.programme.image_url || item.evenement?.image_url || ''
      : item.evenement.image_url || '';

  const title =
    item.kind === 'programme' ? item.programme.nom_item : item.evenement.titre;

  const isFilmMulti = salleCount > 1;
  const time = isFilmMulti
    ? earliestHeure
      ? `dès ${formatHeure(earliestHeure)}`
      : ''
    : item.kind === 'programme'
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
  const cssVar = catLabel ? catCssVar(catLabel) : null;
  const accentStyle = cssVar
    ? ({ borderLeftColor: `var(${cssVar})` } as CSSProperties)
    : undefined;

  const softBits: string[] = [];
  if (salleCount > 1) softBits.push(`${salleCount} salles`);
  if (extraSlots > 0) {
    softBits.push(
      salleCount > 0 ? `+${extraSlots} séances` : `+${extraSlots} créneaux`,
    );
  }

  const venueLabel = isFilmMulti
    ? citiesSummary || (lieu ? formatLieuAffiche(lieu) : '')
    : lieu
      ? formatLieuAffiche(lieu)
      : '';

  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className="group flex w-full min-w-0 flex-col overflow-hidden rounded-card border border-culture-line bg-culture-surface text-left shadow-card transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md"
    >
      {imageUrl ? (
        <div
          className={
            'relative h-24 w-full overflow-hidden ' + catGradient(catLabel)
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
          />
          {catLabel && (
            <span className="absolute left-3 top-3">
              <CategoryPill label={catLabel} />
            </span>
          )}
          {isPeriod && (
            <span className="absolute right-3 top-3 rounded-full bg-culture-surface/95 px-2 py-0.5 text-[10px] uppercase tracking-wide text-culture-muted">
              Sur la période
            </span>
          )}
        </div>
      ) : null}

      <div
        className={
          'flex min-w-0 flex-1 flex-col gap-1 p-3.5 sm:p-4 ' +
          (!imageUrl ? 'border-l-4 border-culture-line' : '')
        }
        style={!imageUrl ? accentStyle : undefined}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          {showDate && (
            <span className="text-xs font-medium text-culture-terracotta">
              {formatDateFr(item.dayIso)}
            </span>
          )}
          {!imageUrl && isPeriod && (
            <span className="rounded-full bg-culture-cream px-2 py-0.5 text-[10px] uppercase tracking-wide text-culture-muted">
              Sur la période
            </span>
          )}
        </div>
        <h3 className="font-display text-lg leading-snug text-culture-ink line-clamp-2">
          {title}
        </h3>
        {!imageUrl && catLabel ? <CategoryPill label={catLabel} /> : null}
        <p className="text-sm text-culture-ink">
          {[time, price].filter(Boolean).join(' · ')}
          {softBits.length > 0 ? ` · ${softBits.join(' · ')}` : ''}
        </p>
        {venueLabel && (
          <p className="mt-auto pt-1 text-sm text-culture-muted">
            {!isFilmMulti && lieu && onSelectVenue ? (
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
                className="cursor-pointer hover:text-culture-terracotta hover:underline"
                title="Filtrer sur ce lieu"
              >
                {venueLabel}
              </span>
            ) : (
              <span>{venueLabel}</span>
            )}
          </p>
        )}
      </div>
    </button>
  );
}
