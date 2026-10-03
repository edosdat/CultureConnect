import type { Metadata } from 'next';
import { Suspense } from 'react';
import CultureConnectApp from '@/components/CultureConnectApp';
import DeepLinkFicheFallback from '@/components/DeepLinkFicheFallback';
import HomeTop3BootFallback from '@/components/HomeTop3BootFallback';
import { loadHomeFirstPaint, queryAgendaDetail } from '@/lib/agendaQuery';
import { buildSearchIndex } from '@/lib/searchSuggestCatalogue';
import { parseAvecEnfantsFlag } from '@/lib/agendaParams';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import { itemKeyForShareToken } from '@/lib/shareStore';
import { normalizeShareToken } from '@/lib/shareToken';
import {
  itemImageUrl,
  itemPitch,
  itemTitle,
  itemVenue,
  sharePrefill,
} from '@/lib/displayHome';
import { formatDateFr } from '@/lib/labels';
import {
  publicAppOrigin,
  sharePreviewOgImage,
} from '@/lib/sharePreviewImage';

/** Dynamic: do not ISR the embedded programme (stale after Paris midnight). */
export const dynamic = 'force-dynamic';

const DEFAULT_TITLE = 'Plan C — Agenda culturel Toulouse';
const DEFAULT_DESC =
  'Calendrier des évènements culturels autour de Toulouse : expositions, concerts, théâtre, festivals et plus.';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; id?: string; t?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const key = await openKeyFromSearch(params);
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
  const origin = publicAppOrigin();
  const detail = queryAgendaDetail(key);
  if (!detail) {
    const ogImage = sharePreviewOgImage({ origin, itemKey: key });
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESC,
      openGraph: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESC,
        locale: 'fr_FR',
        type: 'website',
        images: [ogImage],
      },
      twitter: {
        card: 'summary_large_image',
        title: DEFAULT_TITLE,
        description: DEFAULT_DESC,
        images: [ogImage.url],
      },
    };
  }
  const item = detail.item;
  const title = itemTitle(item);
  const venue = itemVenue(item);
  const date = formatDateFr(item.dayIso || '');
  const desc =
    itemPitch(item) ||
    sharePrefill(item, '').text ||
    [title, date, venue].filter(Boolean).join(' — ');
  const ogImage = sharePreviewOgImage({
    origin,
    itemKey: key,
    candidates: [itemImageUrl(item)],
    alt: title,
  });
  const pageTitle = `${title} — Plan C`;
  return {
    title: pageTitle,
    description: desc.slice(0, 200),
    openGraph: {
      title: pageTitle,
      description: desc.slice(0, 200),
      locale: 'fr_FR',
      type: 'article',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: desc.slice(0, 200),
      images: [ogImage.url],
    },
  };
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** `?e=` / `?id=` first. `?t=`-only → store itemKey. Never override e. */
async function openKeyFromSearch(params: {
  e?: string;
  id?: string;
  t?: string;
}): Promise<string | null> {
  const fromQuery = normalizeDeepLinkId(
    firstParam(params?.e) || firstParam(params?.id),
  );
  if (fromQuery) return fromQuery;
  const token = normalizeShareToken(firstParam(params?.t));
  if (!token) return null;
  return itemKeyForShareToken(token);
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    e?: string;
    id?: string;
    t?: string;
    enfants?: string;
    avec_enfants?: string;
  }>;
}) {
  return (
    <Suspense fallback={<HomeTop3BootFallback />}>
      <HomePageGate searchParams={searchParams} />
    </Suspense>
  );
}

async function HomePageGate({
  searchParams,
}: {
  searchParams: Promise<{
    e?: string;
    id?: string;
    t?: string;
    enfants?: string;
    avec_enfants?: string;
  }>;
}) {
  const params = await searchParams;
  const initialAvecEnfants =
    parseAvecEnfantsFlag(firstParam(params?.enfants)) ||
    parseAvecEnfantsFlag(firstParam(params?.avec_enfants));
  const initialOpenKey = await openKeyFromSearch(params);
  const shareToken = normalizeShareToken(firstParam(params?.t));
  const openDetail = initialOpenKey
    ? queryAgendaDetail(initialOpenKey, shareToken ? null : 'Toulouse')
    : null;

  if (initialOpenKey) {
    return (
      <Suspense fallback={<DeepLinkFicheFallback item={openDetail?.item ?? null} />}>
        <HomePageApp
          initialOpenKey={initialOpenKey}
          openDetail={openDetail}
          initialAvecEnfants={initialAvecEnfants}
        />
      </Suspense>
    );
  }

  return (
    <HomePageApp
      initialOpenKey={null}
      openDetail={null}
      initialAvecEnfants={initialAvecEnfants}
    />
  );
}

async function HomePageApp({
  initialOpenKey,
  openDetail,
  initialAvecEnfants = false,
}: {
  initialOpenKey: string | null;
  openDetail: ReturnType<typeof queryAgendaDetail>;
  initialAvecEnfants?: boolean;
}) {
  const boot = await loadHomeFirstPaint();
  const searchIndex = buildSearchIndex();

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
        initialGenreSlugs={boot.genreSlugs}
        communes={boot.communes}
        genresLegend={boot.genresLegend}
        initialYear={Number(boot.parisIso.slice(0, 4))}
        initialMonth={Number(boot.parisIso.slice(5, 7))}
        initialNouveauFilmIds={boot.nouveauFilmIds ?? []}
        initialRecoByScope={boot.recoByScope}
        initialGuestMetroTop3={boot.guestMetroTop3}
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
        initialCineSlotTotal={boot.cineSlotTotal ?? 0}
        initialTheatreSlotTotal={boot.theatreSlotTotal ?? 0}
        initialMusiqueSlotTotal={boot.musiqueSlotTotal ?? 0}
        initialEnfantsSlotTotal={boot.enfantsSlotTotal ?? 0}
        initialExpoSlotTotal={boot.expoSlotTotal ?? 0}
        initialAutresSlotTotal={boot.autresSlotTotal ?? 0}
        searchSuggest={searchIndex.suggest}
        searchLieux={searchIndex.lieux}
        initialAvecEnfants={initialAvecEnfants}
      />
    </main>
  );
}
