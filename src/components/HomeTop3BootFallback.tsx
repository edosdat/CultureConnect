import HomeBootChrome from './HomeBootChrome';
import Top3GuestCta from './Top3GuestCta';
import Top3Skeleton from './Top3Skeleton';

/**
 * Streaming first paint for home. Same Top 3 chrome as CultureConnectApp
 * so the section is never blank while loadHomeWindow / reco=1 are in flight.
 * HomeBootChrome reserves search + wrapping QUAND/QUOI chips + list-wait
 * so Top 3 does not jump. Guest CTA is reserved inside the section (~32px).
 */
export default function HomeTop3BootFallback() {
  return (
    <main className="mx-auto max-w-7xl min-w-0 overflow-x-hidden px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
      <h1 className="sr-only">Agenda CultureConnect</h1>
      <HomeBootChrome>
        <section
          className="w-full space-y-3 rounded-card-lg border border-culture-soft/80 bg-culture-surface/80 p-3 sm:p-4"
          data-top3=""
          data-top3-boot-fallback=""
          data-top3-pending=""
        >
          <h2 className="w-full font-display text-xl leading-tight text-culture-ink sm:text-2xl">
            Le top 3 du moment
          </h2>
          <Top3GuestCta />
          <Top3Skeleton />
        </section>
      </HomeBootChrome>
    </main>
  );
}
