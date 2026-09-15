import {
  catCssVarOfKey,
  catKeyOfItem,
  catLabelOfItem,
} from '@/lib/categoryColor';
import { itemImageUrl, itemTitle, itemVenue } from '@/lib/displayHome';
import { formatDateFr } from '@/lib/labels';
import { seanceTimeLabel } from '@/lib/eventTimes';
import type { DayItem } from '@/lib/types';
import HomeTop3BootFallback from './HomeTop3BootFallback';

/** Streaming share: fiche + photo first; catalogue hydrates behind. */
export default function DeepLinkFicheFallback({
  item,
}: {
  item: DayItem | null;
}) {
  const title = item ? itemTitle(item) : '';
  const photo = item ? itemImageUrl(item) : '';
  const catKey = item ? catKeyOfItem(item) : null;
  const catLabel = item ? catLabelOfItem(item) : '';
  const venue = item ? itemVenue(item) : '';
  const when = item
    ? [formatDateFr(item.dayIso || ''), seanceTimeLabel(item)]
        .filter(Boolean)
        .join(' · ')
    : '';
  const meta = [venue, when].filter(Boolean).join(' · ');

  return (
    <>
      <HomeTop3BootFallback />
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-culture-ink/40 p-0 sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
        data-deeplink-fiche-boot=""
      >
        <div className="fiche mx-2 mb-2 max-h-[92vh] w-full max-w-2xl min-w-0 overflow-y-auto overflow-x-hidden rounded-xl border border-culture-line bg-white shadow-xl sm:mx-0 sm:mb-0 sm:rounded-3xl">
          {photo ? (
            <div className="hero relative h-40 overflow-hidden bg-culture-sand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="absolute inset-0 h-full w-full object-cover"
                src={photo}
                alt=""
              />
            </div>
          ) : (
            <div className="hero h-40 animate-pulse bg-culture-sand/80" />
          )}
          <div className="fp min-w-0 break-words px-3 py-3 sm:px-5">
            {catLabel ? (
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{
                  backgroundColor: `var(${catCssVarOfKey(catKey ?? 'theatre')})`,
                }}
              >
                {catLabel}
              </span>
            ) : null}
            <h2
              id="event-detail-title"
              className="ft mt-1.5 font-display text-lg font-bold leading-snug text-culture-ink break-words"
            >
              {title || '…'}
            </h2>
            {meta ? (
              <p className="fm mt-1 text-xs text-culture-muted">{meta}</p>
            ) : null}
            <div
              data-testid="share-social-pending"
              aria-busy="true"
              className="soc mt-2.5 flex gap-2"
            >
              <div className="cc-s1-skbtn" aria-label="Chargement Envie" />
              <div className="cc-s1-skbtn" aria-label="Chargement J’y vais" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
