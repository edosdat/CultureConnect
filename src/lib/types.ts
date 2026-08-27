export type Lieu = {
  lieu_id: string;
  nom: string;
  /** Affichage UX : « Commune — Nom » (ex. Labège — Pathé Toulouse Labège) */
  label_affiche?: string;
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
  /** Enriched (optional / may be empty on older rows) */
  description_longue?: string;
  tags?: string;
  public_cible?: string;
  age_min?: string;
  duree_min?: string;
  langue?: string;
  casting?: string;
  image_url?: string;
  billetterie_url?: string;
  accessibilite?: string;
  organisateur?: string;
  scraped_at?: string;
  source_extrait?: string;
  /** agenda | masque — masque = hors liste */
  publication?: string;
  /** Hidden mood tags (never shown on cards). */
  form?: string;
  moods?: string;
  mood_source?: string;
  mood_confiance?: string;
  genres_mood?: string;
  themes?: string;
  entities?: string;
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
  /** Join key to films.csv when present (F0001…) */
  film_id?: string;
  description_item?: string;
  image_url?: string;
  billetterie_url?: string;
  duree_min?: string;
  public_cible?: string;
  scraped_at?: string;
  /** Hidden mood tags (never shown on cards). */
  form?: string;
  moods?: string;
  mood_source?: string;
  mood_confiance?: string;
  genres_mood?: string;
  themes?: string;
  entities?: string;
};

/** Row from data/films.csv — film regroupé multi-salles. */
export type Film = {
  film_id: string;
  titre: string;
  titre_normalise: string;
  genre_principal: string;
  nb_seances: string;
  nb_salles: string;
  lieux_ids: string;
  image_url: string;
  notes: string;
};

/** Film with linked programme screenings (optional UX helper). */
export type FilmWithScreenings = Film & {
  screenings: ProgrammeItem[];
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
  bio_courte?: string;
  url_site?: string;
  url_reseaux?: string;
  scraped_at?: string;
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

/** Programme + fallback events for one UI main category (built at CSV load). */
export type CategoryBucket = {
  programme: ProgrammeWithContext[];
  events: EventWithDetails[];
};

export type CultureData = {
  lieux: Lieu[];
  evenements: Evenement[];
  programme: ProgrammeItem[];
  films: Film[];
  events: EventWithDetails[];
  programmeWithContext: ProgrammeWithContext[];
  genresLegend: GenreLegend[];
  artistes: Artiste[];
  artistesWithDates: ArtisteWithDates[];
  /** 'table' when artistes.csv loaded; 'derived' when built from programme only */
  artistesMode: 'table' | 'derived';
  /** Memoized with loadCultureData — walk only this subset for cat / form chips. */
  byMain: Record<string, CategoryBucket>;
  /** Max YYYY-MM-DD across programme + events (no per-request scan). */
  maxIso: string;
  lieuxById: Map<string, Lieu>;
};
