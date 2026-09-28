import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { isAdminSession } from '@/lib/adminGate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — CultureConnect',
  robots: { index: false, follow: false },
};

/**
 * `/admin` has no dashboard of its own. Same session gate as analytics
 * (non-admin → 404), then a permanent redirect. Not a public rewrite:
 * the check runs before any Location header is sent.
 */
export default async function AdminIndexPage() {
  if (!(await isAdminSession())) notFound();
  permanentRedirect('/admin/analytics');
}
