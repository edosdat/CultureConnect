/**
 * Phrase utilisateur → tags.
 * Pipeline : normalize → titre/artiste (sous-chaîne) → règles → IA.
 * Module pur — pas de réseau ici. Voir briefs/connexion-phrase-vers-tags.md
 */

import { addDaysIso, parisParts } from './timeScope';

export type PhraseForm =
  | 'cine'
  | 'theatre'
  | 'concert'
  | 'festival'
  | 'enfants'
  | 'autre';

/** Closed catalog — do not invent mood strings. */
export const CATALOG_MOODS = [
  'rigolo',
  'tendre',
  'intense',
  'angoissant',
  'epique',
  'brutal',
  'sortie',
  'festif',
  'cerveau',
  'intimiste',
  'absurde',
  'critique',
  'sombre',
  'poetique',
  'dansant',
  'contemplatif',
  'leger',
] as const;

export type PhraseMood = (typeof CATALOG_MOODS)[number];

export type PhraseTags = {
  form?: PhraseForm;
  moods: PhraseMood[];
  genres: string[];
  themes: string[];
  entities: string[];
  date_from?: string;
  date_to?: string;
  source: 'rules' | 'ai';
};

const FORMS: PhraseForm[] = [
  'cine',
  'theatre',
  'concert',
  'festival',
  'enfants',
  'autre',
];
const MOODS: readonly PhraseMood[] = CATALOG_MOODS;

const STOPWORDS = new Set([
  'je',
  'tu',
  'il',
  'elle',
  'on',
  'nous',
  'vous',
  'ils',
  'elles',
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'de',
  'du',
  'au',
  'aux',
  'a',
  'et',
  'ou',
  'mais',
  'pour',
  'par',
  'avec',
  'sans',
  'en',
  'dans',
  'sur',
  'sous',
  'ce',
  'cet',
  'cette',
  'ces',
  'mon',
  'ma',
  'mes',
  'ton',
  'ta',
  'tes',
  'son',
  'sa',
  'ses',
  'qui',
  'que',
  'quoi',
  'dont',
  'ne',
  'pas',
  'plus',
  'moins',
  'tres',
  'bien',
  'tout',
  'tous',
  'toute',
  'toutes',
  'me',
  'te',
  'se',
  'y',
  'est',
  'suis',
  'es',
  'sont',
  'ete',
  'etre',
  'avoir',
  'ai',
  'as',
  'ont',
  'veux',
  'vouloir',
  'cherche',
  'chercher',
  'quelque',
  'truc',
  'chose',
  'faire',
  'fais',
  'fait',
  'va',
  'vais',
  'aller',
  'un',
  'd',
  'l',
  'n',
  's',
  'qu',
]);

const FORM_PHRASES: Array<{ phrase: string; form: PhraseForm }> = [
  { phrase: 'live musical', form: 'concert' },
  { phrase: 'stand up', form: 'theatre' },
];

const FORM_WORDS: Record<string, PhraseForm> = {
  film: 'cine',
  films: 'cine',
  cine: 'cine',
  cinema: 'cine',
  seance: 'cine',
  seances: 'cine',
  theatre: 'theatre',
  piece: 'theatre',
  standup: 'theatre',
  concert: 'concert',
  concerts: 'concert',
  gig: 'concert',
  musique: 'concert',
  musiques: 'concert',
  live: 'concert',
  festival: 'festival',
  festoche: 'festival',
  enfant: 'enfants',
  enfants: 'enfants',
  famille: 'enfants',
  familles: 'enfants',
  gosse: 'enfants',
  gosses: 'enfants',
  kid: 'enfants',
  kids: 'enfants',
};

const MOOD_PHRASES: Array<{ phrase: string; mood: PhraseMood }> = [
  { phrase: 'one man', mood: 'rigolo' },
  { phrase: 'one woman', mood: 'rigolo' },
  { phrase: 'stand up', mood: 'rigolo' },
  { phrase: 'feel good', mood: 'tendre' },
  { phrase: 'entre potes', mood: 'sortie' },
  { phrase: 'envie de danser', mood: 'dansant' },
  { phrase: 'un truc intimiste', mood: 'intimiste' },
  { phrase: 'truc intimiste', mood: 'intimiste' },
];

const MOOD_WORDS: Record<string, PhraseMood> = {
  rire: 'rigolo',
  rigolo: 'rigolo',
  rigolade: 'rigolo',
  mdr: 'rigolo',
  lol: 'rigolo',
  ptdr: 'rigolo',
  drole: 'rigolo',
  marrant: 'rigolo',
  marrante: 'rigolo',
  humour: 'rigolo',
  comique: 'rigolo',
  comedie: 'rigolo',
  standup: 'rigolo',
  sketch: 'rigolo',
  tendre: 'tendre',
  doux: 'tendre',
  douce: 'tendre',
  romantique: 'tendre',
  feelgood: 'tendre',
  intense: 'intense',
  tension: 'intense',
  thriller: 'intense',
  metal: 'intense',
  techno: 'intense',
  angoissant: 'angoissant',
  angoisse: 'angoissant',
  horreur: 'angoissant',
  epouvante: 'angoissant',
  peur: 'angoissant',
  epique: 'epique',
  epic: 'epique',
  grandiose: 'epique',
  brutal: 'brutal',
  violent: 'brutal',
  violence: 'brutal',
  sortie: 'sortie',
  sorties: 'sortie',
  verre: 'sortie',
  guinguette: 'sortie',
  bal: 'sortie',
  festif: 'festif',
  festive: 'festif',
  fete: 'festif',
  cerveau: 'cerveau',
  intellect: 'cerveau',
  intellectuel: 'cerveau',
  reflexion: 'cerveau',
  philosophique: 'cerveau',
  intimiste: 'intimiste',
  intimite: 'intimiste',
  absurde: 'absurde',
  kafka: 'absurde',
  ubuesque: 'absurde',
  critique: 'critique',
  sombre: 'sombre',
  dark: 'sombre',
  poetique: 'poetique',
  poesie: 'poetique',
  dansant: 'dansant',
  dansante: 'dansant',
  danser: 'dansant',
  dancing: 'dansant',
  contemplatif: 'contemplatif',
  contemplative: 'contemplatif',
  contempler: 'contemplatif',
  calme: 'contemplatif',
  leger: 'leger',
  legere: 'leger',
};

/** Comedy tokens also feed genre humour (rire → rigolo + humour). */
const RIGOLO_ALSO_HUMOUR = new Set([
  'humour',
  'comique',
  'comedie',
  'standup',
]);

const GENRE_PHRASES: Array<{ phrase: string; genre: string }> = [
  { phrase: 'nu soul', genre: 'funk' },
  { phrase: 'stand up', genre: 'humour' },
  { phrase: 'hip hop', genre: 'hiphop_rap' },
];

const GENRE_WORDS: Record<string, string> = {
  funk: 'funk',
  nusoul: 'funk',
  humour: 'humour',
  standup: 'humour',
  comedie: 'humour',
  piano: 'piano',
  techno: 'techno',
  electro: 'techno',
  jazz: 'jazz_blues',
  blues: 'jazz_blues',
  rock: 'rock_metal_punk',
  metal: 'rock_metal_punk',
  punk: 'rock_metal_punk',
  rap: 'hiphop_rap',
  hiphop: 'hiphop_rap',
  classique: 'classique_lyrique',
  opera: 'classique_lyrique',
  lyrique: 'classique_lyrique',
};

export const THEME_SLUGS = [
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
] as const;

const THEME_WORDS: Record<string, string> = {
  feminisme: 'feminisme',
  feministe: 'feminisme',
  feministes: 'feminisme',
  histoire: 'histoire',
  historique: 'histoire',
  historiques: 'histoire',
  politique: 'politique',
  politiques: 'politique',
  guerre: 'guerre',
  guerres: 'guerre',
  conflit: 'guerre',
  ecologie: 'ecologie',
  climat: 'ecologie',
  ecologique: 'ecologie',
  science: 'science',
  sciences: 'science',
  scientifique: 'science',
  amour: 'amour',
  amours: 'amour',
  famille: 'famille',
  familial: 'famille',
  colonial: 'colonial',
  colonialisme: 'colonial',
  decolonial: 'colonial',
  immigration: 'immigration',
  exil: 'immigration',
  migrant: 'immigration',
  migrants: 'immigration',
  lgbt: 'lgbt',
  queer: 'lgbt',
  gay: 'lgbt',
  lesbienne: 'lgbt',
  religion: 'religion',
  religieux: 'religion',
  foi: 'religion',
  sport: 'sport',
  football: 'sport',
  rugby: 'sport',
  mer: 'mer',
  ocean: 'mer',
  marin: 'mer',
  voyage: 'voyage',
  voyages: 'voyage',
};

/** Longest first. Canon is what we store in entities[]. */
const ENTITY_PHRASES: Array<{ phrase: string; canon: string }> = [
  { phrase: 'general de gaulle', canon: 'de gaulle' },
  { phrase: 'charles de gaulle', canon: 'de gaulle' },
  { phrase: 'alice zeniter', canon: 'zeniter' },
  { phrase: 'fabien olicard', canon: 'olicard' },
  { phrase: 'les clotildes', canon: 'clotildes' },
  { phrase: 'chela bom', canon: 'chelabom' },
  { phrase: 'de gaulle', canon: 'de gaulle' },
  { phrase: 'degaulle', canon: 'de gaulle' },
  { phrase: 'zeniter', canon: 'zeniter' },
  { phrase: 'olicard', canon: 'olicard' },
  { phrase: 'clotildes', canon: 'clotildes' },
  { phrase: 'chelabom', canon: 'chelabom' },
];

const MONTHS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  fevrier: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’‘`]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function phraseTokens(norm: string): string[] {
  return norm.match(/[a-z0-9]+/g) ?? [];
}

function lastDayOfMonth(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

function mondayOfWeek(iso: string, weekday: number): string {
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDaysIso(iso, delta);
}

function hasPhrase(norm: string, phrase: string): boolean {
  const p = normalizePhrase(phrase);
  if (!p) return false;
  const re = new RegExp(`(?:^|\\s)${p.replace(/\s+/g, '\\s+')}(?:\\s|$)`);
  return re.test(norm);
}

function unique<T>(xs: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const x of xs) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function extractDates(
  norm: string,
  now: Date,
): { date_from?: string; date_to?: string } {
  const { iso, weekday, year, month } = parisParts(now);

  if (hasPhrase(norm, 'la semaine prochaine') || hasPhrase(norm, 'semaine prochaine')) {
    const thisMon = mondayOfWeek(iso, weekday);
    const nextMon = addDaysIso(thisMon, 7);
    return { date_from: nextMon, date_to: addDaysIso(nextMon, 6) };
  }
  if (
    hasPhrase(norm, 'ce week end') ||
    hasPhrase(norm, 'ce weekend') ||
    hasPhrase(norm, 'ce we')
  ) {
    if (weekday === 0) return { date_from: iso, date_to: iso };
    const sat = addDaysIso(iso, 6 - weekday);
    return { date_from: sat, date_to: addDaysIso(sat, 1) };
  }
  if (hasPhrase(norm, 'cette semaine')) {
    const mon = mondayOfWeek(iso, weekday);
    const start = mon > iso ? mon : iso;
    const sun = weekday === 0 ? iso : addDaysIso(iso, 7 - weekday);
    return { date_from: start, date_to: sun };
  }
  if (hasPhrase(norm, 'ce mois ci') || hasPhrase(norm, 'ce mois')) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    return { date_from: from, date_to: lastDayOfMonth(year, month) };
  }
  if (hasPhrase(norm, 'aujourdhui') || hasPhrase(norm, 'aujourd hui') || hasPhrase(norm, 'ce jour')) {
    return { date_from: iso, date_to: iso };
  }
  if (hasPhrase(norm, 'ce soir')) {
    return { date_from: iso, date_to: iso };
  }
  if (hasPhrase(norm, 'demain')) {
    const d = addDaysIso(iso, 1);
    return { date_from: d, date_to: d };
  }

  const monthMatch = norm.match(
    /\ben\s+(janvier|janv|fevrier|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\b/,
  );
  if (monthMatch) {
    const m = MONTHS[monthMatch[1]!]!;
    let y = year;
    if (m < month) y += 1;
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    return { date_from: from, date_to: lastDayOfMonth(y, m) };
  }
  return {};
}

function extractForms(norm: string, words: string[]): PhraseForm[] {
  const found: PhraseForm[] = [];
  for (const { phrase, form } of FORM_PHRASES) {
    if (hasPhrase(norm, phrase)) found.push(form);
  }
  for (const w of words) {
    const f = FORM_WORDS[w];
    if (f) found.push(f);
  }
  return unique(found);
}

function resolveForm(forms: PhraseForm[]): PhraseForm | undefined {
  if (forms.length === 0) return undefined;
  if (forms.length === 1) return forms[0];
  const vivant = forms.filter((f) => f !== 'cine');
  if (forms.includes('cine') && vivant.length > 0) return vivant[0];
  return forms[0];
}

function extractMoods(norm: string, words: string[]): PhraseMood[] {
  const found: PhraseMood[] = [];
  for (const { phrase, mood } of MOOD_PHRASES) {
    if (hasPhrase(norm, phrase)) found.push(mood);
  }
  for (const w of words) {
    const m = MOOD_WORDS[w];
    if (m) found.push(m);
  }
  return unique(found);
}

function extractGenres(norm: string, words: string[]): string[] {
  const found: string[] = [];
  for (const { phrase, genre } of GENRE_PHRASES) {
    if (hasPhrase(norm, phrase)) found.push(genre);
  }
  for (const w of words) {
    const g = GENRE_WORDS[w];
    if (g) found.push(g);
    if (RIGOLO_ALSO_HUMOUR.has(w)) found.push('humour');
    if (w === 'animation' || w === 'animations') {
      found.push('animation');
      found.push('animation_jeune_public');
    }
  }
  return unique(found);
}

function extractThemes(words: string[]): string[] {
  const found: string[] = [];
  for (const w of words) {
    const t = THEME_WORDS[w];
    if (t) found.push(t);
  }
  return unique(found);
}

function extractEntities(norm: string): string[] {
  const found: string[] = [];
  for (const { phrase, canon } of ENTITY_PHRASES) {
    if (hasPhrase(norm, phrase)) found.push(canon);
  }
  return unique(found);
}

export function emptyPhraseTags(source: 'rules' | 'ai' = 'rules'): PhraseTags {
  return { moods: [], genres: [], themes: [], entities: [], source };
}

export function hasPhraseSignal(tags: PhraseTags): boolean {
  return Boolean(
    tags.form ||
      tags.moods.length > 0 ||
      tags.genres.length > 0 ||
      (tags.themes && tags.themes.length > 0) ||
      (tags.entities && tags.entities.length > 0),
  );
}

/** No form/moods/genres/themes/entities after rules+AI → title-search the raw phrase. */
export function phraseUsesTitleQ(tags: PhraseTags | null | undefined): boolean {
  return !tags || !hasPhraseSignal(tags);
}

const MIN_TITLE_Q = 3;

/** True if the normalized phrase is a substring of a titre / nom_item / artiste. */
export function phraseMatchesTitleCatalog(
  phrase: string,
  titles: readonly string[],
): boolean {
  const q = normalizePhrase(phrase);
  if (q.length < MIN_TITLE_Q) return false;
  return titles.some((t) => normalizePhrase(t).includes(q));
}

/** Étage 1 — dates, entités, form, thèmes, moods, genres. Dates seules ≠ signal. */
export function parsePhraseRules(phrase: string, now = new Date()): PhraseTags {
  const raw = (phrase || '').trim();
  if (!raw) return emptyPhraseTags('rules');
  const norm = normalizePhrase(raw);
  const allTokens = phraseTokens(norm);
  const words = allTokens.filter((t) => !STOPWORDS.has(t));

  const dates = extractDates(norm, now);
  const entities = extractEntities(norm);
  const forms = extractForms(norm, words);
  const form = resolveForm(forms);
  const themes = extractThemes(words);
  const moods = extractMoods(norm, words);
  const genres = extractGenres(norm, words);

  const out: PhraseTags = {
    moods,
    genres,
    themes,
    entities,
    source: 'rules',
  };
  if (form) out.form = form;
  if (dates.date_from) out.date_from = dates.date_from;
  if (dates.date_to) out.date_to = dates.date_to;
  return out;
}

export function themeAliases(slug: string): string[] {
  const s = slug.trim().toLowerCase();
  const out = [s];
  for (const [alias, canon] of Object.entries(THEME_WORDS)) {
    if (canon === s) out.push(alias);
  }
  return unique(out);
}

export function entityAliases(canon: string): string[] {
  const c = normalizePhrase(canon);
  const out = [c];
  if (c.includes(' ')) out.push(c.replace(/ /g, '_'));
  if (c.includes('_')) out.push(c.replace(/_/g, ' '));
  for (const { phrase, canon: can } of ENTITY_PHRASES) {
    if (can === c || normalizePhrase(can) === c) out.push(phrase);
  }
  return unique(out);
}

export function parsePhrase(phrase: string, now = new Date()): PhraseTags {
  return parsePhraseRules(phrase, now);
}

const ALLOWED_GENRES = new Set([
  'funk',
  'humour',
  'piano',
  'techno',
  'electro_techno',
  'jazz_blues',
  'rock_metal_punk',
  'hiphop_rap',
  'classique_lyrique',
  'funk_soul_rnb',
  'humour_standup',
  'chanson_variete',
  'musiques_monde_trad',
  'musique_autre',
  'guinguette_sorties',
  'theatre_contemporain',
  'theatre_classique',
  'jeune_public',
  'danse',
  'cirque_arts_rue',
  'lecture_poesie',
  'festival_multi',
  'fiction',
  'documentaire',
  'animation_jeune_public',
  'patrimoine_retro',
  'festival_avp',
  'expo_patrimoine',
  'enfants_famille',
]);

function asForm(v: unknown): PhraseForm | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  return (FORMS as string[]).includes(s) ? (s as PhraseForm) : undefined;
}

function asMoods(v: unknown): PhraseMood[] {
  if (!Array.isArray(v)) return [];
  const out: PhraseMood[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const s = x.trim().toLowerCase();
    if ((MOODS as string[]).includes(s)) out.push(s as PhraseMood);
  }
  return unique(out);
}

function asGenres(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const s = x.trim().toLowerCase();
    if (!s || s.length > 40) continue;
    if (ALLOWED_GENRES.has(s) || /^[a-z0-9_]+$/.test(s)) out.push(s);
  }
  return unique(out).slice(0, 4);
}

function asDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/** Validate / coerce an AI JSON object. Invalid → empty arrays. */
export function sanitizeAiTags(
  raw: unknown,
  dates?: { date_from?: string; date_to?: string },
): PhraseTags {
  if (!raw || typeof raw !== 'object') {
    return { ...emptyPhraseTags('ai'), ...dates };
  }
  const o = raw as Record<string, unknown>;
  const form = asForm(o.form);
  const moods = asMoods(o.moods);
  const genres = asGenres(o.genres);
  const themes = asThemes(o.themes);
  const entities = asEntities(o.entities);
  const date_from = asDate(o.date_from) ?? dates?.date_from;
  const date_to = asDate(o.date_to) ?? dates?.date_to;
  const out: PhraseTags = { moods, genres, themes, entities, source: 'ai' };
  if (form) out.form = form;
  if (date_from) out.date_from = date_from;
  if (date_to) out.date_to = date_to;
  return out;
}

function asThemes(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const allowed = new Set<string>(THEME_SLUGS);
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const s = normalizePhrase(x);
    if (allowed.has(s)) out.push(s);
    else if (THEME_WORDS[s]) out.push(THEME_WORDS[s]);
  }
  return unique(out);
}

function asEntities(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const s = normalizePhrase(x);
    if (!s || s.length > 40) continue;
    const known = ENTITY_PHRASES.find(
      (e) => e.phrase === s || e.canon === s,
    );
    out.push(known ? known.canon : s);
  }
  return unique(out).slice(0, 3);
}
