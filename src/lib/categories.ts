/**
 * Main UI category buckets for CultureConnect filters.
 * Raw CSV `evenements.categorie` and `genres_legend.famille` map into these 6.
 * Option A (Eloi): Expo & patrimoine + Enfants / familles are top-level buckets,
 * NOT music genres. Only guinguette_sorties sits under Musique as a style chip.
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

/** True if item matches at least one selected main (empty selection = all). */
export function matchesMainCategories(
  categorie: string,
  genreSlug: string,
  selectedMains: string[],
): boolean {
  if (selectedMains.length === 0) return true;
  const mains = mainsForItem(categorie, genreSlug);
  if (mains.length === 0) return false;
  return mains.some((m) => selectedMains.includes(m));
}

/** Whether a legend genre belongs under any of the selected main categories. */
export function genreBelongsToMains(
  genre: { slug: string; famille: string },
  selectedMains: string[],
): boolean {
  if (selectedMains.length === 0) return false;
  // Prefer slug mapping (covers synthetic legend rows with empty/autre famille)
  const fromSlug = mainFromGenreSlug(genre.slug);
  if (fromSlug) return selectedMains.includes(fromSlug);
  const fromFamille = mainFromFamille(genre.famille);
  if (!fromFamille) return false;
  return selectedMains.includes(fromFamille);
}
