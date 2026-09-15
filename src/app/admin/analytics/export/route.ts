import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { showHomeEventsCounter } from '@/lib/homeEventsCounter';
import { loadTasteExportCsv } from '@/lib/adminAnalyticsLoad';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!showHomeEventsCounter(session?.user?.email)) {
    return new NextResponse(null, { status: 404 });
  }
  const { csv, filename } = await loadTasteExportCsv();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
