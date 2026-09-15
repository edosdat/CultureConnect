import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import AdminAnalyticsView from '@/components/AdminAnalyticsView';
import { showHomeEventsCounter } from '@/lib/homeEventsCounter';
import { loadAdminAnalytics } from '@/lib/adminAnalyticsLoad';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Analytics admin — CultureConnect',
  robots: { index: false, follow: false },
};

export default async function AdminAnalyticsPage() {
  const session = await auth();
  if (!showHomeEventsCounter(session?.user?.email)) {
    notFound();
  }
  const snap = await loadAdminAnalytics();
  return <AdminAnalyticsView snap={snap} />;
}
