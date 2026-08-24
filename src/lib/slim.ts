import type {
  DayItem,
  Evenement,
  EventWithDetails,
  GenreLegend,
  Lieu,
  ProgrammeItem,
} from './types';
import type { TimeScopeId } from './timeScope';

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
  };
}

function slimEvenement(
  ev: Evenement | EventWithDetails | null | undefined,
): Evenement | null {
  if (!ev) return null;
  return {
    event_id: ev.event_id,
    lieu_id: ev.lieu_id,
    titre: ev.titre,
    categorie: ev.categorie,
    date_debut: ev.date_debut,
    date_fin: ev.date_fin,
    heure_debut: ev.heure_debut,
    heure_fin: ev.heure_fin,
    prix: ev.prix,
    gratuit: ev.gratuit,
    url_source: '',
    description_courte: '',
    statut: ev.statut,
    genre: ev.genre,
    image_url: ev.image_url || '',
    publication: ev.publication || '',
  };
}

function slimProgramme(p: ProgrammeItem): ProgrammeItem {
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
  };
}

/**
 * First-paint card: id, titre, heure, lieu, cat, image, film_id
 * (+ prix / genre / type so SeanceCard + densify + Pour toi still work).
 * Drops descriptions, nested programme[], source blobs.
 */
export function slimDayItem(item: DayItem): DayItem {
  if (item.kind === 'programme') {
    return {
      kind: 'programme',
      key: item.key,
      dayIso: item.dayIso,
      programme: slimProgramme(item.programme),
      evenement: slimEvenement(item.evenement),
      lieu: slimLieu(item.lieu),
    };
  }
  return {
    kind: 'fallback',
    key: item.key,
    dayIso: item.dayIso,
    evenement: slimEvenement(item.evenement) as Evenement,
    lieu: slimLieu(item.lieu),
  };
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
        scene_salle: p.scene_salle || '',
        prix_item: p.prix_item || '',
        url: p.url || '',
        notes: p.notes || '',
        genre: p.genre || '',
        artiste_id: p.artiste_id || '',
        film_id: p.film_id || '',
        image_url: p.image_url || '',
        description_item: p.description_item || '',
        billetterie_url: p.billetterie_url || '',
      },
      evenement: ev
        ? {
            event_id: ev.event_id,
            lieu_id: ev.lieu_id,
            titre: ev.titre,
            categorie: ev.categorie,
            date_debut: ev.date_debut,
            date_fin: ev.date_fin,
            heure_debut: ev.heure_debut,
            heure_fin: ev.heure_fin,
            prix: ev.prix,
            gratuit: ev.gratuit,
            url_source: ev.url_source || '',
            description_courte: ev.description_courte || '',
            statut: ev.statut,
            genre: ev.genre,
            image_url: ev.image_url || '',
            publication: ev.publication || '',
            billetterie_url: ev.billetterie_url || '',
            tags: ev.tags || '',
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
      heure_debut: ev.heure_debut,
      heure_fin: ev.heure_fin,
      prix: ev.prix,
      gratuit: ev.gratuit,
      url_source: ev.url_source || '',
      description_courte: ev.description_courte || '',
      statut: ev.statut,
      genre: ev.genre,
      image_url: ev.image_url || '',
      publication: ev.publication || '',
      billetterie_url: ev.billetterie_url || '',
      tags: ev.tags || '',
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
  };
}


export type AgendaListResponse = {
  scope: TimeScopeId;
  commune: string | null;
  items: DayItem[];
  total: number;
  densifiedTotal: number;
  nouveautes: DayItem[];
  communes: string[];
  venues: Lieu[];
  genreSlugs: string[];
  counts?: Record<string, number>;
  parisIso: string;
  weekday: number;
  genresLegend: GenreLegend[];
};

export type AgendaDetailResponse = {
  item: DayItem;
  relatedItems: DayItem[];
  aussiCeSoir: DayItem[];
};
