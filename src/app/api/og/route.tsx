import { ImageResponse } from 'next/og';
import { queryAgendaDetail } from '@/lib/agendaQuery';
import { itemTitle, itemVenue } from '@/lib/displayHome';
import { labelCategorie } from '@/lib/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get('e') || url.searchParams.get('id') || '').trim();
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

  return new ImageResponse(
    (
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
    ),
    { width: 1200, height: 630 },
  );
}
