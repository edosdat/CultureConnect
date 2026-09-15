import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AdminAnalyticsView from '@/components/AdminAnalyticsView';
import { isAdminSession } from '@/lib/adminGate';
import { loadAdminAnalytics } from '@/lib/adminAnalyticsLoad';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Analytics admin — CultureConnect',
  robots: { index: false, follow: false },
};

export default async function AdminAnalyticsPage() {
  if (!(await isAdminSession())) notFound();
  const snap = await loadAdminAnalytics();
  return <AdminAnalyticsView snap={snap} />;
}
