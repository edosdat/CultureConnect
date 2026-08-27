import CultureConnectApp from '@/components/CultureConnectApp';
import { loadHomeWindow } from '@/lib/agendaQuery';

export const revalidate = 300;

export default async function HomePage() {
  const boot = await loadHomeWindow();

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
        initialRecoByScope={boot.recoByScope}
      />
    </main>
  );
}
