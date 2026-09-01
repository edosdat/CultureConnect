/**
 * Search omnibox → existing QUAND / QUOI chips.
 * Client-side only. No LLM. Title leftover keeps current title search.
 */

import type { MainCategoryId } from './categories';
import { normalizePhrase } from './phraseTags';
import { addDaysIso, parisParts, type TimeScopeId } from './timeScope';

export type SearchChipParse = {
  /** Date chip; null = no date intent (leave / reset search-driven scope). */
  scope: TimeScopeId | null;
  /** YYYY-MM-DD when scope is `date`. */
  selectedDate: string | null;
  /** QUOI chips; empty = no category intent. Multi is OK. */
  categories: MainCategoryId[];
  /** Leftover for title search. Empty when the phrase was only chips. */
  titleQuery: string;
};

const GLUE = new Set([
  'un',
  'une',
  'des',
  'le',
  'la',
  'les',
  'du',
  'de',
  'd',
  'l',
  'au',
  'aux',
  'a',
  'et',
  'ou',
  'pour',
  'par',
  'avec',
  'en',
  'dans',
  'sur',
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
  'je',
  'tu',
  'on',
  'nous',
  'vous',
  'veux',
  'voudrais',
  'cherche',
  'voir',
  'vais',
  'va',
  'aller',
  'faire',
  'truc',
  'chose',
  'quelque',
]);

const CATEGORY_WORDS: Record<string, MainCategoryId> = {
  film: 'cinema',
  films: 'cinema',
  cine: 'cinema',
  cinema: 'cinema',
  seance: 'cinema',
  seances: 'cinema',
  concert: 'musique',
  concerts: 'musique',
  musique: 'musique',
  musiques: 'musique',
  live: 'musique',
  gig: 'musique',
  opera: 'musique',
  theatre: 'theatre_danse',
  piece: 'theatre_danse',
  pieces: 'theatre_danse',
  standup: 'theatre_danse',
  humour: 'theatre_danse',
  danse: 'theatre_danse',
  cirque: 'theatre_danse',
  festival: 'festival',
  festivals: 'festival',
  festoche: 'festival',
  expo: 'expo_patrimoine',
  expos: 'expo_patrimoine',
  exposition: 'expo_patrimoine',
  expositions: 'expo_patrimoine',
  musee: 'expo_patrimoine',
  musees: 'expo_patrimoine',
  patrimoine: 'expo_patrimoine',
  visite: 'expo_patrimoine',
  visites: 'expo_patrimoine',
  enfant: 'enfants_famille',
  enfants: 'enfants_famille',
  famille: 'enfants_famille',
  familles: 'enfants_famille',
  gosse: 'enfants_famille',
  gosses: 'enfants_famille',
  kid: 'enfants_famille',
  kids: 'enfants_famille',
};

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

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

const MONTH_ALT = Object.keys(MONTHS).join('|');

function hasPhrase(norm: string, phrase: string): boolean {
  const p = normalizePhrase(phrase);
  if (!p) return false;
  const re = new RegExp(`(?:^|\\s)${p.replace(/\s+/g, '\\s+')}(?:\\s|$)`);
  return re.test(norm);
}

function nextWeekdayIso(todayIso: string, todayWd: number, targetWd: number): string {
  const delta = (targetWd - todayWd + 7) % 7;
  return addDaysIso(todayIso, delta);
}

function isoFromYmd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  const dt = new Date(utc);
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function upcomingMonthDay(year: number, month: number, day: number, todayIso: string): string | null {
  const thisYear = isoFromYmd(year, month, day);
  if (thisYear && thisYear >= todayIso) return thisYear;
  return isoFromYmd(year + 1, month, day);
}

type DateHit = {
  scope: TimeScopeId;
  selectedDate: string | null;
  phrases: string[];
};

function datePhrasesPresent(norm: string, raw: string): string[] {
  const out: string[] = [];
  if (hasPhrase(norm, 'ce soir')) out.push('ce soir');
  else if (hasPhrase(norm, 'soir')) out.push('soir');
  if (hasPhrase(norm, 'aujourdhui') || hasPhrase(norm, 'aujourd hui')) {
    out.push('aujourdhui', "aujourd'hui", 'aujourd hui');
  }
  if (hasPhrase(norm, 'ce jour')) out.push('ce jour');
  if (hasPhrase(norm, 'ce week end')) out.push('ce week end');
  if (hasPhrase(norm, 'ce weekend')) out.push('ce weekend');
  if (hasPhrase(norm, 'ce we')) out.push('ce we');
  if (hasPhrase(norm, 'week end')) out.push('week end');
  if (hasPhrase(norm, 'weekend')) out.push('weekend');
  if (hasPhrase(norm, 'cette semaine')) out.push('cette semaine');
  else if (hasPhrase(norm, 'semaine')) out.push('semaine');
  if (hasPhrase(norm, 'demain')) out.push('demain');
  for (const name of Object.keys(WEEKDAYS)) {
    if (hasPhrase(norm, `ce ${name}`)) out.push(`ce ${name}`);
    if (hasPhrase(norm, name)) out.push(name);
  }
  const named = raw.match(
    new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_ALT})(?:\\s+(\\d{4}))?\\b`, 'i'),
  );
  if (named) out.push(named[0]);
  const slash = raw.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/);
  if (slash) out.push(slash[0]);
  return out;
}

function extractCalendarDate(
  raw: string,
  year: number,
  todayIso: string,
): { iso: string; phrase: string } | null {
  const named = raw.match(
    new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_ALT})(?:\\s+(\\d{4}))?\\b`, 'i'),
  );
  if (named) {
    const d = Number(named[1]);
    const m = MONTHS[normalizePhrase(named[2]!)];
    const y = named[3] ? Number(named[3]) : year;
    if (m) {
      const dateIso = named[3]
        ? isoFromYmd(y, m, d)
        : upcomingMonthDay(year, m, d, todayIso);
      if (dateIso) return { iso: dateIso, phrase: named[0] };
    }
  }
  const slash = raw.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    let y = year;
    if (slash[3]) {
      y = Number(slash[3]);
      if (y < 100) y += 2000;
    }
    const dateIso = slash[3]
      ? isoFromYmd(y, m, d)
      : upcomingMonthDay(year, m, d, todayIso);
    if (dateIso) return { iso: dateIso, phrase: slash[0] };
  }
  return null;
}

/**
 * One QUAND chip, most specific first:
 * Ce soir > Aujourd'hui > Ce WE > Cette semaine > Date…
 */
function extractDate(norm: string, raw: string, now: Date): DateHit | null {
  const { iso, weekday, year } = parisParts(now);
  const extra = datePhrasesPresent(norm, raw);

  if (hasPhrase(norm, 'ce soir') || hasPhrase(norm, 'soir')) {
    return { scope: 'soir', selectedDate: iso, phrases: extra };
  }
  if (
    hasPhrase(norm, 'aujourdhui') ||
    hasPhrase(norm, 'aujourd hui') ||
    hasPhrase(norm, 'ce jour')
  ) {
    return { scope: 'aujourdhui', selectedDate: iso, phrases: extra };
  }
  if (
    hasPhrase(norm, 'ce week end') ||
    hasPhrase(norm, 'ce weekend') ||
    hasPhrase(norm, 'ce we') ||
    hasPhrase(norm, 'week end') ||
    hasPhrase(norm, 'weekend')
  ) {
    return { scope: 'weekend', selectedDate: null, phrases: extra };
  }
  if (hasPhrase(norm, 'cette semaine') || hasPhrase(norm, 'semaine')) {
    return { scope: 'semaine', selectedDate: null, phrases: extra };
  }

  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (hasPhrase(norm, name) || hasPhrase(norm, `ce ${name}`)) {
      return {
        scope: 'date',
        selectedDate: nextWeekdayIso(iso, weekday, wd),
        phrases: extra,
      };
    }
  }
  if (hasPhrase(norm, 'demain')) {
    return { scope: 'date', selectedDate: addDaysIso(iso, 1), phrases: extra };
  }
  const cal = extractCalendarDate(raw, year, iso);
  if (cal) {
    return { scope: 'date', selectedDate: cal.iso, phrases: extra };
  }
  return null;
}

function extractCategories(norm: string): { categories: MainCategoryId[]; words: string[] } {
  const tokens = norm.match(/[a-z0-9]+/g) ?? [];
  const words: string[] = [];
  const categories: MainCategoryId[] = [];
  const seen = new Set<MainCategoryId>();
  for (const t of tokens) {
    const cat = CATEGORY_WORDS[t];
    if (!cat) continue;
    words.push(t);
    if (seen.has(cat)) continue;
    seen.add(cat);
    categories.push(cat);
  }
  return { categories, words };
}

function stripConsumed(norm: string, phrases: string[]): string {
  let left = ` ${norm} `;
  const sorted = [...phrases]
    .map((p) => normalizePhrase(p))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    const re = new RegExp(`\\s${p.replace(/\s+/g, '\\s+')}\\s`, 'g');
    left = left.replace(re, ' ');
  }
  return left.replace(/\s+/g, ' ').trim();
}

export function parseSearchChips(query: string, now = new Date()): SearchChipParse {
  const raw = (query || '').trim();
  if (!raw) {
    return { scope: null, selectedDate: null, categories: [], titleQuery: '' };
  }
  const norm = normalizePhrase(raw);
  const dateHit = extractDate(norm, raw, now);
  const catHit = extractCategories(norm);

  if (!dateHit && catHit.categories.length === 0) {
    return { scope: null, selectedDate: null, categories: [], titleQuery: raw };
  }

  const consumed = [...(dateHit?.phrases ?? []), ...catHit.words];
  const leftover = stripConsumed(norm, consumed);
  const titleTokens = leftover.split(/\s+/).filter((t) => t && !GLUE.has(t));

  return {
    scope: dateHit?.scope ?? null,
    selectedDate: dateHit?.selectedDate ?? null,
    categories: catHit.categories,
    titleQuery: titleTokens.join(' '),
  };
}

