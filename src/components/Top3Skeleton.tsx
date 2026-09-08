import {
  TOP3_INDICATOR_CLASS,
  top3CardFrameClass,
  top3TrackClass,
} from '@/lib/displayHome';

const SLOTS = ['cine', 'theatre', 'concert'] as const;

/** In-place wait for the 3 reco slots. CSS only — no fetch, no GIF. */
export default function Top3Skeleton() {
  const count = SLOTS.length;
  return (
    <div>
      <ul
        className={top3TrackClass(count)}
        aria-busy="true"
        aria-label="Chargement du top 3"
        data-top3-carousel=""
      >
        {SLOTS.map((slot) => (
          <li key={slot} className={top3CardFrameClass(count)}>
            <div className="flex h-full animate-pulse overflow-hidden rounded-card border border-culture-soft bg-culture-surface">
              <div className="w-[4.25rem] shrink-0 self-stretch bg-culture-sand/70 sm:w-[4.75rem] lg:w-[5.75rem]" />
              <div className="min-w-0 flex-1 px-2.5 py-2 sm:px-3 sm:py-2.5">
                <div className="h-4 w-4/5 rounded bg-culture-sand/80" />
                <div className="mt-2 h-3 w-2/3 rounded bg-culture-sand/60" />
                <div className="mt-2 h-3 w-1/2 rounded bg-culture-sand/50" />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div
        className={TOP3_INDICATOR_CLASS}
        data-top3-indicator=""
        aria-hidden
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-culture-terracotta/70" />
          <span className="h-2 w-2 rounded-full bg-culture-line" />
          <span className="h-2 w-2 rounded-full bg-culture-line" />
        </div>
        <span className="text-xs tabular-nums text-culture-muted">1/3</span>
      </div>
    </div>
  );
}
