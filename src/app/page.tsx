import CultureConnectApp from '@/components/CultureConnectApp';
import { loadCultureData } from '@/lib/data';

export default function HomePage() {
  const data = loadCultureData();

  // Fenêtre produit ~ 24/08/2026 – 23/09/2026 : démarrer sur août 2026
  const initialYear = 2026;
  const initialMonth = 8;

  return (
    <main>
      <CultureConnectApp
        events={data.events}
        programme={data.programmeWithContext}
        genresLegend={data.genresLegend}
        initialYear={initialYear}
        initialMonth={initialMonth}
      />
    </main>
  );
}
