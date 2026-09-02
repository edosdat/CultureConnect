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
import { seanceDateIso } from '@/lib/timeScope';
import { MAIN_CATEGORY_LABELS, mainFromCategorie, mainFromGenreSlug } from '@/lib/categories';
import { catCssVar, catGradient } from '@/lib/categoryColor';
import VisualFallback from './VisualFallback';
import FavoriteButton from './FavoriteButton';

export type SeanceCardVariant = 'default' | 'rail' | 'live' | 'compact';

type Props = {
  item: DayItem;
  showDate?: boolean;
  onSelect: (key: string) => void;
  onSelectVenue?: (lieuId: string) => void;
  extraSlots?: number;
  salleCount?: number;
  earliestHeure?: string;
  citiesSummary?: string;
  compact?: boolean;
  nouveau?: boolean;
  variant?: SeanceCardVariant;
  reason?: string | null;
  /** Crow-flies label, e.g. « 2,3 km ». Omit when venue coords are missing. */
  distanceKm?: string | null;
};

function cardPitch(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      (item.programme.description_item || '').trim() ||
      (item.evenement?.description_courte || '').trim()
    );
  }
  return (item.evenement.description_courte || '').trim();
}

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
  const cssVar = catCssVar(label);
  return (
    <span
      className="inline-flex w-fit rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white"
      style={{ backgroundColor: `var(${cssVar})` }}
    >
      {label}
    </span>
  );
}

function imageUrlOf(item: DayItem): string {
  return item.kind === 'programme'
    ? item.programme.image_url || item.evenement?.image_url || ''
    : item.evenement.image_url || '';
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
  variant,
  reason = null,
  distanceKm = null,
}: Props) {
  const resolved: SeanceCardVariant = variant ?? (compact ? 'compact' : 'default');
  const catLabel = categoryLabelFor(item);
  const imageUrl = imageUrlOf(item);
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
  const showCities = isFilmGroup && salleCount > 1 && Boolean(citiesSummary);
  const pitch = cardPitch(item);

  const media = (
    <div
      className={
        'relative overflow-hidden ' +
        catGradient(catLabel) +
        (resolved === 'rail'
          ? ' h-[5.25rem] w-[4.25rem] shrink-0 self-start sm:h-24 sm:w-[4.75rem] lg:h-[7.5rem] lg:w-[5.75rem]'
          : resolved === 'live'
            ? ' aspect-[4/3] w-full'
            : resolved === 'compact'
              ? ' h-16 w-full'
              : ' h-28 w-full')
      }
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className={
            'h-full w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]' +
            (resolved === 'rail' ? ' absolute inset-0' : '')
          }
        />
      ) : (
        <VisualFallback item={item} compact={resolved !== 'live'} />
      )}
      {catLabel && resolved !== 'rail' ? (
        <span className="absolute left-3 top-3">
          <CategoryPill label={catLabel} />
        </span>
      ) : null}
      {nouveau ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-culture-terracotta px-2 py-0.5 text-[11px] font-medium leading-none text-culture-cream">
          Nouveau
        </span>
      ) : isPeriod && resolved !== 'rail' ? (
        <span className="absolute right-3 top-3 rounded-full bg-culture-surface/95 px-2 py-0.5 text-[10px] uppercase tracking-wide text-culture-muted">
          Sur la période
        </span>
      ) : null}
    </div>
  );

  const venueNode =
    showVenueLine && lieu ? (
      <p
        className={
          resolved === 'live'
            ? 'mt-auto pt-1 text-sm font-semibold text-culture-ink'
            : resolved === 'rail'
              ? 'pt-0.5 text-sm text-culture-muted'
              : 'mt-auto pt-1 text-sm text-culture-muted'
        }
      >
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
        {distanceKm ? (
          <span className="text-culture-terracotta"> · {distanceKm}</span>
        ) : null}
      </p>
    ) : null;

  const body = (
    <div
      className={
        'flex min-w-0 flex-1 flex-col ' +
        (resolved === 'rail' ? 'gap-0.5 ' : 'gap-1 ') +
        (resolved === 'compact'
          ? 'p-2.5 sm:p-3 '
          : resolved === 'rail'
            ? 'px-2.5 py-2 sm:px-3 sm:py-2.5 '
            : 'p-3.5 sm:p-4 ')
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {resolved === 'rail' && catLabel ? <CategoryPill label={catLabel} /> : null}
        {showDate && (
          <span className="text-xs font-medium text-culture-terracotta">
            {formatDateFr(seanceDateIso(item) || item.dayIso)}
          </span>
        )}
        {resolved !== 'compact' ? (
          <span
            className="ml-auto"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <FavoriteButton
              itemKey={item.key}
              className={resolved === 'rail' ? 'h-8 w-8' : 'h-9 w-9'}
            />
          </span>
        ) : null}
      </div>
      <h3
        className={
          'font-display leading-snug text-culture-ink line-clamp-2 ' +
          (resolved === 'compact'
            ? 'text-base'
            : resolved === 'live'
              ? 'text-xl sm:text-2xl'
              : 'text-lg')
        }
      >
        {title}
      </h3>
      {pitch ? (
        <p
          className={
            'text-sm leading-snug text-culture-ink ' +
            (resolved === 'compact' || resolved === 'rail'
              ? 'line-clamp-2'
              : 'line-clamp-3')
          }
        >
          {pitch}
        </p>
      ) : null}
      {metaLine ? <p className="text-sm text-culture-muted">{metaLine}</p> : null}
      {showCities ? (
        <p className="text-xs text-culture-muted">
          {citiesSummary}
          {distanceKm ? ` · ${distanceKm}` : ''}
        </p>
      ) : null}
      {!showVenueLine && !showCities && distanceKm ? (
        <p className="text-xs text-culture-terracotta">{distanceKm}</p>
      ) : null}
      {venueNode}
      {reason ? (
        <p className="text-xs italic text-culture-terracotta">{reason}</p>
      ) : null}
    </div>
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className={
        'group flex w-full min-w-0 overflow-hidden rounded-card border border-culture-line border-l-4 bg-culture-surface text-left shadow-card transition duration-200 ease-out ' +
        (resolved === 'rail' ? 'flex-row items-start ' : 'flex-col ') +
        (resolved === 'compact' ? 'hover:shadow-md' : 'hover:-translate-y-0.5 hover:shadow-md')
      }
      style={accentStyle}
    >
      {media}
      {body}
    </button>
  );
}
