/** In-place wait for the 3 reco slots. CSS only — no fetch, no GIF. */
export default function Top3Skeleton() {
  return (
    <ul
      className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Chargement du top 3"
    >
      {['cine', 'theatre', 'concert'].map((slot) => (
        <li key={slot} className="min-w-0">
          <div className="flex animate-pulse overflow-hidden rounded-card border border-culture-soft bg-culture-surface">
            <div className="h-[5.25rem] w-[4.25rem] shrink-0 bg-culture-sand/70 sm:h-24 sm:w-[4.75rem] lg:h-[7.5rem] lg:w-[5.75rem]" />
            <div className="min-w-0 flex-1 px-2.5 py-2 sm:px-3 sm:py-2.5">
              <div className="h-4 w-4/5 rounded bg-culture-sand/80" />
              <div className="mt-2 h-3 w-2/3 rounded bg-culture-sand/60" />
              <div className="mt-2 h-3 w-1/2 rounded bg-culture-sand/50" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
