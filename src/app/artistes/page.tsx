import ArtistesApp from '@/components/ArtistesApp';
import { loadCultureData } from '@/lib/data';

export default function ArtistesPage() {
  const data = loadCultureData();

  return (
    <main>
      <ArtistesApp
        artistes={data.artistesWithDates}
        genresLegend={data.genresLegend}
        mode={data.artistesMode}
      />
    </main>
  );
}
