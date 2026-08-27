import { NextResponse } from 'next/server';
import {
  parseCsvParam,
  parseRecoProfile,
  parseTimeScope,
  queryAgenda,
  queryAgendaDetail,
  queryAgendaListCached,
} from '@/lib/agendaQuery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const times = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) {
    hits.set(ip, times);
    return true;
  }
  times.push(now);
  hits.set(ip, times);
  return false;
}

export async function GET(req: Request) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
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

  const hasPhrase =
    url.searchParams.has('form') ||
    url.searchParams.has('moods') ||
    url.searchParams.has('themes') ||
    url.searchParams.has('entities') ||
    url.searchParams.has('date_from') ||
    url.searchParams.has('date_to');
  const form = url.searchParams.get('form');
  const moods = parseCsvParam(url.searchParams.get('moods'));
  const themes = parseCsvParam(url.searchParams.get('themes'));
  const entities = parseCsvParam(url.searchParams.get('entities'));
  const date_from = url.searchParams.get('date_from');
  const date_to = url.searchParams.get('date_to');
  const rawGenres = parseCsvParam(url.searchParams.get('genres'));
  // Phrase mode: genres = tag slugs (funk, humour…), skip exact chip filter.
  // Title q is ignored when phrase params are present (tag-to-tag).
  const recoUpcoming = url.searchParams.get('reco') === '1';
  const result = await queryAgendaListCached({
    scope: parseTimeScope(url.searchParams.get('scope')),
    commune: url.searchParams.get('commune'),
    q: hasPhrase ? '' : url.searchParams.get('q') || '',
    cats: parseCsvParam(url.searchParams.get('cat')),
    genres: hasPhrase ? [] : rawGenres,
    lieuId: url.searchParams.get('lieu'),
    selectedDate: url.searchParams.get('date'),
    year,
    month,
    limit: Number.isFinite(limit) ? limit : undefined,
    offset,
    includeCounts: url.searchParams.get('counts') === '1',
    includeListMeta: url.searchParams.get('meta') === '1',
    form: form,
    moods,
    tagGenres: hasPhrase ? rawGenres : [],
    themes,
    entities,
    date_from,
    date_to,
    recoUpcoming,
    recoProfile: null,
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const url = new URL(req.url);
  const recoUpcoming = url.searchParams.get('reco') === '1';
  let body: {
    scope?: unknown;
    commune?: unknown;
    date?: unknown;
    year?: unknown;
    month?: unknown;
    profile?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const yearRaw = Number(body.year ?? url.searchParams.get('year') ?? '2026');
  const monthRaw = Number(body.month ?? url.searchParams.get('month') ?? '8');
  const year = Number.isFinite(yearRaw) && yearRaw >= 2000 ? yearRaw : 2026;
  const month =
    Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : 8;
  const result = queryAgenda({
    scope: parseTimeScope(
      typeof body.scope === 'string' ? body.scope : url.searchParams.get('scope'),
    ),
    commune:
      typeof body.commune === 'string'
        ? body.commune
        : url.searchParams.get('commune'),
    q: '',
    cats: [],
    genres: [],
    lieuId: null,
    selectedDate:
      typeof body.date === 'string' ? body.date : url.searchParams.get('date'),
    year,
    month,
    recoUpcoming,
    recoProfile: parseRecoProfile(body.profile),
  });
  return NextResponse.json(result);
}

