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
  /** Tighter card for in-modal suggestions (Aussi ce soir). */
  compact?: boolean;
  /** 1re séance mercredi de la semaine Paris, encore à venir. */
  nouveau?: boolean;
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
  compact = false,
  nouveau = false,
}: Props) {
  const catLabel = categoryLabelFor(item);
  const imageUrl =
    item.kind === 'programme'
      ? item.programme.image_url || item.evenement?.image_url || ''
      : item.evenement.image_url || '';

  const title =
    item.kind === 'programme' ? item.programme.nom_item : item.evenement.titre;

  const singleTime =
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
  const isFilmGroup = salleCount > 0;
  const cssVar = catCssVar(catLabel);
  const accentStyle = { borderLeftColor: `var(${cssVar})` } as CSSProperties;

  const desHeure = earliestHeure
    ? formatHeure(earliestHeure)
    : singleTime
      ? singleTime.slice(0, 5)
      : '';

  let metaLine = '';
  if (isFilmGroup) {
    if (salleCount > 1) {
      metaLine = desHeure
        ? `${salleCount} salles · dès ${desHeure}`
        : `${salleCount} salles`;
    } else {
      metaLine = desHeure ? `dès ${desHeure}` : '';
    }
  } else {
    const softBits: string[] = [];
    if (extraSlots > 0) softBits.push(`+${extraSlots} créneaux`);
    metaLine = [singleTime, price, ...softBits].filter(Boolean).join(' · ');
  }

  const showVenueLine = Boolean(lieu) && (!isFilmGroup || salleCount === 1);
  const showCities =
    isFilmGroup && salleCount > 1 && Boolean(citiesSummary);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className={
        'group flex w-full min-w-0 flex-col overflow-hidden rounded-card border border-culture-line border-l-4 bg-culture-surface text-left shadow-card transition duration-200 ease-out ' +
        (compact ? 'hover:shadow-md' : 'hover:-translate-y-0.5 hover:shadow-md')
      }
      style={accentStyle}
    >
      {imageUrl || nouveau ? (
        <div
          className={
            (compact ? 'relative h-16 w-full overflow-hidden ' : 'relative h-24 w-full overflow-hidden ') +
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
          ) : null}
          {catLabel && (
            <span className="absolute left-3 top-3">
              <CategoryPill label={catLabel} />
            </span>
          )}
          {nouveau ? (
            <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-culture-terracotta px-2 py-0.5 text-[11px] font-medium leading-none text-culture-cream">
              Nouveau
            </span>
          ) : isPeriod ? (
            <span className="absolute right-3 top-3 rounded-full bg-culture-surface/95 px-2 py-0.5 text-[10px] uppercase tracking-wide text-culture-muted">
              Sur la période
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className={
          'flex min-w-0 flex-1 flex-col gap-1 ' +
          (compact ? 'p-2.5 sm:p-3 ' : 'p-3.5 sm:p-4 ')
        }
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
        <h3 className={'font-display leading-snug text-culture-ink line-clamp-2 ' + (compact ? 'text-base' : 'text-lg')}>
          {title}
        </h3>
        {!imageUrl && catLabel ? <CategoryPill label={catLabel} /> : null}
        {metaLine ? (
          <p className="text-sm text-culture-ink">{metaLine}</p>
        ) : null}
        {showCities ? (
          <p className="text-xs text-culture-muted">{citiesSummary}</p>
        ) : null}
        {showVenueLine && lieu && (
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
              {formatLieuAffiche(lieu)}
            </span>
          </p>
        )}
      </div>
    </button>
  );
}
