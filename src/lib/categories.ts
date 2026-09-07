/**
 * Main UI category buckets for CultureConnect filters.
 * Raw CSV `evenements.categorie` and `genres_legend.famille` map into these 6.
 * Option A (Eloi): Expo & patrimoine + Enfants / familles are top-level buckets,
 * NOT music genres. Guinguette + Blind test sit under Musique as style chips.
 * `blindtest` is a catalogue chip (genre column / titre), not vocab 89.
 */

export type MainCategoryId =
  | 'musique'
  | 'theatre_danse'
  | 'festival'
  | 'cinema'
  | 'expo_patrimoine'
  | 'enfants_famille';

export const MAIN_CATEGORIES: ReadonlyArray<{
  id: MainCategoryId;
  label: string;
}> = [
  { id: 'musique', label: 'Musique' },
  { id: 'theatre_danse', label: 'Théâtre & danse' },
  { id: 'festival', label: 'Festival' },
  { id: 'cinema', label: 'Cinéma' },
  { id: 'expo_patrimoine', label: 'Expo & patrimoine' },
  { id: 'enfants_famille', label: 'Enfants / familles' },
] as const;

/** Home primary axis — living vs cinema (other buckets stay in Filtres). */
export const HOME_CATEGORY_CHIPS: ReadonlyArray<{
  id: MainCategoryId;
  label: string;
}> = [
  { id: 'musique', label: 'Musique' },
  { id: 'theatre_danse', label: 'Théâtre' },
  { id: 'cinema', label: 'Cinéma' },
] as const;

export const EXTRA_CATEGORY_CHIPS: ReadonlyArray<{
  id: MainCategoryId;
  label: string;
}> = [
  { id: 'festival', label: 'Festival' },
  { id: 'expo_patrimoine', label: 'Expo & patrimoine' },
  { id: 'enfants_famille', label: 'Enfants / familles' },
] as const;

export const MAIN_CATEGORY_LABELS: Record<MainCategoryId, string> = {
  musique: 'Musique',
  theatre_danse: 'Théâtre & danse',
  festival: 'Festival',
  cinema: 'Cinéma',
  expo_patrimoine: 'Expo & patrimoine',
  enfants_famille: 'Enfants / familles',
};

/** Normalized evenements.categorie → main UI bucket (autre intentionally unmapped). */
export const CATEGORIE_TO_MAIN: Record<string, MainCategoryId> = {
  // Normalized bucket ids
  musique: 'musique',

  // Musique (legacy)
  concert: 'musique',
  guinguette: 'musique',
  // legacy aliases still seen in older rows
  'soirée': 'musique',
  soiree: 'musique',
  festival_musique: 'musique',
  opera: 'musique',

  // Théâtre & danse
  theatre_danse: 'theatre_danse',
  theatre: 'theatre_danse',
  festival_theatre: 'theatre_danse',
  danse: 'theatre_danse',
  humour: 'theatre_danse',
  cirque: 'theatre_danse',
  lecture: 'theatre_danse',

  // Festival (no "autre" — leave unmapped so junk doesn't land in Festival)
  festival: 'festival',
  festival_estival: 'festival',
  festival_multi: 'festival',
  salon: 'festival',

  // Cinéma
  cinema: 'cinema',
  cine: 'cinema',
  'ciné': 'cinema',
  'cinéma': 'cinema',
  cinema_plein_air: 'cinema',
  festival_cinema: 'cinema',
  cinematheque: 'cinema',

  // Expo & patrimoine
  expo_patrimoine: 'expo_patrimoine',
  exposition: 'expo_patrimoine',
  expo_spectacle: 'expo_patrimoine',
  visite: 'expo_patrimoine',
  expo_visite: 'expo_patrimoine',
  conference: 'expo_patrimoine',

  // Enfants / familles
  enfants_famille: 'enfants_famille',
  atelier: 'enfants_famille',
};

/** genres_legend.famille → main UI bucket */
export const FAMILLE_TO_MAIN: Record<string, MainCategoryId> = {
  musique: 'musique',
  theatre: 'theatre_danse',
  théâtre: 'theatre_danse',
  cinema: 'cinema',
  cinéma: 'cinema',
  // "autre" has no single main — resolved via GENRE_SLUG_TO_MAIN
};

/**
 * Genre slug → main (overrides famille when needed).
 * expo_patrimoine / enfants_famille are OWN mains — never under musique.
 * `autre` intentionally unmapped.
 */
export const GENRE_SLUG_TO_MAIN: Record<string, MainCategoryId> = {
  // Musique styles + guinguette chip
  classique_lyrique: 'musique',
  jazz_blues: 'musique',
  rock_metal_punk: 'musique',
  electro_techno: 'musique',
  hiphop_rap: 'musique',
  funk_soul_rnb: 'musique',
  chanson_variete: 'musique',
  musiques_monde_trad: 'musique',
  musique_autre: 'musique',
  guinguette_sorties: 'musique',
  guinguette_bal: 'musique', // legacy alias
  // Catalogue chip (evenements.genre and/or titre) — not a 89-tag vocab slug
  blindtest: 'musique',

  // Théâtre & danse
  theatre_contemporain: 'theatre_danse',
  theatre_classique: 'theatre_danse',
  humour_standup: 'theatre_danse',
  jeune_public: 'theatre_danse',
  danse: 'theatre_danse',
  cirque_arts_rue: 'theatre_danse',
  lecture_poesie: 'theatre_danse',

  // Festival
  festival_multi: 'festival',

  // Cinéma
  fiction: 'cinema',
  documentaire: 'cinema',
  animation_jeune_public: 'cinema',
  patrimoine_retro: 'cinema',
  festival_avp: 'cinema',

  // Top-level buckets (NOT musique)
  expo_patrimoine: 'expo_patrimoine',
  expo: 'expo_patrimoine',
  enfants_famille: 'enfants_famille',
  atelier_mediation: 'enfants_famille',
};

export function labelMainCategory(id: MainCategoryId | string): string {
  return MAIN_CATEGORY_LABELS[id as MainCategoryId] ?? id;
}

export function mainFromCategorie(categorie: string): MainCategoryId | null {
  if (!categorie) return null;
  const key = categorie.trim().toLowerCase();
  return CATEGORIE_TO_MAIN[key] ?? null;
}

/** Phrase `form=` → main bucket (concert chip uses the musique index). */
export function mainFromForm(form: string | null | undefined): MainCategoryId | null {
  const q = (form || '').trim().toLowerCase();
  if (!q) return null;
  if (q === 'concert' || q === 'musique') return 'musique';
  if (q === 'cine' || q === 'cinema' || q === 'ciné' || q === 'cinéma') return 'cinema';
  if (q === 'theatre' || q === 'theatre_danse' || q === 'théatre' || q === 'théâtre')
    return 'theatre_danse';
  if (q === 'festival') return 'festival';
  if (q === 'enfants' || q === 'enfants_famille') return 'enfants_famille';
  if (q === 'expo' || q === 'expo_patrimoine') return 'expo_patrimoine';
  return null;
}

/**
 * Phrase / reco form: main cat wins, then stored form, then categorie text.
 * cinema→cine, theatre_danse→theatre, musique→concert.
 */
export function formFromCategorieAndForm(
  categorie: string,
  storedForm?: string | null,
): string {
  const main = mainFromCategorie(categorie || '');
  if (main === 'cinema') return 'cine';
  if (main === 'theatre_danse') return 'theatre';
  if (main === 'musique') return 'concert';
  if (main === 'festival') return 'festival';
  if (main === 'enfants_famille') return 'enfants';
  if (main === 'expo_patrimoine') return 'expo';
  const raw = (storedForm || '').toString().trim().toLowerCase();
  if (raw) return raw;
  const c = (categorie || '').trim().toLowerCase();
  if (c.includes('cinema') || c.includes('cine')) return 'cine';
  if (c.includes('theatre') || c.includes('humour') || c.includes('danse'))
    return 'theatre';
  if (c.includes('concert') || c.includes('musique') || c.includes('guinguette'))
    return 'concert';
  if (c.includes('festival')) return 'festival';
  if (c.includes('enfant') || c.includes('famille')) return 'enfants';
  if (c.includes('expo') || c.includes('visite') || c.includes('patrimoine'))
    return 'expo';
  return '';
}

export function mainFromFamille(famille: string): MainCategoryId | null {
  if (!famille) return null;
  const key = famille.trim().toLowerCase();
  return FAMILLE_TO_MAIN[key] ?? null;
}

export function mainFromGenreSlug(slug: string): MainCategoryId | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  return GENRE_SLUG_TO_MAIN[key] ?? null;
}

/**
 * Prefer categorie mapping when it maps to a main.
 * Use genre slug only if categorie is empty/unmapped.
 */
export function mainsForItem(
  categorie: string,
  genreSlug: string,
): MainCategoryId[] {
  const fromCat = mainFromCategorie(categorie);
  if (fromCat) return [fromCat];
  const fromGenre = mainFromGenreSlug(genreSlug);
  if (fromGenre) return [fromGenre];
  return [];
}

/** Pack « Sorties cette semaine » is cinema-only: hide if any other cat is on. */
export function catsAllowCinemaPack(cats: readonly string[]): boolean {
  return cats.every((c) => c === 'cinema');
}

/**
 * Enfants-only QUOI chip — exclusive kids view (grid + Enfants carousel).
 * Combined extra chips (expo + enfants) still show all packs (#49).
 * Home chips (ciné / théâtre / musique) stay exclusive.
 */
export function isEnfantsOnlyChip(cats: readonly string[]): boolean {
  return cats.length === 1 && cats[0] === 'enfants_famille';
}

/**
 * Genre slugs that mark kids films / jeune-public theatre.
 * Their GENRE_SLUG_TO_MAIN stays cinema / theatre_danse so exclusive
 * Cinéma / Théâtre chips keep them.
 */
export const ENFANTS_CHIP_GENRE_SLUGS: ReadonlySet<string> = new Set([
  'animation_jeune_public',
  'jeune_public',
  'enfants_famille',
  'atelier_mediation',
]);

const ENFANTS_CHIP_TAG_TOKENS: ReadonlySet<string> = new Set([
  'enfants',
  'enfant',
  'famille',
  'familles',
  'familial',
  'jeune_public',
  'jeune-public',
  'jeunepublic',
  'jeunesse',
  'animation_jeune_public',
  'kids',
  'kid',
]);

const ENFANTS_PUBLIC_CIBLE: ReadonlySet<string> = new Set([
  'jeune_public',
  'jeune-public',
  'enfants',
  'enfant',
  'famille',
  'familles',
  'tout-petits',
  'tout_petits',
  'petite_enfance',
]);

export type EnfantsChipFields = {
  categorie?: string;
  genre?: string;
  tags?: string;
  publicCible?: string;
};

function splitChipTokens(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[|,;/]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEnfantsChipGenre(genreSlug: string): boolean {
  return splitChipTokens(genreSlug).some((t) => ENFANTS_CHIP_GENRE_SLUGS.has(t));
}

function hasEnfantsAudienceTag(fields: EnfantsChipFields): boolean {
  const tokens = [
    ...splitChipTokens(fields.tags),
    ...splitChipTokens(fields.publicCible),
  ];
  return tokens.some(
    (t) => ENFANTS_CHIP_TAG_TOKENS.has(t) || ENFANTS_PUBLIC_CIBLE.has(t),
  );
}

/**
 * Enfants chip predicate: cat enfants_famille / ateliers, plus kids films
 * (`animation_jeune_public`) and jeune-public theatre (genre or
 * tags famille|enfants|jeune_public). Adult thriller / concert stay out.
 */
export function matchesEnfantsChipContent(fields: EnfantsChipFields): boolean {
  const categorie = fields.categorie || '';
  const genre = fields.genre || '';
  const mains = mainsForItem(categorie, genre);
  if (mains.includes('enfants_famille')) return true;
  if (isEnfantsChipGenre(genre)) return true;
  if (mains.includes('cinema') || mains.includes('theatre_danse')) {
    return hasEnfantsAudienceTag(fields);
  }
  return false;
}

/** True if item matches at least one selected main (empty selection = all). */
export function matchesMainCategories(
  categorie: string,
  genreSlug: string,
  selectedMains: string[],
  extra?: Pick<EnfantsChipFields, 'tags' | 'publicCible'>,
): boolean {
  if (selectedMains.length === 0) return true;
  const mains = mainsForItem(categorie, genreSlug);
  if (mains.some((m) => selectedMains.includes(m))) return true;
  if (
    selectedMains.includes('enfants_famille') &&
    matchesEnfantsChipContent({
      categorie,
      genre: genreSlug,
      tags: extra?.tags,
      publicCible: extra?.publicCible,
    })
  ) {
    return true;
  }
  return false;
}

/** Whether a legend genre belongs under any of the selected main categories. */
export function genreBelongsToMains(
  genre: { slug: string; famille: string },
  selectedMains: string[],
): boolean {
  if (selectedMains.length === 0) return false;
  // Prefer slug mapping (covers synthetic legend rows with empty/autre famille)
  const fromSlug = mainFromGenreSlug(genre.slug);
  if (fromSlug) {
    if (selectedMains.includes(fromSlug)) return true;
    if (
      selectedMains.includes('enfants_famille') &&
      ENFANTS_CHIP_GENRE_SLUGS.has(genre.slug.trim().toLowerCase())
    ) {
      return true;
    }
    return false;
  }
  const fromFamille = mainFromFamille(genre.famille);
  if (!fromFamille) return false;
  return selectedMains.includes(fromFamille);
}
