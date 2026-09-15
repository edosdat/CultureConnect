import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/adminGate';
import { adminCsvContentDisposition } from '@/lib/adminAnalytics';
import {
  isAdminCsvStore,
  loadAdminStoreCsv,
} from '@/lib/adminAnalyticsLoad';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ store: string }> },
) {
  if (!(await isAdminSession())) {
    return new NextResponse(null, { status: 404 });
  }
  const { store } = await params;
  if (!isAdminCsvStore(store)) {
    return new NextResponse(null, { status: 404 });
  }
  const { csv, filename } = await loadAdminStoreCsv(store);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': adminCsvContentDisposition(filename),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
