/**
 * « Pour toi » lexical/cultural matcher (no external API/LLM).
 *
 * Strategy: normalize FR tastes → extract phrases then tokens → expand via a
 * synonym/category/genre lexicon → score DayItems with genre/cat/title/lieu/
 * blob weights, IDF dampening for overly common tokens, and a category+genre
 * combo bonus. Prefer strong signals (genre/cat/title ≥ 6); sort by score then
 * sooner dayIso.
 */
import type { DayItem } from '@/lib/types';

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
  'sortir',
  'sortie',
  'sorties',
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

/** Multi-word phrases (normalized, no accents) → expansion keys. Longer first. */
const KNOWN_PHRASES: ReadonlyArray<[string, string[]]> = [
  ['jeune public', ['enfants_famille', 'jeune_public', 'animation_jeune_public']],
  ['arts de rue', ['cirque_arts_rue', 'theatre_danse']],
  ['art de rue', ['cirque_arts_rue', 'theatre_danse']],
  ['musiques du monde', ['musiques_monde_trad', 'musique']],
  ['musique du monde', ['musiques_monde_trad', 'musique']],
  ['hip hop', ['hiphop_rap', 'musique']],
  ['hip-hop', ['hiphop_rap', 'musique']],
  ['stand up', ['humour_standup', 'theatre_danse']],
  ['stand-up', ['humour_standup', 'theatre_danse']],
  ['plein air', ['cinema', 'festival']],
  ['avant premiere', ['festival_avp', 'cinema']],
  ['avant-premiere', ['festival_avp', 'cinema']],
  ['r and b', ['funk_soul_rnb', 'musique']],
  ['r&b', ['funk_soul_rnb', 'musique']],
];

/**
 * Lexicon: normalized token/phrase → category codes + genre slugs (+ raw aliases).
 * Values are matched against item categorie / genre fields and free text.
 */
const LEXICON: Record<string, string[]> = {
  // --- Categories ---
  musique: ['musique'],
  concert: ['musique'],
  concerts: ['musique'],
  live: ['musique'],
  cinema: ['cinema', 'fiction'],
  cine: ['cinema', 'fiction'],
  film: ['cinema', 'fiction'],
  films: ['cinema', 'fiction'],
  seance: ['cinema', 'fiction'],
  seances: ['cinema', 'fiction'],
  theatre: ['theatre_danse'],
  theatres: ['theatre_danse'],
  danse: ['danse', 'theatre_danse'],
  ballet: ['danse', 'theatre_danse'],
  festival: ['festival'],
  festivals: ['festival'],
  expo: ['expo_patrimoine'],
  expos: ['expo_patrimoine'],
  exposition: ['expo_patrimoine'],
  expositions: ['expo_patrimoine'],
  musee: ['expo_patrimoine'],
  musees: ['expo_patrimoine'],
  patrimoine: ['expo_patrimoine', 'patrimoine_retro'],
  visite: ['expo_patrimoine'],
  visites: ['expo_patrimoine'],
  enfants: ['enfants_famille', 'jeune_public'],
  enfant: ['enfants_famille', 'jeune_public'],
  famille: ['enfants_famille', 'jeune_public'],
  familles: ['enfants_famille', 'jeune_public'],
  kids: ['enfants_famille', 'jeune_public'],

  // --- Music genres ---
  jazz: ['jazz_blues', 'musique'],
  blues: ['jazz_blues', 'musique'],
  rock: ['rock_metal_punk', 'musique'],
  metal: ['rock_metal_punk', 'musique'],
  punk: ['rock_metal_punk', 'musique'],
  electro: ['electro_techno', 'musique'],
  electronique: ['electro_techno', 'musique'],
  techno: ['electro_techno', 'musique'],
  house: ['electro_techno', 'musique'],
  club: ['electro_techno', 'musique'],
  dj: ['electro_techno', 'musique'],
  rap: ['hiphop_rap', 'musique'],
  hiphop: ['hiphop_rap', 'musique'],
  funk: ['funk_soul_rnb', 'musique'],
  soul: ['funk_soul_rnb', 'musique'],
  rnb: ['funk_soul_rnb', 'musique'],
  chanson: ['chanson_variete', 'musique'],
  variete: ['chanson_variete', 'musique'],
  francaise: ['chanson_variete', 'musique'],
  classique: ['classique_lyrique', 'musique'],
  opera: ['classique_lyrique', 'musique'],
  lyrique: ['classique_lyrique', 'musique'],
  symphonique: ['classique_lyrique', 'musique'],
  orchestre: ['classique_lyrique', 'musique'],
  monde: ['musiques_monde_trad', 'musique'],
  trad: ['musiques_monde_trad', 'musique'],
  traditionnelle: ['musiques_monde_trad', 'musique'],
  folk: ['musiques_monde_trad', 'musique'],
  guinguette: ['guinguette_sorties', 'musique'],
  guinguettes: ['guinguette_sorties', 'musique'],
  bal: ['guinguette_sorties', 'musique'],

  // --- Theatre / danse / humour ---
  humour: ['humour_standup', 'theatre_danse'],
  humoriste: ['humour_standup', 'theatre_danse'],
  comedie: ['humour_standup', 'theatre_danse'],
  comique: ['humour_standup', 'theatre_danse'],
  standup: ['humour_standup', 'theatre_danse'],
  one: ['humour_standup'],
  man: ['humour_standup'],
  cirque: ['cirque_arts_rue', 'theatre_danse'],
  rue: ['cirque_arts_rue', 'theatre_danse'],
  contemporain: ['theatre_contemporain', 'theatre_danse'],
  contemporaine: ['theatre_contemporain', 'theatre_danse'],
  lecture: ['lecture_poesie', 'theatre_danse'],
  poesie: ['lecture_poesie', 'theatre_danse'],
  poeme: ['lecture_poesie', 'theatre_danse'],

  // --- Cinema genres ---
  fiction: ['fiction', 'cinema'],
  documentaire: ['documentaire', 'cinema'],
  docu: ['documentaire', 'cinema'],
  animation: ['animation_jeune_public', 'cinema'],
  anime: ['animation_jeune_public', 'cinema'],
  retro: ['patrimoine_retro', 'cinema'],
  patrimoniale: ['patrimoine_retro', 'cinema'],
  avp: ['festival_avp', 'cinema'],

  // --- Slug passthrough (if user types them) ---
  jazz_blues: ['jazz_blues', 'musique'],
  rock_metal_punk: ['rock_metal_punk', 'musique'],
  electro_techno: ['electro_techno', 'musique'],
  hiphop_rap: ['hiphop_rap', 'musique'],
  funk_soul_rnb: ['funk_soul_rnb', 'musique'],
  chanson_variete: ['chanson_variete', 'musique'],
  classique_lyrique: ['classique_lyrique', 'musique'],
  musiques_monde_trad: ['musiques_monde_trad', 'musique'],
  guinguette_sorties: ['guinguette_sorties', 'musique'],
  theatre_danse: ['theatre_danse'],
  theatre_contemporain: ['theatre_contemporain', 'theatre_danse'],
  theatre_classique: ['theatre_classique', 'theatre_danse'],
  humour_standup: ['humour_standup', 'theatre_danse'],
  jeune_public: ['jeune_public', 'enfants_famille'],
  cirque_arts_rue: ['cirque_arts_rue', 'theatre_danse'],
  lecture_poesie: ['lecture_poesie', 'theatre_danse'],
  expo_patrimoine: ['expo_patrimoine'],
  enfants_famille: ['enfants_famille', 'jeune_public'],
  animation_jeune_public: ['animation_jeune_public', 'cinema'],
  patrimoine_retro: ['patrimoine_retro', 'cinema'],
  festival_avp: ['festival_avp', 'cinema'],
};

const MAIN_CATEGORIES = new Set([
  'musique',
  'cinema',
  'theatre_danse',
  'festival',
  'expo_patrimoine',
  'enfants_famille',
]);

const GENRE_SLUGS = new Set([
  'classique_lyrique',
  'jazz_blues',
  'rock_metal_punk',
  'electro_techno',
  'hiphop_rap',
  'funk_soul_rnb',
  'chanson_variete',
  'musiques_monde_trad',
  'musique_autre',
  'guinguette_sorties',
  'guinguette_bal',
  'theatre_contemporain',
  'theatre_classique',
  'humour_standup',
  'jeune_public',
  'danse',
  'cirque_arts_rue',
  'lecture_poesie',
  'fiction',
  'documentaire',
  'animation_jeune_public',
  'patrimoine_retro',
  'festival_avp',
  'expo_patrimoine',
  'expo',
  'enfants_famille',
  'atelier_mediation',
  'festival_multi',
]);

const STRONG_SIGNAL = 6;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, ' ')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

export type TasteSignal = {
  /** Original taste token or phrase (normalized). */
  raw: string;
  /** Expanded keys: category codes, genre slugs, and the raw token itself. */
  keys: string[];
};

/** Extract meaningful tokens (≥2 chars, not stopwords), phrases first. */
export function tokenizeTastes(tastes: string): string[] {
  return expandTastes(tastes).map((s) => s.raw);
}

/** Full expansion used by scoring (phrases + unigrams + lexicon). */
export function expandTastes(tastes: string): TasteSignal[] {
  const norm = normalize(tastes).replace(/\s+/g, ' ').trim();
  if (!norm) return [];

  const consumed = new Set<number>(); // char indices covered by phrases
  const signals: TasteSignal[] = [];
  const seenRaw = new Set<string>();

  // 1) Known multi-word phrases
  for (const [phrase, expansion] of KNOWN_PHRASES) {
    let from = 0;
    while (from < norm.length) {
      const idx = norm.indexOf(phrase, from);
      if (idx < 0) break;
      const end = idx + phrase.length;
      const leftOk = idx === 0 || /[^a-z0-9]/.test(norm[idx - 1]!);
      const rightOk = end >= norm.length || /[^a-z0-9]/.test(norm[end]!);
      if (leftOk && rightOk) {
        for (let i = idx; i < end; i++) consumed.add(i);
        if (!seenRaw.has(phrase)) {
          seenRaw.add(phrase);
          signals.push({
            raw: phrase,
            keys: uniqueKeys([phrase, ...expansion, ...(LEXICON[phrase] ?? [])]),
          });
        }
      }
      from = idx + 1;
    }
  }

  // 2) Adjacent bigrams from remaining unigrams (light cultural glue)
  const rawTokens = norm.split(/[^a-z0-9]+/i).filter(Boolean);
  // Rebuild positions for bigram skip when overlapping consumed — approximate via join
  const unigrams: string[] = [];
  {
    let pos = 0;
    for (const t of rawTokens) {
      const idx = norm.indexOf(t, pos);
      const end = idx >= 0 ? idx + t.length : -1;
      let covered = false;
      if (idx >= 0) {
        for (let i = idx; i < end; i++) {
          if (consumed.has(i)) {
            covered = true;
            break;
          }
        }
        pos = end;
      }
      if (covered) continue;
      if (t.length < 2) continue;
      if (FR_STOPWORDS.has(t)) continue;
      unigrams.push(t);
    }
  }

  for (let i = 0; i < unigrams.length - 1; i++) {
    const bigram = `${unigrams[i]} ${unigrams[i + 1]}`;
    const fromLex = LEXICON[bigram];
    const fromPhrase = KNOWN_PHRASES.find(([p]) => p === bigram)?.[1];
    if (!fromLex && !fromPhrase) continue;
    if (seenRaw.has(bigram)) continue;
    seenRaw.add(bigram);
    signals.push({
      raw: bigram,
      keys: uniqueKeys([bigram, ...(fromLex ?? []), ...(fromPhrase ?? [])]),
    });
  }

  // 3) Unigrams
  for (const t of unigrams) {
    if (seenRaw.has(t)) continue;
    seenRaw.add(t);
    signals.push({
      raw: t,
      keys: uniqueKeys([t, ...(LEXICON[t] ?? [])]),
    });
  }

  return signals;
}

function uniqueKeys(keys: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const n = normalize(k).trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function itemGenreFields(item: DayItem): string[] {
  const raw: string[] = [];
  if (item.kind === 'programme') {
    if (item.programme.genre) raw.push(item.programme.genre);
    if (item.evenement?.genre) raw.push(item.evenement.genre);
  } else if (item.evenement.genre) {
    raw.push(item.evenement.genre);
  }
  return uniqueKeys(raw.flatMap((g) => g.split(/[,;/|]+/)));
}

function itemCategoryFields(item: DayItem): string[] {
  const raw: string[] = [];
  if (item.kind === 'programme') {
    if (item.evenement?.categorie) raw.push(item.evenement.categorie);
    if (item.programme.type_item) raw.push(item.programme.type_item);
  } else if (item.evenement.categorie) {
    raw.push(item.evenement.categorie);
  }
  // Map legacy categorie aliases toward main buckets for matching
  const mapped: string[] = [];
  for (const c of raw) {
    const n = normalize(c);
    mapped.push(n);
    const lex = LEXICON[n];
    if (lex) mapped.push(...lex);
    if (n === 'concert' || n === 'guinguette' || n === 'soiree') mapped.push('musique');
    if (n === 'theatre' || n === 'humour' || n === 'cirque' || n === 'danse')
      mapped.push('theatre_danse');
    if (n === 'exposition' || n === 'expo' || n === 'visite' || n === 'conference')
      mapped.push('expo_patrimoine');
    if (n === 'atelier') mapped.push('enfants_famille');
  }
  return uniqueKeys(mapped);
}

function titleText(item: DayItem): string {
  if (item.kind === 'programme') {
    return normalize(
      [
        item.programme.nom_item,
        item.evenement?.titre ?? '',
        item.evenement?.categorie ?? '',
        item.programme.genre,
        item.evenement?.genre ?? '',
        item.programme.type_item,
      ].join(' '),
    );
  }
  return normalize(
    [item.evenement.titre, item.evenement.categorie, item.evenement.genre].join(
      ' ',
    ),
  );
}

function lieuText(item: DayItem): string {
  return normalize(
    [item.lieu?.nom ?? '', item.lieu?.commune ?? ''].join(' '),
  );
}

function blobText(item: DayItem): string {
  const parts: string[] = [];
  if (item.kind === 'programme') {
    if (item.programme.notes) parts.push(item.programme.notes);
    if (item.programme.description_item) parts.push(item.programme.description_item);
    if (item.evenement?.description_courte)
      parts.push(item.evenement.description_courte);
    if (item.evenement?.description_longue)
      parts.push(item.evenement.description_longue);
    if (item.evenement?.tags) parts.push(item.evenement.tags);
    if (item.evenement?.casting) parts.push(item.evenement.casting);
  } else {
    if (item.evenement.description_courte)
      parts.push(item.evenement.description_courte);
    if (item.evenement.description_longue)
      parts.push(item.evenement.description_longue);
    if (item.evenement.tags) parts.push(item.evenement.tags);
    if (item.evenement.casting) parts.push(item.evenement.casting);
  }
  if (item.lieu?.type) parts.push(item.lieu.type);
  return normalize(parts.join(' '));
}

type ScoreBreakdown = {
  score: number;
  strong: number;
  hadGenre: boolean;
  hadCat: boolean;
};

function scoreItemAgainstSignals(
  item: DayItem,
  signals: TasteSignal[],
  idfByRaw: Map<string, number>,
): ScoreBreakdown {
  const genres = new Set(itemGenreFields(item));
  const cats = new Set(itemCategoryFields(item));
  const title = titleText(item);
  const lieu = lieuText(item);
  const blob = blobText(item);

  let score = 0;
  let strong = 0;
  let hadGenre = false;
  let hadCat = false;

  for (const sig of signals) {
    const damp = idfByRaw.get(sig.raw) ?? 1;
    let contrib = 0;
    let localStrong = 0;
    let localGenre = false;
    let localCat = false;

    for (const key of sig.keys) {
      if (GENRE_SLUGS.has(key) && genres.has(key)) {
        contrib += 15;
        localStrong += 15;
        localGenre = true;
        continue;
      }
      if (
        (MAIN_CATEGORIES.has(key) || key === 'concert') &&
        (cats.has(key) ||
          (key === 'musique' && (cats.has('concert') || cats.has('musique'))) ||
          (key === 'expo_patrimoine' &&
            (cats.has('expo') || cats.has('exposition') || cats.has('expo_patrimoine'))))
      ) {
        contrib += 10;
        localStrong += 10;
        localCat = true;
        continue;
      }
      // Title / name / category / genre text contains token/phrase
      if (title.includes(key)) {
        contrib += 6;
        localStrong += 6;
        continue;
      }
      if (lieu.includes(key)) {
        contrib += 3;
        continue;
      }
      if (blob.includes(key)) {
        contrib += 1;
        continue;
      }
      // Light prefix match (≥4 char) on title only
      if (key.length >= 4) {
        const words = title.split(/[^a-z0-9]+/).filter(Boolean);
        if (words.some((w) => w.startsWith(key) || key.startsWith(w) && w.length >= 4)) {
          contrib += 2;
        }
      }
    }

    if (localGenre && localCat) {
      contrib += 4;
      localStrong += 4;
    }

    if (localGenre) hadGenre = true;
    if (localCat) hadCat = true;

    score += contrib * damp;
    strong += localStrong * damp;
  }

  // Item-level combo bonus if any mapped cat + genre hit across signals
  if (hadGenre && hadCat) {
    // already awarded per-signal when both on same signal; add a light item bonus
    // only if we never got the per-signal +4 (multiple signals split cat/genre)
    // Skip extra to avoid double-counting when both on same signal.
  }

  return { score, strong, hadGenre, hadCat };
}

/** Fraction of candidates a raw token matches (>35% → dampen). */
function computeIdfDampening(
  items: DayItem[],
  signals: TasteSignal[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (items.length === 0) return out;
  const threshold = 0.35;

  for (const sig of signals) {
    let hits = 0;
    for (const item of items) {
      const title = titleText(item);
      const lieu = lieuText(item);
      const blob = blobText(item);
      const genres = itemGenreFields(item);
      const cats = itemCategoryFields(item);
      const hay = `${title} ${lieu} ${blob} ${genres.join(' ')} ${cats.join(' ')}`;
      const matched = sig.keys.some((k) => hay.includes(k));
      if (matched) hits++;
    }
    const frac = hits / items.length;
    out.set(sig.raw, frac > threshold ? 0.25 : 1);
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
  if (signals.length === 0) return [];

  const idfByRaw = computeIdfDampening(items, signals);
  const limit = Math.max(1, Math.min(topN, 12));

  const scored: Array<ScoredDayItem & { strong: number }> = [];
  for (const item of items) {
    const { score, strong } = scoreItemAgainstSignals(item, signals, idfByRaw);
    if (score > 0) scored.push({ item, score, strong });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.dayIso.localeCompare(b.item.dayIso);
  });

  const strongOnes = scored.filter((s) => s.strong >= STRONG_SIGNAL);
  const pool = strongOnes.length > 0 ? strongOnes : scored;

  return pool.slice(0, limit).map(({ item, score }) => ({ item, score }));
}
