import type { Metadata } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import SiteNav from '@/components/SiteNav';
import './globals.css';

const sans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
});

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'CultureConnect — Agenda culturel Toulouse',
  description:
    'Calendrier des évènements culturels autour de Toulouse : expositions, concerts, théâtre, festivals et plus.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${sans.variable} ${display.variable} font-sans antialiased`}>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
