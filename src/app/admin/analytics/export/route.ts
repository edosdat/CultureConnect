import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/adminGate';
import { adminCsvContentDisposition } from '@/lib/adminAnalytics';
import { loadTasteExportCsv } from '@/lib/adminAnalyticsLoad';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdminSession())) {
    return new NextResponse(null, { status: 404 });
  }
  const { csv, filename } = await loadTasteExportCsv();
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
