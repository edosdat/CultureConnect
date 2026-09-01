import { NextResponse } from 'next/server';
import { queryAgendaDetail } from '@/lib/agendaQuery';
import { buildIcs, calendarPayloadFromDayItem } from '@/lib/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const detail = queryAgendaDetail(decodeURIComponent(id || ''));
  if (!detail) {
    return new NextResponse('Introuvable', { status: 404 });
  }
  const payload = calendarPayloadFromDayItem(detail.item);
  if (!payload) {
    return new NextResponse('Pas de date', { status: 404 });
  }
  return new NextResponse(buildIcs(payload), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="cultureconnect.ics"',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
