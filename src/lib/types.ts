export type Lieu = {
  lieu_id: string;
  nom: string;
  type: string;
  adresse: string;
  commune: string;
  dist_km_capitole: string;
  site_web: string;
  notes: string;
};

export type Evenement = {
  event_id: string;
  lieu_id: string;
  titre: string;
  categorie: string;
  date_debut: string;
  date_fin: string;
  heure_debut: string;
  heure_fin: string;
  prix: string;
  gratuit: string;
  url_source: string;
  description_courte: string;
  statut: string;
  genre: string;
};

export type ProgrammeItem = {
  programme_id: string;
  event_id: string;
  lieu_id: string;
  nom_item: string;
  type_item: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  scene_salle: string;
  prix_item: string;
  url: string;
  notes: string;
  genre: string;
  /** Join key to artistes.csv when present */
  artiste_id: string;
};

export type GenreLegend = {
  slug: string;
  label_fr: string;
  famille: string;
};

/** Row from data/artistes.csv (preferred source of truth). */
export type Artiste = {
  artiste_id: string;
  nom: string;
  nom_normalise: string;
  genre_principal: string;
  genres_secondaires: string;
  url_photo: string;
  notes: string;
};

/** One date/appearance for an artist around Toulouse. */
export type ArtisteDate = {
  date: string;
  heure_debut: string;
  heure_fin: string;
  venueName: string;
  venueId: string;
  eventTitle: string;
  eventId: string;
  programmeId: string;
  url: string;
  genre: string;
};

export type ArtisteWithDates = Artiste & {
  genres: string[];
  dates: ArtisteDate[];
  upcomingCount: number;
  pastCount: number;
};

/** Parent event with nested programme (kept for context / fallback). */
export type EventWithDetails = Evenement & {
  lieu: Lieu | null;
  programme: ProgrammeItem[];
};

/** Programme row joined to parent event + venue — source of truth for day listing. */
export type ProgrammeWithContext = {
  programme: ProgrammeItem;
  evenement: Evenement | null;
  lieu: Lieu | null;
};

/** One row in the day agenda: unitary programme item, or event fallback when no programme that day. */
export type DayItem =
  | {
      kind: 'programme';
      key: string;
      dayIso: string;
      programme: ProgrammeItem;
      evenement: Evenement | null;
      lieu: Lieu | null;
    }
  | {
      kind: 'fallback';
      key: string;
      dayIso: string;
      evenement: Evenement;
      lieu: Lieu | null;
    };

export type CultureData = {
  lieux: Lieu[];
  evenements: Evenement[];
  programme: ProgrammeItem[];
  events: EventWithDetails[];
  programmeWithContext: ProgrammeWithContext[];
  genresLegend: GenreLegend[];
  artistes: Artiste[];
  artistesWithDates: ArtisteWithDates[];
  /** 'table' when artistes.csv loaded; 'derived' when built from programme only */
  artistesMode: 'table' | 'derived';
};
