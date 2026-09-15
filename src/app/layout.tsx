import type { Metadata } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import SiteNav from '@/components/SiteNav';
import Providers from '@/components/Providers';
import SiteFooter from '@/components/SiteFooter';
import { isGoogleAuthConfigured } from '@/auth';
import { publicAppOrigin } from '@/lib/sharePreviewImage';
import './globals.css';

const sans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  preload: false,
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicAppOrigin()),
  title: 'CultureConnect — Agenda culturel Toulouse',
  description:
    'Calendrier des évènements culturels autour de Toulouse : expositions, concerts, théâtre, festivals et plus.',
  openGraph: {
    title: 'CultureConnect — Agenda culturel Toulouse',
    description:
      'Concerts, théâtre et cinéma autour de Toulouse. Qu’est-ce qui te ferait vibrer ?',
    locale: 'fr_FR',
    type: 'website',
    siteName: 'CultureConnect',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CultureConnect — Agenda culturel Toulouse',
    description:
      'Concerts, théâtre et cinéma autour de Toulouse. Qu’est-ce qui te ferait vibrer ?',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${sans.variable} ${display.variable} font-sans antialiased`}>
        <Providers googleAuthEnabled={isGoogleAuthConfigured()}>
          <SiteNav />
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
