import type {
  Artiste,
  ArtisteDate,
  ArtisteWithDates,
  GenreLegend,
  ProgrammeWithContext,
} from './types';

const ARTIST_TYPES = new Set(['artiste', 'dj']);

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeArtistName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseGenresSecondaires(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[|;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function artistGenreSlugs(a: Artiste): string[] {
  const set = new Set<string>();
  if (a.genre_principal) set.add(a.genre_principal);
  for (const g of parseGenresSecondaires(a.genres_secondaires)) set.add(g);
  return Array.from(set);
}

function appearanceFromProgramme(
  item: ProgrammeWithContext,
): ArtisteDate | null {
  const p = item.programme;
  if (!p.date) return null;
  return {
    date: p.date,
    heure_debut: p.heure_debut,
    heure_fin: p.heure_fin,
    venueName: item.lieu?.nom ?? '',
    venueId: item.lieu?.lieu_id || p.lieu_id || item.evenement?.lieu_id || '',
    eventTitle: item.evenement?.titre || p.nom_item || '',
    eventId: p.event_id,
    programmeId: p.programme_id,
    url: p.url || item.evenement?.url_source || '',
    genre: p.genre || item.evenement?.genre || '',
  };
}

function sortDates(dates: ArtisteDate[]): ArtisteDate[] {
  return dates.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const ha = a.heure_debut?.slice(0, 5) || '99:99';
    const hb = b.heure_debut?.slice(0, 5) || '99:99';
    return ha.localeCompare(hb);
  });
}

function withCounts(artiste: Artiste, dates: ArtisteDate[], today: string): ArtisteWithDates {
  const sorted = sortDates(dates);
  const genres = artistGenreSlugs(artiste);
  let upcomingCount = 0;
  let pastCount = 0;
  for (const d of sorted) {
    if (d.date >= today) upcomingCount += 1;
    else pastCount += 1;
  }
  return {
    ...artiste,
    genres,
    dates: sorted,
    upcomingCount,
    pastCount,
  };
}

/**
 * Preferred path: artistes.csv rows + programme.artiste_id join.
 * Same ArtisteWithDates shape as the derived fallback.
 */
export function buildArtistesFromTable(
  artistes: Artiste[],
  programmeWithContext: ProgrammeWithContext[],
  today: string = todayIso(),
): ArtisteWithDates[] {
  const datesById = new Map<string, ArtisteDate[]>();
  for (const item of programmeWithContext) {
    const id = item.programme.artiste_id;
    if (!id) continue;
    const appearance = appearanceFromProgramme(item);
    if (!appearance) continue;
    const list = datesById.get(id) ?? [];
    list.push(appearance);
    datesById.set(id, list);
  }

  return artistes
    .map((a) => withCounts(a, datesById.get(a.artiste_id) ?? [], today))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Fallback until artistes.csv lands: derive from programme where
 * type_item in (artiste, dj), group by normalized nom_item.
 */
export function buildArtistesDerived(
  programmeWithContext: ProgrammeWithContext[],
  today: string = todayIso(),
): ArtisteWithDates[] {
  type Acc = { artiste: Artiste; dates: ArtisteDate[] };
  const byKey = new Map<string, Acc>();
  let seq = 0;

  for (const item of programmeWithContext) {
    const p = item.programme;
    const type = (p.type_item || '').toLowerCase();
    if (!ARTIST_TYPES.has(type)) continue;
    const name = (p.nom_item || '').trim();
    if (!name) continue;
    const key = normalizeArtistName(name);
    if (!key) continue;

    let acc = byKey.get(key);
    if (!acc) {
      seq += 1;
      const id = p.artiste_id || `DER${String(seq).padStart(4, '0')}`;
      acc = {
        artiste: {
          artiste_id: id,
          nom: name,
          nom_normalise: key,
          genre_principal: p.genre || item.evenement?.genre || '',
          genres_secondaires: '',
          url_photo: '',
          notes: 'dérivé depuis programme',
        },
        dates: [],
      };
      byKey.set(key, acc);
    } else if (!acc.artiste.genre_principal && (p.genre || item.evenement?.genre)) {
      acc.artiste.genre_principal = p.genre || item.evenement?.genre || '';
    }

    const appearance = appearanceFromProgramme(item);
    if (appearance) acc.dates.push(appearance);
  }

  return Array.from(byKey.values())
    .map(({ artiste, dates }) => withCounts(artiste, dates, today))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Music genre chips from genres_legend (famille musique), preserving legend order. */
export function musicGenresFromLegend(legend: GenreLegend[]): GenreLegend[] {
  return legend.filter((g) => g.famille.trim().toLowerCase() === 'musique');
}

export function labelGenre(
  slug: string,
  legend: GenreLegend[],
): string {
  return legend.find((g) => g.slug === slug)?.label_fr ?? slug;
}

export function filterArtistes(
  artistes: ArtisteWithDates[],
  opts: { genres?: string[]; query?: string },
): ArtisteWithDates[] {
  const genres = opts.genres ?? [];
  const q = (opts.query ?? '').trim().toLowerCase();

  return artistes.filter((a) => {
    if (genres.length > 0) {
      const hit = a.genres.some((g) => genres.includes(g));
      if (!hit) return false;
    }
    if (q) {
      const hay = `${a.nom} ${a.nom_normalise}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function splitUpcomingPast(
  dates: ArtisteDate[],
  today: string = todayIso(),
): { upcoming: ArtisteDate[]; past: ArtisteDate[] } {
  const upcoming: ArtisteDate[] = [];
  const past: ArtisteDate[] = [];
  for (const d of dates) {
    if (d.date >= today) upcoming.push(d);
    else past.push(d);
  }
  // past: most recent first
  past.reverse();
  return { upcoming, past };
}
