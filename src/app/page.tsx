import type { Metadata } from 'next';
import { Suspense } from 'react';
import CultureConnectApp from '@/components/CultureConnectApp';
import HomeTop3BootFallback from '@/components/HomeTop3BootFallback';
import { loadHomeWindow, queryAgendaDetail } from '@/lib/agendaQuery';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import {
  itemImageUrl,
  itemPitch,
  itemTitle,
  itemVenue,
  sharePrefill,
} from '@/lib/displayHome';
import { formatDateFr } from '@/lib/labels';

/** Dynamic: do not ISR the embedded programme (stale after Paris midnight). */
export const dynamic = 'force-dynamic';

const DEFAULT_TITLE = 'CultureConnect — Agenda culturel Toulouse';
const DEFAULT_DESC =
  'Calendrier des évènements culturels autour de Toulouse : expositions, concerts, théâtre, festivals et plus.';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; id?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const key = normalizeDeepLinkId(
    firstParam(params?.e) || firstParam(params?.id),
  );
  if (!key) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESC,
      openGraph: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESC,
        locale: 'fr_FR',
        type: 'website',
      },
    };
  }
  const detail = queryAgendaDetail(key);
  if (!detail) {
    return { title: DEFAULT_TITLE, description: DEFAULT_DESC };
  }
  const item = detail.item;
  const title = itemTitle(item);
  const venue = itemVenue(item);
  const date = formatDateFr(item.dayIso || '');
  const desc =
    itemPitch(item) ||
    sharePrefill(item, '').text ||
    [title, date, venue].filter(Boolean).join(' — ');
  const photo = itemImageUrl(item);
  const ogImage = photo || `/api/og?e=${encodeURIComponent(key)}`;
  const pageTitle = `${title} — CultureConnect`;
  return {
    title: pageTitle,
    description: desc.slice(0, 200),
    openGraph: {
      title: pageTitle,
      description: desc.slice(0, 200),
      locale: 'fr_FR',
      type: 'article',
      images: [{ url: ogImage, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: desc.slice(0, 200),
      images: [ogImage],
    },
  };
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; id?: string }>;
}) {
  return (
    <Suspense fallback={<HomeTop3BootFallback />}>
      <HomePageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomePageContent({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; id?: string }>;
}) {
  const boot = await loadHomeWindow();
  const params = await searchParams;
  const initialOpenKey = normalizeDeepLinkId(
    firstParam(params?.e) || firstParam(params?.id),
  );
  const openDetail = initialOpenKey
    ? queryAgendaDetail(initialOpenKey, 'Toulouse')
    : null;

  return (
    <main>
      <CultureConnectApp
        initialScope={boot.scope}
        initialParisIso={boot.parisIso}
        initialItems={boot.items}
        initialNouveautes={boot.nouveautes}
        initialTotal={boot.total}
        initialDensifiedTotal={boot.densifiedTotal}
        initialCsvEvents={boot.csvEvents}
        initialCsvProgramme={boot.csvProgramme}
        initialVenues={boot.venues}
        initialGenreSlugs={boot.genreSlugs}
        communes={boot.communes}
        genresLegend={boot.genresLegend}
        initialYear={Number(boot.parisIso.slice(0, 4))}
        initialMonth={Number(boot.parisIso.slice(5, 7))}
        initialNouveauFilmIds={boot.nouveauFilmIds ?? []}
        initialListByScope={boot.listByScope}
        initialOpenKey={initialOpenKey}
        initialOpenItem={openDetail?.item ?? null}
        initialRelatedItems={openDetail?.relatedItems}
        initialAussiCeSoir={openDetail?.aussiCeSoir}
        initialVivantItems={boot.vivantItems ?? []}
        initialVivantTotal={boot.vivantTotal ?? 0}
        initialCineTotal={boot.cineTotal ?? 0}
        initialTheatreTotal={boot.theatreTotal ?? 0}
        initialMusiqueTotal={boot.musiqueTotal ?? 0}
        initialEnfantsTotal={boot.enfantsTotal ?? 0}
        initialExpoTotal={boot.expoTotal ?? 0}
      />
    </main>
  );
}
