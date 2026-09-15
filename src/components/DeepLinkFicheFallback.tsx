import { HOME_PACK_MORE_ELLIPSIS, itemImageUrl, itemTitle } from '@/lib/displayHome';
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
        <div className="max-h-[92vh] w-full max-w-2xl min-w-0 overflow-y-auto overflow-x-hidden rounded-t-3xl border border-culture-sand bg-culture-cream shadow-xl sm:rounded-3xl">
          <div className="sticky top-0 z-10 flex items-start justify-end border-b border-culture-sand bg-culture-cream/95 px-5 py-3">
            <span className="rounded-full border border-culture-sand bg-white px-3 py-1 text-sm text-culture-ink">
              Fermer
            </span>
          </div>
          {photo ? (
            <div className="cine-hero-frame cine-hero-frame--blur">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="cine-hero-blur" src={photo} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="cine-hero-poster" src={photo} alt="" />
            </div>
          ) : (
            <div className="cine-hero-frame animate-pulse bg-culture-sand/80" />
          )}
          <div className="min-w-0 break-words px-5 pt-3 pb-5">
            <h2
              id="event-detail-title"
              className="mt-2 font-display text-base leading-snug text-culture-ink break-words md:text-2xl"
            >
              {title || HOME_PACK_MORE_ELLIPSIS}
            </h2>
            <div
              data-testid="share-social-pending"
              aria-busy="true"
              className="mt-3 space-y-2"
            >
              <div className="flex gap-2">
                <div className="h-10 flex-1 animate-pulse rounded-full bg-culture-sand/80 blur-[0.5px]" />
                <div className="h-10 flex-1 animate-pulse rounded-full bg-culture-sand/70 blur-[0.5px]" />
              </div>
              <div className="h-3 w-2/3 animate-pulse rounded bg-culture-sand/60 blur-[0.5px]" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
