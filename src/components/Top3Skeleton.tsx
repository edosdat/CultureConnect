/** In-place wait for the 3 reco slots. CSS only — no fetch, no GIF. */
export default function Top3Skeleton() {
  return (
    <ul
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Chargement du top 3"
    >
      {['cine', 'theatre', 'concert'].map((slot) => (
        <li key={slot} className="min-w-0">
          <div className="animate-pulse rounded-card-lg border border-culture-soft bg-culture-surface p-4">
            <div className="aspect-[16/10] rounded-card bg-culture-sand/70" />
            <div className="mt-3 h-4 w-4/5 rounded bg-culture-sand/80" />
            <div className="mt-2 h-3 w-2/3 rounded bg-culture-sand/60" />
          </div>
        </li>
      ))}
    </ul>
  );
}
