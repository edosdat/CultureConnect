import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'CultureConnect — Agenda culturel Toulouse';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
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
        <div
          style={{
            fontSize: 28,
            letterSpacing: 4,
            textTransform: 'uppercase',
            fontFamily: 'sans-serif',
          }}
        >
          Toulouse & alentours
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 72, lineHeight: 1.05 }}>CultureConnect</div>
          <div style={{ fontSize: 32, fontFamily: 'sans-serif', maxWidth: 860 }}>
            Qu’est-ce qui te ferait vibrer ? Concerts, théâtre et cinéma.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
