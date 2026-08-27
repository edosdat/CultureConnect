import CultureConnectApp from '@/components/CultureConnectApp';
import { loadHomeWindow } from '@/lib/agendaQuery';

export default function HomePage() {
  const boot = loadHomeWindow();

  return (
    <main>
      <CultureConnectApp
        initialScope={boot.scope}
        initialParisIso={boot.parisIso}
        initialItems={boot.items}
        initialNouveautes={boot.nouveautes}
        initialTotal={boot.total}
        initialDensifiedTotal={boot.densifiedTotal}
        initialVenues={boot.venues}
        initialGenreSlugs={boot.genreSlugs}
        communes={boot.communes}
        genresLegend={boot.genresLegend}
        initialYear={2026}
        initialMonth={8}
        initialNouveauFilmIds={boot.nouveauFilmIds ?? []}
      />
    </main>
  );
}
