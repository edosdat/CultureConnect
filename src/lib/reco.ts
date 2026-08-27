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
  formFromCategorieAndForm,
  mainFromCategorie,
  mainFromGenreSlug,
  type MainCategoryId,
} from '@/lib/categories';
import {
  cinemaActionShare,
  cineFicheCount,
  entryPct,
  entryWeight,
  hasActionSignals,
  lastOpenCardDayIso,
  userMentionedGuinguette,
  type AccountTasteState,
  type TasteProfile,
} from '@/lib/signals';

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

  // If the user named precise genres (jazz, électro…), do NOT boost parent
  // category alone — that was surfacing guinguettes for « j'aime le jazz ».
  // Category boost only when there are no genre intents, or as a small combo
  // when the item already matched one of those genres.
  if (signals.genres.size === 0) {
    for (const c of signals.categories) {
      if (fields.mainCats.includes(c)) {
        score += W_CATEGORIE;
        strong += W_CATEGORIE;
        hitCat = true;
        break;
      }
    }
  } else if (hitGenre) {
    for (const c of signals.categories) {
      if (fields.mainCats.includes(c)) {
        hitCat = true;
        break;
      }
    }
    if (hitCat) {
      score += COMBO_BONUS;
      strong += COMBO_BONUS;
    }
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
const GUINGUETTE_GENRE = 'guinguette_sorties';

/** Precise music genres without an explicit guinguette intent → drop guinguettes. */
function shouldDropGuinguettes(signals: TasteSignals): boolean {
  if (signals.genres.has(GUINGUETTE_GENRE)) return false;
  const others = [...signals.genres].filter((g) => g && g !== GUINGUETTE_GENRE);
  return others.length > 0;
}

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

  const dropGuinguette = shouldDropGuinguettes(signals);
  const fieldsList = items.map(itemFields);
  const idfMap = computeIdfDampening(fieldsList, signals.textTokens);
  const limit = Math.max(1, Math.min(topN, 12));

  const scored: Array<ScoredDayItem & { strong: number }> = [];
  for (let i = 0; i < items.length; i++) {
    const fields = fieldsList[i]!;
    if (
      dropGuinguette &&
      fields.genreSlugs.some((s) => s === GUINGUETTE_GENRE)
    ) {
      continue;
    }
    const { score, strong } = scoreItemAgainst(fields, signals, idfMap);
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


/** Ciné mood/genre → vivant neighbor slugs / main cats. */
export const CINE_VIVANT_NEIGHBORS: Record<string, string[]> = {
  horreur: ['theatre_contemporain', 'lecture_poesie', 'electro_techno', 'rock_metal_punk'],
  horror: ['theatre_contemporain', 'lecture_poesie', 'electro_techno', 'rock_metal_punk'],
  epouvante: ['theatre_contemporain', 'lecture_poesie', 'electro_techno', 'rock_metal_punk'],
  thriller: ['theatre_contemporain', 'lecture_poesie', 'electro_techno', 'rock_metal_punk'],
  suspense: ['theatre_contemporain', 'lecture_poesie', 'electro_techno', 'rock_metal_punk'],
  polar: ['theatre_contemporain', 'lecture_poesie', 'electro_techno', 'rock_metal_punk'],
  comedie: ['humour_standup', 'chanson_variete', 'guinguette_sorties'],
  humour: ['humour_standup', 'chanson_variete', 'guinguette_sorties'],
  animation: ['enfants_famille', 'cirque_arts_rue', 'jeune_public'],
  jeunesse: ['enfants_famille', 'cirque_arts_rue', 'jeune_public'],
  animation_jeune_public: ['enfants_famille', 'cirque_arts_rue', 'jeune_public'],
  documentaire: ['expo_patrimoine', 'lecture_poesie', 'festival'],
  docu: ['expo_patrimoine', 'lecture_poesie', 'festival'],
  retro: ['classique_lyrique', 'theatre_classique', 'expo_patrimoine'],
  patrimoine: ['classique_lyrique', 'theatre_classique', 'expo_patrimoine'],
  patrimoine_retro: ['classique_lyrique', 'theatre_classique', 'expo_patrimoine'],
  fiction: ['theatre_contemporain', 'chanson_variete', 'jazz_blues'],
};

const VIVANT_QUOTA_CATS: ReadonlySet<MainCategoryId> = new Set([
  'musique',
  'theatre_danse',
  'festival',
  'expo_patrimoine',
  'enfants_famille',
]);

const W_PROFILE_GENRE = 15;
const W_PROFILE_MOOD_NEIGHBOR = 12;
const W_PROFILE_COMMUNE = 3;
const W_PROFILE_SAME_EVENING = 2;
const FICTION_NEIGHBOR_LIGHT = 0.5;

function isCinemaFields(fields: ItemFields): boolean {
  return fields.mainCats.includes('cinema');
}

function isVivantQuotaFields(fields: ItemFields): boolean {
  return fields.mainCats.some((c) => VIVANT_QUOTA_CATS.has(c));
}

function neighborMatch(
  fields: ItemFields,
  targets: string[],
): boolean {
  if (fields.genreSlugs.some((g) => targets.includes(g))) return true;
  if (fields.mainCats.some((c) => targets.includes(c))) return true;
  return false;
}

function liveCatKeys(_profile: TasteProfile): string[] {
  // Cats are not goûts — Agenda chip_cat is a grid filter, not top 3.
  return [];
}

function itemMatchesLiveCat(
  fields: ItemFields,
  liveCats: ReadonlySet<string>,
): boolean {
  return fields.mainCats.some((c) => liveCats.has(c));
}

/** Pool can satisfy an explicit cat chip without counting blocked guinguettes. */
function poolSatisfiesLiveCat(
  fieldsList: ItemFields[],
  liveCats: ReadonlySet<string>,
  allowGuinguette: boolean,
): boolean {
  if (liveCats.size === 0) return false;
  return fieldsList.some((f) => {
    if (!itemMatchesLiveCat(f, liveCats)) return false;
    if (
      f.genreSlugs.includes(GUINGUETTE_GENRE) &&
      !allowGuinguette &&
      !f.mainCats.some((c) => c !== 'musique' && liveCats.has(c))
    ) {
      return false;
    }
    return true;
  });
}

function scoreItemFromProfile(
  fields: ItemFields,
  item: DayItem,
  state: AccountTasteState,
  lastDayIso: string | undefined,
  textScore: number,
  textCoeff: number,
  skipNeighbors: boolean,
): number {
  const profile = state.profile;
  let score = 0;

  let hitGenre = false;
  let bestGenre = 0;
  for (const g of fields.genreSlugs) {
    const w = entryWeight(profile.genres[g]);
    if (!w) continue;
    hitGenre = true;
    bestGenre = Math.max(
      bestGenre,
      W_PROFILE_GENRE * (entryPct(profile.genres[g]) / 100),
    );
  }
  score += bestGenre;

  const vivant = !isCinemaFields(fields);

  if (vivant && !skipNeighbors) {
    let bestNeighbor = 0;
    const keys = [
      ...Object.entries(profile.moods),
      ...Object.entries(profile.genres),
    ];
    for (const [key, entry] of keys) {
      const w = entryWeight(entry);
      const targets = CINE_VIVANT_NEIGHBORS[key];
      if (!targets || w <= 0) continue;
      if (!neighborMatch(fields, targets)) continue;
      const light = key === 'fiction' ? FICTION_NEIGHBOR_LIGHT : 1;
      bestNeighbor = Math.max(
        bestNeighbor,
        W_PROFILE_MOOD_NEIGHBOR * (entryPct(entry) / 100) * light,
      );
    }
    score += bestNeighbor;
  }

  const commune = (item.lieu?.commune || '').trim();
  if (commune && (profile.communes[commune] ?? 0) > 0) {
    score += W_PROFILE_COMMUNE;
  }

  if (lastDayIso && item.dayIso === lastDayIso) {
    score += W_PROFILE_SAME_EVENING;
  }

  if (textScore > 0 && textCoeff > 0) {
    score += textScore * textCoeff;
  }

  return score;
}

function itemMatchesAnyNeighbor(
  fields: ItemFields,
  profile: TasteProfile,
): boolean {
  if (isCinemaFields(fields)) return false;
  const keys = [
    ...Object.entries(profile.moods),
    ...Object.entries(profile.genres),
  ];
  for (const [key, entry] of keys) {
    if (entryWeight(entry) <= 0) continue;
    const targets = CINE_VIVANT_NEIGHBORS[key];
    if (targets && neighborMatch(fields, targets)) return true;
  }
  return false;
}

function shouldApplyVivantQuota(state: AccountTasteState): boolean {
  // Explicit live cat chip → no voisin quota (animation → enfants).
  if (liveCatKeys(state.profile).length > 0) return false;
  const share = cinemaActionShare(state.signalsRecent);
  const fiches = cineFicheCount(state.signalsRecent);
  return share >= 0.5 || fiches >= 2;
}

/**
 * Force 1–2 neighbor vivant slots when the profile is ciné-heavy.
 * Round-robin multi-genre stays inside cine vs SV groups.
 */
function applyVivantQuota(
  scored: ScoredDayItem[],
  fieldsOf: (item: DayItem) => ItemFields,
  state: AccountTasteState,
  genreIntents: string[],
  topN: number,
): ScoredDayItem[] {
  if (scored.length === 0) return [];
  const limit = Math.max(1, Math.min(topN, 12));

  const cine: ScoredDayItem[] = [];
  const sv: ScoredDayItem[] = [];
  const other: ScoredDayItem[] = [];
  for (const entry of scored) {
    const f = fieldsOf(entry.item);
    if (isCinemaFields(f)) cine.push(entry);
    else if (isVivantQuotaFields(f)) sv.push(entry);
    else other.push(entry);
  }

  const cineDiv = diversifyByGenreIntents(cine, fieldsOf, genreIntents, limit);
  const svDiv = diversifyByGenreIntents(sv, fieldsOf, genreIntents, limit);

  const quota = shouldApplyVivantQuota(state);
  const neighborSV = sv.filter((e) =>
    itemMatchesAnyNeighbor(fieldsOf(e.item), state.profile),
  );

  if (quota && neighborSV.length > 0) {
    const reserveN = Math.min(2, neighborSV.length);
    const reserved = diversifyByGenreIntents(
      neighborSV,
      fieldsOf,
      genreIntents,
      reserveN,
    );
    const reservedSet = new Set(reserved);
    const restSource = scored.filter((e) => !reservedSet.has(e));
    const restCine = restSource.filter((e) => isCinemaFields(fieldsOf(e.item)));
    const restSv = restSource.filter((e) => !isCinemaFields(fieldsOf(e.item)));
    const restSlots = Math.max(0, limit - reserved.length);
    const rest: ScoredDayItem[] = [];
    const cineQ = diversifyByGenreIntents(restCine, fieldsOf, genreIntents, restSlots);
    const svQ = diversifyByGenreIntents(restSv, fieldsOf, genreIntents, restSlots);
    // Fill remaining by score, alternating groups so cine cannot wipe SV leftovers.
    const cineByScore = [...cineQ];
    const svByScore = [...svQ];
    const merged = [...cineByScore, ...svByScore].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.dayIso.localeCompare(b.item.dayIso);
    });
    for (const e of merged) {
      if (rest.length >= restSlots) break;
      rest.push(e);
    }
    const out = [...reserved, ...rest];
    // Never fill 10 with cine if a neighbor SV remains.
    const hasCineOnly =
      out.length > 0 && out.every((e) => isCinemaFields(fieldsOf(e.item)));
    if (hasCineOnly) {
      const leftover = neighborSV.find((e) => !out.includes(e));
      if (leftover) {
        out[out.length - 1] = leftover;
      }
    }
    const seen = new Set<ScoredDayItem>();
    const uniq: ScoredDayItem[] = [];
    for (const e of out) {
      if (seen.has(e)) continue;
      seen.add(e);
      uniq.push(e);
    }
    uniq.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.dayIso.localeCompare(b.item.dayIso);
    });
    return uniq.slice(0, limit);
  }

  // No quota: keep existing diversification, still mix cine/SV by score.
  const combined = [...cineDiv, ...svDiv, ...other].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.dayIso.localeCompare(b.item.dayIso);
  });
  const seen = new Set<ScoredDayItem>();
  const out: ScoredDayItem[] = [];
  for (const e of combined) {
    if (out.length >= limit) break;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/** Moods / genres / themes only — leftover cinema cat does not open the block. */
export function profileHasChipWeight(profile?: TasteProfile | null): boolean {
  if (!profile) return false;
  return (
    Object.values(profile.genres).some((e) => entryWeight(e) > 0) ||
    Object.values(profile.moods).some((e) => entryWeight(e) > 0) ||
    Object.values(profile.themes ?? {}).some((e) => entryWeight(e) > 0)
  );
}

export type RecoSlotForm = 'cine' | 'theatre' | 'concert';

const CLOSED_MOODS = new Set([
  'rigolo',
  'tendre',
  'intense',
  'cerveau',
  'sombre',
  'leger',
  'epique',
  'intimiste',
  'festif',
  'contemplatif',
]);
const CLOSED_THEMES = new Set([
  'feminisme',
  'histoire',
  'politique',
  'guerre',
  'ecologie',
  'science',
  'amour',
  'famille',
  'colonial',
  'immigration',
  'lgbt',
  'religion',
  'sport',
  'mer',
  'voyage',
  'amitie',
  'travail',
  'deuil',
  'jeunesse',
]);
const CLOSED_GENRES = new Set([
  'comedie',
  'drame',
  'thriller',
  'horreur',
  'sf',
  'romance',
  'polar',
  'animation',
  'documentaire',
  'biopic',
  'patrimoine',
  'aventure',
  'action',
  'rock',
  'electro',
  'jazz',
  'hiphop',
  'classique',
  'chanson',
  'funk',
  'metal',
  'world',
  'contemporain',
  'classique_theatre',
  'standup',
  'danse',
  'cirque',
]);
const CLOSED_VOCAB = new Set([
  ...CLOSED_MOODS,
  ...CLOSED_THEMES,
  ...CLOSED_GENRES,
]);

const SLOT_WEIGHTS: Record<RecoSlotForm, { mood: number; theme: number; genre: number }> = {
  cine: { mood: 1.0, theme: 1.0, genre: 0.35 },
  theatre: { mood: 1.0, theme: 1.0, genre: 0.35 },
  concert: { mood: 0.5, theme: 0.35, genre: 1.5 },
};

const SLOT_ORDER: RecoSlotForm[] = ['cine', 'theatre', 'concert'];

function splitTagSlugs(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return raw
    .split(/[|,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** cine | theatre | concert only. Festival / expo / enfants are not slots. */
export function slotFormOfItem(item: DayItem): RecoSlotForm | null {
  const ev = item.evenement ?? null;
  const prog = item.kind === 'programme' ? item.programme : null;
  const form = formFromCategorieAndForm(
    ev?.categorie || '',
    prog?.form || ev?.form,
  );
  if (form === 'cine' || form === 'cinema') return 'cine';
  if (form === 'theatre' || form === 'theatre_danse') return 'theatre';
  if (form === 'concert' || form === 'musique') return 'concert';
  const genre = `${prog?.genre || ''} ${ev?.genre || ''}`.toLowerCase();
  if (form === 'festival' && /theatre|humour|standup|danse|cirque/.test(genre)) {
    return 'theatre';
  }
  if (form === 'festival' && /concert|musique|rock|jazz/.test(genre)) {
    return 'concert';
  }
  return null;
}

function itemClosedSlugs(item: DayItem): string[] {
  const ev = item.evenement ?? null;
  const prog = item.kind === 'programme' ? item.programme : null;
  const raw = [
    ...splitTagSlugs(prog?.moods),
    ...splitTagSlugs(ev?.moods),
    ...splitTagSlugs(prog?.genres_mood),
    ...splitTagSlugs(ev?.genres_mood),
    ...splitTagSlugs(prog?.genre),
    ...splitTagSlugs(ev?.genre),
    ...splitTagSlugs(prog?.themes),
    ...splitTagSlugs(ev?.themes),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of raw) {
    if (!CLOSED_VOCAB.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function bucketOfSlug(slug: string): 'mood' | 'theme' | 'genre' | null {
  if (CLOSED_MOODS.has(slug)) return 'mood';
  if (CLOSED_THEMES.has(slug)) return 'theme';
  if (CLOSED_GENRES.has(slug)) return 'genre';
  return null;
}

function userPctForSlug(
  profile: TasteProfile,
  slug: string,
  bucket: 'mood' | 'theme' | 'genre',
): number {
  if (bucket === 'mood') return entryPct(profile.moods[slug]);
  if (bucket === 'theme') return entryPct(profile.themes?.[slug]);
  return entryPct(profile.genres[slug]);
}

/** Σ (user.pct/100)*weight for each closed-vocab slug on the event. 0 if no overlap. */
function scoreOverlap(
  item: DayItem,
  profile: TasteProfile,
  slot: RecoSlotForm,
): number {
  const slugs = itemClosedSlugs(item);
  if (slugs.length === 0) return 0;
  const weights = SLOT_WEIGHTS[slot];
  let score = 0;
  let hits = 0;
  for (const slug of slugs) {
    const bucket = bucketOfSlug(slug);
    if (!bucket) continue;
    const pct = userPctForSlug(profile, slug, bucket);
    if (pct <= 0) continue;
    hits += 1;
    score += (pct / 100) * weights[bucket];
  }
  return hits === 0 ? 0 : score;
}

function pickBestPerSlot(scored: ScoredDayItem[]): ScoredDayItem[] {
  const best = new Map<RecoSlotForm, ScoredDayItem>();
  for (const entry of scored) {
    if (entry.score <= 0) continue;
    const slot = slotFormOfItem(entry.item);
    if (!slot) continue;
    const prev = best.get(slot);
    if (
      !prev ||
      entry.score > prev.score ||
      (entry.score === prev.score &&
        entry.item.dayIso.localeCompare(prev.item.dayIso) < 0)
    ) {
      best.set(slot, entry);
    }
  }
  const out: ScoredDayItem[] = [];
  for (const slot of SLOT_ORDER) {
    const hit = best.get(slot);
    if (hit) out.push(hit);
  }
  return out;
}

function itemClockKey(item: DayItem): string {
  const raw =
    item.kind === 'programme'
      ? (item.programme.heure_debut || '').trim() ||
        (item.evenement?.heure_debut || '').trim()
      : (item.evenement.heure_debut || '').trim();
  if (!/^\d{1,2}:\d{2}/.test(raw)) return '99:99';
  const slice = raw.slice(0, 5);
  return slice.length === 4 ? `0${slice}` : slice;
}

/** Guest / no profile: soonest cine + theatre + concert. No overlap required. */
export function pickSoonestPerSlot(items: DayItem[]): DayItem[] {
  const best = new Map<RecoSlotForm, DayItem>();
  for (const item of items) {
    const slot = slotFormOfItem(item);
    if (!slot) continue;
    const prev = best.get(slot);
    if (!prev) {
      best.set(slot, item);
      continue;
    }
    const day = item.dayIso.localeCompare(prev.dayIso);
    if (
      day < 0 ||
      (day === 0 && itemClockKey(item).localeCompare(itemClockKey(prev)) < 0)
    ) {
      best.set(slot, item);
    }
  }
  const out: DayItem[] = [];
  for (const slot of SLOT_ORDER) {
    const hit = best.get(slot);
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * Top 3 = 1 cine + 1 theatre + 1 concert. Cat chips never filter this.
 * Shared overlap only (moods ∪ genres ∪ themes). Empty slot if 0 overlap.
 * No vivant quota / neighbor fill / 2nd theatre.
 */
export function recommendForProfile(
  items: DayItem[],
  state: AccountTasteState,
  topN = 3,
): ScoredDayItem[] {
  if (items.length === 0) return [];
  const profile = state.profile;
  if (!profileHasChipWeight(profile)) return [];

  const scored: ScoredDayItem[] = [];
  for (const item of items) {
    const slot = slotFormOfItem(item);
    if (!slot) continue;
    const score = scoreOverlap(item, profile, slot);
    if (score <= 0) continue;
    scored.push({ item, score });
  }

  const limit = Math.max(1, topN);
  return pickBestPerSlot(scored).slice(0, limit);
}
