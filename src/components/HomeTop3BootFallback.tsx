import HomeFilterChromeShell from './HomeFilterChromeShell';
import Top3Skeleton from './Top3Skeleton';

/**
 * Streaming first paint for home. Filter chrome + Top 3 skeleton so the
 * section is never blank and does not jump when loadHomeWindow hydrates.
 */
export default function HomeTop3BootFallback() {
  return (
    <main>
      <div className="mx-auto max-w-7xl min-w-0 overflow-x-hidden px-4 pb-16 pt-3 sm:px-6 sm:pt-6">
        <h1 className="sr-only">Agenda CultureConnect</h1>
        <HomeFilterChromeShell>
          <section
            className="w-full space-y-3 rounded-card-lg border border-culture-soft/80 bg-culture-surface/80 p-3 sm:p-4"
            data-top3=""
            data-top3-boot-fallback=""
            data-top3-pending=""
          >
            <h2 className="w-full font-display text-xl leading-tight text-culture-ink sm:text-2xl">
              Le top 3 du moment
            </h2>
            <Top3Skeleton />
          </section>
        </HomeFilterChromeShell>
      </div>
    </main>
  );
}
