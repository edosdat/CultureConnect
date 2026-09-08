import { NextResponse } from 'next/server';
import { AGENDA_HTTP_CACHE_CONTROL } from '@/lib/agendaParams';
import {
  loadHomeWindow,
  parseCsvParam,
  parseRecoProfile,
  parseTimeScope,
  queryAgenda,
  queryAgendaDetail,
  queryAgendaListCached,
} from '@/lib/agendaQuery';

function agendaJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': AGENDA_HTTP_CACHE_CONTROL },
  });
}

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
    return agendaJson({ error: 'Too many requests' }, 429);
  }
  const url = new URL(req.url);
  if ((url.searchParams.get('window') || '').trim() === 'home') {
    const boot = await loadHomeWindow();
    return agendaJson({
      scope: boot.scope,
      commune: 'Toulouse',
      items: boot.items,
      total: boot.total,
      densifiedTotal: boot.densifiedTotal,
      csvEvents: boot.csvEvents,
      csvProgramme: boot.csvProgramme,
      nouveautes: boot.nouveautes,
      communes: boot.communes,
      venues: boot.venues,
      genreSlugs: boot.genreSlugs,
      parisIso: boot.parisIso,
      weekday: boot.weekday,
      genresLegend: boot.genresLegend,
      nouveauFilmIds: boot.nouveauFilmIds,
      vivantItems: boot.vivantItems,
      vivantTotal: boot.vivantTotal,
      cineTotal: boot.cineTotal,
      theatreTotal: boot.theatreTotal,
      musiqueTotal: boot.musiqueTotal,
      enfantsTotal: boot.enfantsTotal,
      expoTotal: boot.expoTotal,
    });
  }
  const id = (url.searchParams.get('id') || '').trim();
  if (id) {
    const detail = queryAgendaDetail(id, url.searchParams.get('commune'), {
      dateFrom: url.searchParams.get('date_from'),
      dateTo: url.searchParams.get('date_to'),
      soir: url.searchParams.get('soir') === '1',
    });
    if (!detail) {
      return agendaJson({ error: 'Introuvable' }, 404);
    }
    return agendaJson(detail);
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

  return agendaJson(result);
}

export async function POST(req: Request) {
  if (isRateLimited(clientIp(req))) {
    return agendaJson({ error: 'Too many requests' }, 429);
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
  return agendaJson(result);
}

