import type {
  DayItem,
  Evenement,
  EventWithDetails,
  GenreLegend,
  Lieu,
  ProgrammeItem,
} from './types';
import type { TimeScopeId } from './timeScope';
import { pickPressCatalogueFields } from './pressCitation';

/** Venue fields SeanceCard / CityFilter / venue chip need. */
export function slimLieu(lieu: Lieu | null | undefined): Lieu | null {
  if (!lieu) return null;
  return {
    lieu_id: lieu.lieu_id,
    nom: lieu.nom,
    label_affiche: lieu.label_affiche || '',
    type: '',
    adresse: '',
    commune: lieu.commune || '',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
    lat: lieu.lat || '',
    lng: lieu.lng || '',
  };
}

/**
 * Unique works per living-arts pack on the home wire (not raw séances).
 * A raw slice of 20 séances densifies to ~15 theatre cards; the Théâtre
 * chip’s first pages are 50+ séances → 60+ works. Cap unique works so the
 * home rail matches that catalogue. « Plus de théâtre » / requestMore appends more.
 */
export const HOME_PACK_WIRE_CAP = 80;

/**
 * First unique works per pack that keep full fiche copy on the list wire.
 * Visible hero + nearby thumbs paint once; the rest clip and fetch `/api/agenda?id=`.
 */
export const HOME_PACK_HERO_COPY_CAP = 8;

/** Drop the boot scope copy — page already sends items + vivantItems. */
export function omitBootScopeSnapshot<T extends Record<string, unknown>>(
  listByScope: T,
  bootScope: string,
): Partial<T> {
  const out = { ...listByScope };
  delete out[bootScope];
  return out;
}

/** 1–2 phrases for list cards. Never the full description_longue. */
export function clipListPitch(raw?: string | null): string {
  const t = (raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const sentences = t.split(/(?<=[.!?…])\s+/).filter(Boolean);
  let out = sentences.slice(0, 2).join(' ') || t;
  if (out.length > 320) {
    out = out.slice(0, 317).replace(/\s+\S*$/, '') + '…';
  }
  return out;
}

function slimEvenement(
  ev: Evenement | EventWithDetails | null | undefined,
  opts?: { skipCourte?: boolean; keepFicheCopy?: boolean },
): Evenement | null {
  if (!ev) return null;
  const keep = Boolean(opts?.keepFicheCopy);
  const clipped =
    clipListPitch(ev.description_courte) || clipListPitch(ev.description_longue);
  const courte = opts?.skipCourte ? '' : clipped;
  return {
    event_id: ev.event_id,
    lieu_id: ev.lieu_id,
    titre: ev.titre,
    categorie: ev.categorie,
    date_debut: ev.date_debut,
    date_fin: ev.date_fin,
    last_seance_date: ev.last_seance_date || '',
    heure_debut: ev.heure_debut,
    heure_fin: ev.heure_fin,
    prix: ev.prix,
    gratuit: ev.gratuit,
    url_source: '',
    description_courte: courte,
    description_longue: keep ? (ev.description_longue || '').trim() : '',
    statut: ev.statut,
    genre: ev.genre,
    image_url: ev.image_url || '',
  };
}

function slimProgramme(
  p: ProgrammeItem,
  opts?: { keepFicheCopy?: boolean },
): ProgrammeItem {
  const rawItem = (p.description_item || '').trim();
  return {
    programme_id: p.programme_id,
    event_id: p.event_id,
    lieu_id: p.lieu_id,
    nom_item: p.nom_item,
    type_item: p.type_item || '',
    date: p.date,
    heure_debut: p.heure_debut || '',
    heure_fin: p.heure_fin || '',
    scene_salle: p.scene_salle || '',
    prix_item: p.prix_item || '',
    url: '',
    notes: '',
    genre: p.genre || '',
    artiste_id: p.artiste_id || '',
    film_id: p.film_id || '',
    image_url: p.image_url || '',
    description_item: opts?.keepFicheCopy ? rawItem : clipListPitch(rawItem),
  };
}

type TasteTagFields = Pick<
  ProgrammeItem,
  'form' | 'moods' | 'genres_mood' | 'themes'
>;

function tasteTagFields(src: {
  form?: string;
  moods?: string;
  genres_mood?: string;
  themes?: string;
} | null | undefined): TasteTagFields {
  return {
    form: src?.form || '',
    moods: src?.moods || '',
    genres_mood: src?.genres_mood || '',
    themes: src?.themes || '',
  };
}

/**
 * Re-attach hidden catalogue taste fields after slimDayItem.
 * List first-paint stays tagless (wire + cosine). Reco / fiche / related keep
 * them so trackItem(open_card) and Réserver share the same mood mapping.
 */
export function withTasteTags<T extends DayItem>(slim: T, source: DayItem): T {
  if (slim.kind === 'programme' && source.kind === 'programme') {
    return {
      ...slim,
      programme: { ...slim.programme, ...tasteTagFields(source.programme) },
      evenement: slim.evenement
        ? { ...slim.evenement, ...tasteTagFields(source.evenement) }
        : slim.evenement,
    };
  }
  if (slim.kind === 'fallback' && source.kind === 'fallback') {
    return {
      ...slim,
      evenement: { ...slim.evenement, ...tasteTagFields(source.evenement) },
    };
  }
  return slim;
}

/**
 * First-paint card: id, titre, heure, lieu, cat, image, film_id
 * (+ prix / genre / type so SeanceCard + densify + Pour toi still work).
 * Default clips fiche copy (1–2 sentences). Pass `keepFicheCopy` for the
 * first unique works of each pack so the visible hero paints once.
 * Drops tickets URLs, mood tags, and nested programme[].
 */
export function slimDayItem(
  item: DayItem,
  opts?: { keepFicheCopy?: boolean },
): DayItem {
  const keep = Boolean(opts?.keepFicheCopy);
  if (item.kind === 'programme') {
    const programme = slimProgramme(item.programme, { keepFicheCopy: keep });
    return {
      kind: 'programme',
      key: item.key,
      dayIso: item.dayIso,
      programme,
      evenement: slimEvenement(item.evenement, {
        skipCourte: Boolean(programme.description_item),
        keepFicheCopy: keep,
      }),
      lieu: slimLieu(item.lieu),
    };
  }
  return {
    kind: 'fallback',
    key: item.key,
    dayIso: item.dayIso,
    evenement: slimEvenement(item.evenement, { keepFicheCopy: keep }) as Evenement,
    lieu: slimLieu(item.lieu),
  };
}

/** True when the list wire still has unclipped fiche copy (first-paint hero). */
export function listItemHasHeroFicheCopy(item: DayItem): boolean {
  if (item.kind === 'programme') {
    const itemCopy = (item.programme.description_item || '').trim();
    const longue = (item.evenement?.description_longue || '').trim();
    if (longue) return true;
    if (itemCopy && itemCopy !== clipListPitch(itemCopy)) return true;
    return false;
  }
  return Boolean((item.evenement.description_longue || '').trim());
}

/**
 * Film-fiche related seances: first-paint slim + the 3 reserve URL fields
 * FilmSeancesList reads (no pitch / description / nested blobs).
 */
export function relatedSeanceDayItem(item: DayItem): DayItem {
  const slim = withTasteTags(slimDayItem(item), item);
  if (slim.kind === 'programme' && item.kind === 'programme') {
    return {
      ...slim,
      programme: {
        ...slim.programme,
        url: item.programme.url || '',
        billetterie_url: item.programme.billetterie_url || '',
      },
      lieu: slim.lieu
        ? { ...slim.lieu, site_web: item.lieu?.site_web || '' }
        : slim.lieu,
    };
  }
  if (slim.lieu) {
    return {
      ...slim,
      lieu: { ...slim.lieu, site_web: item.lieu?.site_web || '' },
    };
  }
  return slim;
}

/** Fiche: keep copy / URLs / adresse; still drop nested programme[] and long blobs. */
export function detailDayItem(item: DayItem): DayItem {
  if (item.kind === 'programme') {
    const p = item.programme;
    const ev = item.evenement;
    return {
      kind: 'programme',
      key: item.key,
      dayIso: item.dayIso,
      programme: {
        programme_id: p.programme_id,
        event_id: p.event_id,
        lieu_id: p.lieu_id,
        nom_item: p.nom_item,
        type_item: p.type_item || '',
        date: p.date,
        heure_debut: p.heure_debut || '',
        heure_fin: p.heure_fin || '',
        duree_min: p.duree_min || '',
        scene_salle: p.scene_salle || '',
        prix_item: p.prix_item || '',
        langue: p.langue || '',
        url: p.url || '',
        notes: p.notes || '',
        genre: p.genre || '',
        artiste_id: p.artiste_id || '',
        film_id: p.film_id || '',
        image_url: p.image_url || '',
        description_item: p.description_item || '',
        billetterie_url: p.billetterie_url || '',
        ...tasteTagFields(p),
        ...pickPressCatalogueFields(p as unknown as Record<string, unknown>),
      },
      evenement: ev
        ? {
            event_id: ev.event_id,
            lieu_id: ev.lieu_id,
            titre: ev.titre,
            categorie: ev.categorie,
            date_debut: ev.date_debut,
            date_fin: ev.date_fin,
            last_seance_date: ev.last_seance_date || '',
            heure_debut: ev.heure_debut,
            heure_fin: ev.heure_fin,
            duree_min: ev.duree_min || '',
            prix: ev.prix,
            gratuit: ev.gratuit,
            url_source: ev.url_source || '',
            description_courte: ev.description_courte || '',
            description_longue: ev.description_longue || '',
            statut: ev.statut,
            genre: ev.genre,
            langue: ev.langue || '',
            image_url: ev.image_url || '',
            publication: ev.publication || '',
            billetterie_url: ev.billetterie_url || '',
            casting: ev.casting || '',
            tags: ev.tags || '',
            ...tasteTagFields(ev),
            ...pickPressCatalogueFields(ev as unknown as Record<string, unknown>),
          }
        : null,
      lieu: detailLieu(item.lieu),
    };
  }
  const ev = item.evenement;
  return {
    kind: 'fallback',
    key: item.key,
    dayIso: item.dayIso,
    evenement: {
      event_id: ev.event_id,
      lieu_id: ev.lieu_id,
      titre: ev.titre,
      categorie: ev.categorie,
      date_debut: ev.date_debut,
      date_fin: ev.date_fin,
      last_seance_date: ev.last_seance_date || '',
      heure_debut: ev.heure_debut,
      heure_fin: ev.heure_fin,
      duree_min: ev.duree_min || '',
      prix: ev.prix,
      gratuit: ev.gratuit,
      langue: ev.langue || '',
      url_source: ev.url_source || '',
      description_courte: ev.description_courte || '',
      description_longue: ev.description_longue || '',
      statut: ev.statut,
      genre: ev.genre,
      image_url: ev.image_url || '',
      publication: ev.publication || '',
      billetterie_url: ev.billetterie_url || '',
      casting: ev.casting || '',
      tags: ev.tags || '',
      ...tasteTagFields(ev),
      ...pickPressCatalogueFields(ev as unknown as Record<string, unknown>),
    },
    lieu: detailLieu(item.lieu),
  };
}

function detailLieu(lieu: Lieu | null | undefined): Lieu | null {
  if (!lieu) return null;
  return {
    lieu_id: lieu.lieu_id,
    nom: lieu.nom,
    label_affiche: lieu.label_affiche || '',
    type: lieu.type || '',
    adresse: lieu.adresse || '',
    commune: lieu.commune || '',
    dist_km_capitole: '',
    site_web: lieu.site_web || '',
    notes: '',
    lat: lieu.lat || '',
    lng: lieu.lng || '',
  };
}


export type AgendaListResponse = {
  scope: TimeScopeId;
  commune: string | null;
  items: DayItem[];
  total: number;
  densifiedTotal: number;
  /** Raw evenements.csv rows (unfiltered). Cheap .length from the loaded catalogue. */
  csvEvents: number;
  /** Raw programme.csv rows (unfiltered). */
  csvProgramme: number;
  nouveautes: DayItem[];
  communes: string[];
  venues: Lieu[];
  genreSlugs: string[];
  counts?: Record<string, number>;
  parisIso: string;
  weekday: number;
  genresLegend: GenreLegend[];
  nouveauFilmIds?: string[];
  date_from?: string;
  date_to?: string;
  /** Living-arts first-paint cards (capped, unique works per pack). */
  vivantItems?: DayItem[];
  vivantTotal?: number;
  cineTotal?: number;
  theatreTotal?: number;
  musiqueTotal?: number;
  enfantsTotal?: number;
  expoTotal?: number;
  /** Date-chip snapshots — boot scope omitted (already in items). */
  listByScope?: Partial<
    Record<
      TimeScopeId,
      {
        items: DayItem[];
        total: number;
        densifiedTotal: number;
        nouveautes: DayItem[];
        venues: Lieu[];
        vivantItems?: DayItem[];
        vivantTotal?: number;
        cineTotal?: number;
        theatreTotal?: number;
        musiqueTotal?: number;
        enfantsTotal?: number;
        expoTotal?: number;
      }
    >
  >;
};

export type AgendaDetailResponse = {
  item: DayItem;
  relatedItems: DayItem[];
  aussiCeSoir: DayItem[];
};
