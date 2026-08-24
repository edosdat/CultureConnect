import { NextResponse } from 'next/server';
import {
  parseCsvParam,
  parseTimeScope,
  queryAgenda,
  queryAgendaDetail,
} from '@/lib/agendaQuery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (id) {
    const detail = queryAgendaDetail(id);
    if (!detail) {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
    }
    return NextResponse.json(detail);
  }

  const yearRaw = Number(url.searchParams.get('year') || '2026');
  const monthRaw = Number(url.searchParams.get('month') || '8');
  const year = Number.isFinite(yearRaw) && yearRaw >= 2000 ? yearRaw : 2026;
  const month =
    Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : 8;
  const offset = Math.max(0, Number(url.searchParams.get('offset') || '0') || 0);
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw != null ? Number(limitRaw) : undefined;

  const result = queryAgenda({
    scope: parseTimeScope(url.searchParams.get('scope')),
    commune: url.searchParams.get('commune'),
    q: url.searchParams.get('q') || '',
    cats: parseCsvParam(url.searchParams.get('cat')),
    genres: parseCsvParam(url.searchParams.get('genres')),
    lieuId: url.searchParams.get('lieu'),
    selectedDate: url.searchParams.get('date'),
    year,
    month,
    limit: Number.isFinite(limit) ? limit : undefined,
    offset,
    includeCounts: url.searchParams.get('counts') === '1',
  });

  return NextResponse.json(result);
}
