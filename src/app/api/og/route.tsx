import { ImageResponse } from 'next/og';
import { queryAgendaDetail } from '@/lib/agendaQuery';
import { itemTitle, itemVenue } from '@/lib/displayHome';
import { labelCategorie } from '@/lib/labels';
import { SHARE_OG_SIZE } from '@/lib/sharePreviewImage';

export const runtime = 'nodejs';
/** Cached per `?e=` — crawlers often time out a cold force-dynamic ImageResponse. */
export const revalidate = 3600;

const OG_CACHE_HEADERS = {
  'Cache-Control':
    'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
};

function ogCard(title: string, venue: string, cat: string) {
  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px',
        background: 'linear-gradient(145deg, #c44a2f 0%, #e85d3b 45%, #f3e8da 100%)',
        color: '#fffcf8',
        fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            fontSize: 28,
            letterSpacing: 4,
            textTransform: 'uppercase',
            fontFamily: 'sans-serif',
            opacity: 0.9,
          }}
        >
          CultureConnect
        </div>
        <div
          style={{
            fontSize: 22,
            fontFamily: 'sans-serif',
            background: 'rgba(28,25,23,0.2)',
            padding: '8px 16px',
            borderRadius: 8,
            width: 'auto',
          }}
        >
          {cat || 'Sortie'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 64, lineHeight: 1.1, maxWidth: 1000 }}>
          {title}
        </div>
        <div style={{ fontSize: 32, fontFamily: 'sans-serif', opacity: 0.92 }}>
          {venue}
        </div>
      </div>
    </div>
  );
}

function ogPng(title: string, venue: string, cat: string) {
  return new ImageResponse(ogCard(title, venue, cat), {
    width: SHARE_OG_SIZE.width,
    height: SHARE_OG_SIZE.height,
    headers: OG_CACHE_HEADERS,
  });
}

/** Always a 1200×630 PNG. Missing `e=` or a render error still returns the branded card. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = (
      url.searchParams.get('e') ||
      url.searchParams.get('id') ||
      ''
    ).trim();
    const detail = id ? queryAgendaDetail(id) : null;
    const title = detail ? itemTitle(detail.item) : 'CultureConnect';
    const venue = detail ? itemVenue(detail.item) : 'Agenda culturel · Toulouse';
    const cat = detail
      ? labelCategorie(
          detail.item.kind === 'programme'
            ? detail.item.evenement?.categorie || ''
            : detail.item.evenement.categorie,
        )
      : 'Toulouse';
    return ogPng(title, venue, cat || 'Toulouse');
  } catch {
    return ogPng('CultureConnect', 'Agenda culturel · Toulouse', 'Toulouse');
  }
}
