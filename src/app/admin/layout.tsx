import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { isAdminSession } from '@/lib/adminGate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Gates the whole `/admin` namespace. Non-admin → 404. */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!(await isAdminSession())) notFound();
  return children;
}
