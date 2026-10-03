import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import MixScreen from '@/components/MixScreen';

const mixTitle = Fraunces({
  subsets: ['latin'],
  weight: '800',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-mix-title',
});

export const metadata: Metadata = {
  title: 'Ton mix de ce soir — Plan C',
  description: 'Pousse ce qui te tente, baisse le reste.',
};

export default function MixPage() {
  return (
    <main className={mixTitle.variable}>
      <MixScreen />
    </main>
  );
}
