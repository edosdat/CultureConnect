/**
 * « Pour toi » lexical/cultural matcher (no external API/LLM at runtime).
 *
 * Strategy: normalize FR tastes → match known phrases then unigrams → expand
 * via a synonym lexicon to category codes + genre slugs → score DayItems with
 * weighted genre/category/title/lieu/blob hits, IDF dampening when a token hits
 * >35% of the pool, and a category+genre combo bonus. Soften category when
 * specific genres are present; diversify multi-genre tastes by round-robin;
 * light Levenshtein≤1 on long unigram lexicon keys. Prefer strong signals
 * (genre/cat/title ≥ 6); sort by score desc then sooner dayIso.
 */
import type { DayItem } from '@/lib/types';
import {
  mainFromCategorie,
  mainFromGenreSlug,
  type MainCategoryId,
} from '@/lib/categories';

/** Light French stopwords — keep matching useful content words. */
const FR_STOPWORDS = new Set([
  'a',
  'ai',
  'ainsi',
  'alors',
  'au',
  'aucun',
  'aussi',
  'autre',
  'aux',
  'avec',
  'avoir',
  'bon',
  'car',
  'ce',
  'ceci',
  'cela',
  'ces',
  'cet',
  'cette',
  'ceux',
  'chaque',
  'chez',
  'comme',
  'comment',
  'dans',
  'de',
  'des',
  'du',
  'donc',
  'elle',
  'elles',
  'en',
  'encore',
  'est',
  'et',
  'eu',
  'faire',
  'fait',
  'fois',
  'il',
  'ils',
  'je',
  'la',
  'le',
  'les',
  'leur',
  'leurs',
  'lui',
  'ma',
  'mais',
  'me',
  'mes',
  'moi',
  'mon',
  'ne',
  'nos',
  'notre',
  'nous',
  'on',
  'ou',
  'où',
  'par',
  'pas',
  'peu',
  'plus',
  'pour',
  'qu',
  'que',
  'qui',
  'sa',
  'sans',
  'se',
  'ses',
  'si',
  'son',
  'sont',
  'sous',
  'sur',
  'ta',
  'te',
  'tes',
  'toi',
  'ton',
  'tous',
  'tout',
  'toute',
  'toutes',
  'tu',
  'un',
  'une',
  'vos',
  'votre',
  'vous',
  'y',
  'à',
  'ça',
  'été',
  'être',
  'j',
  'l',
  'd',
  'n',
  'c',
  'm',
  't',
  's',
  'up',
  'très',
  'trop',
  'bien',
  'vie',
  'aime',
  'aimer',
  'adore',
  'adorer',
  'prefere',
  'preferer',
  'plait',
  'plaire',
  'voir',
  'aller',
  'fan',
  'fans',
  'genre',
  'genres',
  'style',
  'styles',
  'type',
  'types',
  'truc',
  'trucs',
  'chose',
  'choses',
]);

/** Scoring weights (tuned for discrimination). */
const W_GENRE = 15;
const W_CATEGORIE = 10;
/** Soft category when specific genre intents are present (~0.35×). */
const W_CATEGORIE_SOFT = W_CATEGORIE * 0.35;
const W_TITRE = 6;
const W_LIEU = 3;
const W_BLOB = 1;
const W_PREFIX = 2;
const COMBO_BONUS = 4;
const STRONG_SIGNAL = 6;
const IDF_FRACTION = 0.35;
const IDF_DAMP = 0.25;

type LexTarget = {
  genres?: string[];
  categories?: MainCategoryId[];
};

/**
 * Free-text taste synonyms → catalog genre slugs / main categories.
 * Keys are normalized (NFD-stripped, lowercased).
 */
const SYNONYM_LEXICON: Record<string, LexTarget> = {
  // Music genres
  jazz: { genres: ['jazz_blues'], categories: ['musique'] },
  blues: { genres: ['jazz_blues'], categories: ['musique'] },
  'jazz blues': { genres: ['jazz_blues'], categories: ['musique'] },
  rock: { genres: ['rock_metal_punk'], categories: ['musique'] },
  metal: { genres: ['rock_metal_punk'], categories: ['musique'] },
  punk: { genres: ['rock_metal_punk'], categories: ['musique'] },
  'rock metal': { genres: ['rock_metal_punk'], categories: ['musique'] },
  electro: { genres: ['electro_techno'], categories: ['musique'] },
  techno: { genres: ['electro_techno'], categories: ['musique'] },
  electronique: { genres: ['electro_techno'], categories: ['musique'] },
  house: { genres: ['electro_techno'], categories: ['musique'] },
  club: { genres: ['electro_techno'], categories: ['musique'] },
  dj: { genres: ['electro_techno'], categories: ['musique'] },
  'electro techno': { genres: ['electro_techno'], categories: ['musique'] },
  hiphop: { genres: ['hiphop_rap'], categories: ['musique'] },
  'hip hop': { genres: ['hiphop_rap'], categories: ['musique'] },
  rap: { genres: ['hiphop_rap'], categories: ['musique'] },
  funk: { genres: ['funk_soul_rnb'], categories: ['musique'] },
  soul: { genres: ['funk_soul_rnb'], categories: ['musique'] },
  rnb: { genres: ['funk_soul_rnb'], categories: ['musique'] },
  'r and b': { genres: ['funk_soul_rnb'], categories: ['musique'] },
  chanson: { genres: ['chanson_variete'], categories: ['musique'] },
  variete: { genres: ['chanson_variete'], categories: ['musique'] },
  classique: { genres: ['classique_lyrique'], categories: ['musique'] },
  lyrique: { genres: ['classique_lyrique'], categories: ['musique'] },
  opera: { genres: ['classique_lyrique'], categories: ['musique'] },
  orchestre: { genres: ['classique_lyrique'], categories: ['musique'] },
  concert: { categories: ['musique'] },
  concerts: { categories: ['musique'] },
  musique: { categories: ['musique'] },
  live: { categories: ['musique'] },
  'musiques du monde': {
    genres: ['musiques_monde_trad'],
    categories: ['musique'],
  },
  'musique du monde': {
    genres: ['musiques_monde_trad'],
    categories: ['musique'],
  },
  trad: { genres: ['musiques_monde_trad'], categories: ['musique'] },
  traditionnelle: {
    genres: ['musiques_monde_trad'],
    categories: ['musique'],
  },
  folk: { genres: ['musiques_monde_trad'], categories: ['musique'] },
  guinguette: { genres: ['guinguette_sorties'], categories: ['musique'] },
  guinguettes: { genres: ['guinguette_sorties'], categories: ['musique'] },

  // Theatre / danse / humour
  standup: { genres: ['humour_standup'], categories: ['theatre_danse'] },
  'stand up': { genres: ['humour_standup'], categories: ['theatre_danse'] },
  humour: { genres: ['humour_standup'], categories: ['theatre_danse'] },
  comedie: { genres: ['humour_standup'], categories: ['theatre_danse'] },
  comique: { genres: ['humour_standup'], categories: ['theatre_danse'] },
  theatre: { categories: ['theatre_danse'] },
  theatres: { categories: ['theatre_danse'] },
  'theatre contemporain': {
    genres: ['theatre_contemporain'],
    categories: ['theatre_danse'],
  },
  'theatre classique': {
    genres: ['theatre_classique'],
    categories: ['theatre_danse'],
  },
  danse: { genres: ['danse'], categories: ['theatre_danse'] },
  ballet: { genres: ['danse'], categories: ['theatre_danse'] },
  cirque: { genres: ['cirque_arts_rue'], categories: ['theatre_danse'] },
  'arts de rue': {
    genres: ['cirque_arts_rue'],
    categories: ['theatre_danse'],
  },
  'art de rue': {
    genres: ['cirque_arts_rue'],
    categories: ['theatre_danse'],
  },
  lecture: { genres: ['lecture_poesie'], categories: ['theatre_danse'] },
  poesie: { genres: ['lecture_poesie'], categories: ['theatre_danse'] },

  // Cinema
  film: { genres: ['fiction'], categories: ['cinema'] },
  films: { genres: ['fiction'], categories: ['cinema'] },
  cine: { genres: ['fiction'], categories: ['cinema'] },
  cinema: { genres: ['fiction'], categories: ['cinema'] },
  seance: { genres: ['fiction'], categories: ['cinema'] },
  seances: { genres: ['fiction'], categories: ['cinema'] },
  cinematheque: { categories: ['cinema'] },
  documentaire: { genres: ['documentaire'], categories: ['cinema'] },
  docu: { genres: ['documentaire'], categories: ['cinema'] },
  fiction: { genres: ['fiction'], categories: ['cinema'] },
  animation: {
    genres: ['animation_jeune_public'],
    categories: ['cinema'],
  },
  retro: { genres: ['patrimoine_retro'], categories: ['cinema'] },
  'avant premiere': { genres: ['festival_avp'], categories: ['cinema'] },
  'plein air': { categories: ['cinema', 'festival'] },

  // Expo / patrimoine
  expo: {
    genres: ['expo', 'expo_patrimoine'],
    categories: ['expo_patrimoine'],
  },
  expos: {
    genres: ['expo', 'expo_patrimoine'],
    categories: ['expo_patrimoine'],
  },
  exposition: {
    genres: ['expo', 'expo_patrimoine'],
    categories: ['expo_patrimoine'],
  },
  expositions: {
    genres: ['expo', 'expo_patrimoine'],
    categories: ['expo_patrimoine'],
  },
  musee: {
    genres: ['expo', 'expo_patrimoine'],
    categories: ['expo_patrimoine'],
  },
  musees: {
    genres: ['expo', 'expo_patrimoine'],
    categories: ['expo_patrimoine'],
  },
  patrimoine: {
    genres: ['expo', 'expo_patrimoine', 'patrimoine_retro'],
    categories: ['expo_patrimoine'],
  },
  'expo patrimoine': {
    genres: ['expo', 'expo_patrimoine'],
    categories: ['expo_patrimoine'],
  },
  visite: { categories: ['expo_patrimoine'] },
  visites: { categories: ['expo_patrimoine'] },
  conference: { categories: ['expo_patrimoine'] },
  galerie: { categories: ['expo_patrimoine'] },

  // Enfants / famille
  enfants: {
    genres: ['enfants_famille', 'jeune_public', 'animation_jeune_public'],
    categories: ['enfants_famille'],
  },
  enfant: {
    genres: ['enfants_famille', 'jeune_public'],
    categories: ['enfants_famille'],
  },
  famille: {
    genres: ['enfants_famille', 'jeune_public'],
    categories: ['enfants_famille'],
  },
  familles: {
    genres: ['enfants_famille'],
    categories: ['enfants_famille'],
  },
  'jeune public': {
    genres: ['jeune_public', 'animation_jeune_public', 'enfants_famille'],
    categories: ['enfants_famille'],
  },
  kids: { genres: ['enfants_famille'], categories: ['enfants_famille'] },
  atelier: {
    genres: ['atelier_mediation', 'enfants_famille'],
    categories: ['enfants_famille'],
  },

  // Festival
  festival: {
    genres: ['festival_multi', 'festival_avp'],
    categories: ['festival'],
  },
  festivals: { categories: ['festival'] },
  salon: { categories: ['festival'] },
};

/** Lexicon keys sorted longest-first for greedy phrase matching. */
const LEXICON_KEYS_LONGEST = Object.keys(SYNONYM_LEXICON).sort(
  (a, b) => b.length - a.length || a.localeCompare(b),
);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’‘]/g, ' ')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split into raw word tokens (normalized, may include stopwords). */
function rawWords(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

/** Extract meaningful unigram tokens (≥2 chars, not stopwords). */
export function tokenizeTastes(tastes: string): string[] {
  const raw = rawWords(tastes);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (t.length < 2) continue;
    if (FR_STOPWORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Consecutive non-stopword bigrams from the taste string. */
function extractBigrams(tastes: string): string[] {
  const words = rawWords(tastes);
  const content: string[] = [];
  for (const w of words) {
    if (w.length < 2) continue;
    if (FR_STOPWORDS.has(w)) continue;
    content.push(w);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < content.length - 1; i++) {
    const bg = `${content[i]} ${content[i + 1]}`;
    if (seen.has(bg)) continue;
    seen.add(bg);
    out.push(bg);
  }
  return out;
}

export type TasteSignals = {
  genres: Set<string>;
  categories: Set<MainCategoryId>;
  /** Free unigrams / bigrams for text matching (IDF-dampened). */
  textTokens: string[];
};


/** Classic Levenshtein distance (light lexicon typo tolerance). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1);
  for (let i = 0; i < a.length; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(prev[j + 1]! + 1, curr[j]! + 1, prev[j]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Fuzzy lexicon hit for a single unigram (keys ≥5 chars, distance ≤1). */
function fuzzyLexiconUnigram(token: string): LexTarget | undefined {
  const nu = normalize(token);
  if (nu.length < 5) return undefined;
  for (const key of Object.keys(SYNONYM_LEXICON)) {
    const nk = normalize(key);
    if (nk.includes(' ') || nk.length < 5) continue;
    if (levenshtein(nu, nk) <= 1) return SYNONYM_LEXICON[key];
  }
  return undefined;
}

/** Expand free-text tastes into genre/category signals + text tokens. */
export function expandTastes(tastes: string): TasteSignals {
  const genres = new Set<string>();
  const categories = new Set<MainCategoryId>();
  const norm = normalize(tastes);
  const consumedSpans: Array<[number, number]> = [];

  const applyTarget = (target: LexTarget | undefined) => {
    if (!target) return;
    for (const g of target.genres ?? []) genres.add(g);
    for (const c of target.categories ?? []) categories.add(c);
  };

  // 1) Greedy longest lexicon phrases over the full normalized string
  for (const key of LEXICON_KEYS_LONGEST) {
    const nKey = normalize(key);
    if (!nKey) continue;
    let from = 0;
    while (from <= norm.length) {
      const idx = norm.indexOf(nKey, from);
      if (idx < 0) break;
      const end = idx + nKey.length;
      const beforeOk = idx === 0 || norm[idx - 1] === ' ';
      const afterOk = end === norm.length || norm[end] === ' ';
      if (beforeOk && afterOk) {
        const overlaps = consumedSpans.some(([a, b]) => idx < b && end > a);
        if (!overlaps) {
          consumedSpans.push([idx, end]);
          applyTarget(SYNONYM_LEXICON[key]);
        }
      }
      from = idx + 1;
    }
  }

  const unigrams = tokenizeTastes(tastes);
  const bigrams = extractBigrams(tastes);

  // 2) Map leftover unigrams / bigrams through lexicon (+ light typos on unigrams)
  for (const u of unigrams) {
    applyTarget(
      SYNONYM_LEXICON[u] ??
        SYNONYM_LEXICON[normalize(u)] ??
        fuzzyLexiconUnigram(u),
    );
  }
  for (const bg of bigrams) {
    applyTarget(SYNONYM_LEXICON[bg] ?? SYNONYM_LEXICON[normalize(bg)]);
  }

  // 3) Text tokens: phrases first, then unigrams (for title/lieu/blob)
  const textTokens: string[] = [];
  const seen = new Set<string>();
  for (const bg of bigrams) {
    if (seen.has(bg)) continue;
    seen.add(bg);
    textTokens.push(bg);
  }
  for (const u of unigrams) {
    if (seen.has(u)) continue;
    seen.add(u);
    textTokens.push(u);
  }

  return { genres, categories, textTokens };
}

type ItemFields = {
  genreSlugs: string[];
  mainCats: MainCategoryId[];
  titre: string;
  lieu: string;
  blob: string;
  allText: string;
};

function itemFields(item: DayItem): ItemFields {
  const genreParts: string[] = [];
  const catParts: string[] = [];
  const titreParts: string[] = [];
  const blobParts: string[] = [];

  if (item.kind === 'programme') {
    titreParts.push(item.programme.nom_item);
    if (item.programme.genre) genreParts.push(item.programme.genre);
    if (item.programme.type_item) catParts.push(item.programme.type_item);
    if (item.programme.notes) blobParts.push(item.programme.notes);
    if (item.programme.description_item)
      blobParts.push(item.programme.description_item);
    if (item.evenement?.titre) titreParts.push(item.evenement.titre);
    if (item.evenement?.categorie) catParts.push(item.evenement.categorie);
    if (item.evenement?.genre) genreParts.push(item.evenement.genre);
    if (item.evenement?.description_courte)
      blobParts.push(item.evenement.description_courte);
    if (item.evenement?.description_longue)
      blobParts.push(item.evenement.description_longue);
    if (item.evenement?.tags) blobParts.push(item.evenement.tags);
    if (item.evenement?.casting) blobParts.push(item.evenement.casting);
  } else {
    titreParts.push(item.evenement.titre);
    if (item.evenement.categorie) catParts.push(item.evenement.categorie);
    if (item.evenement.genre) genreParts.push(item.evenement.genre);
    if (item.evenement.description_courte)
      blobParts.push(item.evenement.description_courte);
    if (item.evenement.description_longue)
      blobParts.push(item.evenement.description_longue);
    if (item.evenement.tags) blobParts.push(item.evenement.tags);
    if (item.evenement.casting) blobParts.push(item.evenement.casting);
  }

  const lieuParts = [item.lieu?.nom ?? '', item.lieu?.commune ?? ''];
  if (item.lieu?.type) blobParts.push(item.lieu.type);

  const rawGenres =
    item.kind === 'programme'
      ? [item.programme.genre, item.evenement?.genre ?? '']
      : [item.evenement.genre];
  const genreSlugs = [
    ...new Set(
      rawGenres
        .flatMap((g) => String(g || '').split(/[,;/|]+/))
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const rawCat =
    item.kind === 'programme'
      ? (item.evenement?.categorie || '').trim()
      : (item.evenement.categorie || '').trim();

  const mainCats: MainCategoryId[] = [];
  const fromCat = mainFromCategorie(rawCat);
  if (fromCat) mainCats.push(fromCat);
  for (const g of genreSlugs) {
    const fromGenre = mainFromGenreSlug(g);
    if (fromGenre && !mainCats.includes(fromGenre)) mainCats.push(fromGenre);
  }

  const titre = normalize(
    [...titreParts, rawCat, ...genreSlugs, ...catParts].join(' '),
  );
  const lieu = normalize(lieuParts.join(' '));
  const blob = normalize(blobParts.join(' '));
  const allText = normalize(
    [titre, lieu, blob, ...genreSlugs.map((g) => g.replace(/_/g, ' '))].join(
      ' ',
    ),
  );

  return { genreSlugs, mainCats, titre, lieu, blob, allText };
}

function textContains(hay: string, needle: string): boolean {
  if (!needle || !hay) return false;
  if (needle.includes(' ')) return hay.includes(needle);
  if (needle.length <= 3) {
    const re = new RegExp(`(?:^|[^a-z0-9])${needle}(?:[^a-z0-9]|$)`);
    return re.test(hay);
  }
  return hay.includes(needle);
}

function titlePrefixHit(titre: string, token: string): boolean {
  if (token.length < 4 || !titre) return false;
  const words = titre.split(/[^a-z0-9]+/).filter(Boolean);
  return words.some(
    (w) => w.startsWith(token) || (token.startsWith(w) && w.length >= 4),
  );
}

type ScoreBreakdown = { score: number; strong: number };

function scoreItemAgainst(
  fields: ItemFields,
  signals: TasteSignals,
  idfMap: Map<string, number>,
): ScoreBreakdown {
  let score = 0;
  let strong = 0;
  let hitGenre = false;
  let hitCat = false;

  for (const g of signals.genres) {
    if (!g) continue;
    if (fields.genreSlugs.some((s) => s === g)) {
      score += W_GENRE;
      strong += W_GENRE;
      hitGenre = true;
      break;
    }
  }

  const catWeight =
    signals.genres.size > 0 ? W_CATEGORIE_SOFT : W_CATEGORIE;
  for (const c of signals.categories) {
    if (fields.mainCats.includes(c)) {
      score += catWeight;
      strong += catWeight;
      hitCat = true;
      break;
    }
  }

  if (hitGenre && hitCat) {
    score += COMBO_BONUS;
    strong += COMBO_BONUS;
  }

  for (const token of signals.textTokens) {
    const damp = idfMap.get(token) ?? 1;
    if (textContains(fields.titre, token)) {
      const add = W_TITRE * damp;
      score += add;
      strong += add;
      continue;
    }
    if (titlePrefixHit(fields.titre, token)) {
      score += W_PREFIX * damp;
      continue;
    }
    if (textContains(fields.lieu, token)) {
      score += W_LIEU * damp;
      continue;
    }
    if (textContains(fields.blob, token) || textContains(fields.allText, token)) {
      score += W_BLOB * damp;
    }
  }

  return { score, strong };
}

/** If a raw token matches >35% of candidates, dampen its text contribution. */
function computeIdfDampening(
  fieldsList: ItemFields[],
  tokens: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  const N = fieldsList.length;
  if (N === 0) return out;
  for (const token of tokens) {
    let hits = 0;
    for (const f of fieldsList) {
      if (textContains(f.allText, token)) hits += 1;
    }
    out.set(token, hits / N > IDF_FRACTION ? IDF_DAMP : 1);
  }
  return out;
}


/** First taste-genre slug that exactly matches an item genre slug. */
function primaryMatchedGenre(
  fields: ItemFields,
  genreIntents: Iterable<string>,
): string | null {
  for (const g of genreIntents) {
    if (!g) continue;
    if (fields.genreSlugs.some((s) => s === g)) return g;
  }
  return null;
}

/**
 * Round-robin across primary matched genre intents so one genre cannot
 * monopolize all top-N slots. Then fill leftovers from remaining high scores.
 */
function diversifyByGenreIntents(
  scored: ScoredDayItem[],
  fieldsOf: (item: DayItem) => ItemFields,
  genreIntents: string[],
  topN: number,
): ScoredDayItem[] {
  if (genreIntents.length < 2 || scored.length === 0) {
    return scored.slice(0, topN);
  }

  const buckets = new Map<string, ScoredDayItem[]>();
  for (const g of genreIntents) buckets.set(g, []);

  for (const entry of scored) {
    const primary = primaryMatchedGenre(fieldsOf(entry.item), genreIntents);
    if (primary && buckets.has(primary)) {
      buckets.get(primary)!.push(entry);
    }
  }

  const picked = new Set<ScoredDayItem>();
  const out: ScoredDayItem[] = [];

  while (out.length < topN) {
    let progressed = false;
    for (const g of genreIntents) {
      const bucket = buckets.get(g)!;
      while (bucket.length > 0) {
        const next = bucket.shift()!;
        if (picked.has(next)) continue;
        picked.add(next);
        out.push(next);
        progressed = true;
        break;
      }
      if (out.length >= topN) break;
    }
    if (!progressed) break;
  }

  if (out.length < topN) {
    for (const entry of scored) {
      if (out.length >= topN) break;
      if (picked.has(entry)) continue;
      picked.add(entry);
      out.push(entry);
    }
  }

  return out;
}

export type ScoredDayItem = {
  item: DayItem;
  score: number;
};

/**
 * Score DayItems against free-text tastes; return top N with score > 0.
 * Prefers items with at least one strong signal (genre/cat/title ≥ 6).
 */
export function recommendForTastes(
  items: DayItem[],
  tastes: string,
  topN = 10,
): ScoredDayItem[] {
  const trimmed = tastes.trim();
  if (!trimmed || items.length === 0) return [];

  const signals = expandTastes(trimmed);
  if (
    signals.genres.size === 0 &&
    signals.categories.size === 0 &&
    signals.textTokens.length === 0
  ) {
    return [];
  }

  const fieldsList = items.map(itemFields);
  const idfMap = computeIdfDampening(fieldsList, signals.textTokens);
  const limit = Math.max(1, Math.min(topN, 12));

  const scored: Array<ScoredDayItem & { strong: number }> = [];
  for (let i = 0; i < items.length; i++) {
    const { score, strong } = scoreItemAgainst(
      fieldsList[i]!,
      signals,
      idfMap,
    );
    if (score > 0) scored.push({ item: items[i]!, score, strong });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.dayIso.localeCompare(b.item.dayIso);
  });

  const strongOnes = scored.filter((s) => s.strong >= STRONG_SIGNAL);
  const pool = (strongOnes.length > 0 ? strongOnes : scored).map(
    ({ item, score }) => ({ item, score }),
  );

  const genreIntents = Array.from(signals.genres);
  if (genreIntents.length >= 2) {
    // Reuse fields already computed for each item index
    const fieldsByRef = new Map<DayItem, ItemFields>();
    for (let i = 0; i < items.length; i++) {
      fieldsByRef.set(items[i]!, fieldsList[i]!);
    }
    return diversifyByGenreIntents(
      pool,
      (item) => fieldsByRef.get(item) ?? itemFields(item),
      genreIntents,
      limit,
    );
  }

  return pool.slice(0, limit);
}
