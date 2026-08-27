import CultureConnectApp from '@/components/CultureConnectApp';
import { loadHomeWindow, queryAgendaDetail } from '@/lib/agendaQuery';
import { normalizeDeepLinkId } from '@/lib/deepLink';

export const revalidate = 300;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; id?: string }>;
}) {
  const boot = await loadHomeWindow();
  const params = await searchParams;
  const initialOpenKey = normalizeDeepLinkId(
    firstParam(params?.e) || firstParam(params?.id),
  );
  const openDetail = initialOpenKey ? queryAgendaDetail(initialOpenKey) : null;

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
        initialListByScope={boot.listByScope}
        initialOpenKey={initialOpenKey}
        initialOpenItem={openDetail?.item ?? null}
        initialRelatedItems={openDetail?.relatedItems}
        initialAussiCeSoir={openDetail?.aussiCeSoir}
      />
    </main>
  );
}
