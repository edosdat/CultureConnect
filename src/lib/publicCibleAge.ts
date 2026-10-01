/**
 * Âge minimum → public_cible, spectacle vivant uniquement.
 * Fill-empty : une valeur déjà posée n'est jamais réécrite
 * (même motif que fillEmptyCineForm / fillEmptyWorkTags).
 *
 * Vocabulaire déjà en catalogue (vivant + schéma) :
 *   tout_public | jeune_public | ado | adulte
 * Pas de libellé « Interdit - N ans » : ce préfixe est le visa ciné,
 * et il exclut la séance du mode enfants.
 */

const JEUNE = 'jeune_public';
const ADO = 'ado';
const ADULTE = 'adulte';
const TOUT = 'tout_public';

const RE_DES = /dès\s*(\d+)\s*(mois|ans?)\b/giu;
const RE_PARTIR = /[àa]\s+partir\s+de\s+(\d+)\s*(mois|ans?)\b/giu;
const RE_ET_PLUS = /(\d+)\s*ans?\s+et\s*(?:\+|plus\b)/giu;
const RE_RANGE = /\bde\s+(\d+)\s*(mois|ans?)?\s*[àa]\s*(\d+)\s*ans?\b/giu;
const RE_HYPHEN = /\b(\d{1,2})\s*(?:-|–|—)\s*(\d{1,2})\s*ans?\b/giu;
const RE_MOINS =
  /(?:interdit(?:e|es|s)?|d[ée]conseill[ée]e?s?)\s+(?:aux?|au)\s+moins\s+de\s+(\d+)\s*ans?\b/giu;
const RE_PLUS =
  /r[ée]serv[ée]e?s?\s+aux?\s+plus\s+de\s+(\d+)\s*ans?\b/giu;
const RE_LABEL =
  /tout[-\s]petits?\b|petite\s+enfance|jeune\s+public/iu;

function normalizeDescription(text: string): string {
  return text
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function allMatches(re: RegExp, src: string): RegExpMatchArray[] {
  re.lastIndex = 0;
  return [...src.matchAll(re)];
}

function toYears(amount: number, unit: string | undefined): number {
  if (unit && /^mois/iu.test(unit)) return amount / 12;
  return amount;
}

/** Bandes alignées sur le vocabulaire fermé du catalogue. */
export function publicCibleForMinAge(years: number): string {
  if (years >= 18) return ADULTE;
  if (years >= 12) return ADO;
  return JEUNE;
}

function pushAge(ages: number[], years: number): void {
  if (!Number.isFinite(years) || years < 0 || years > 99) return;
  ages.push(years);
}

/**
 * Extrait un public_cible depuis une description, ou '' si aucun motif.
 * Les anniversaires (« fête ses 10 ans », « des 50 ans du Centre »)
 * et les horaires (« dès 17h ») ne comptent pas.
 */
export function extractPublicCibleFromDescription(
  text: string | null | undefined,
): string {
  const src = normalizeDescription(text || '');
  if (!src) return '';

  const ages: number[] = [];
  let toutPublic = false;

  for (const match of allMatches(RE_DES, src)) {
    pushAge(ages, toYears(Number(match[1]), match[2]));
  }
  for (const match of allMatches(RE_PARTIR, src)) {
    pushAge(ages, toYears(Number(match[1]), match[2]));
  }
  for (const match of allMatches(RE_ET_PLUS, src)) {
    pushAge(ages, Number(match[1]));
  }
  for (const match of allMatches(RE_RANGE, src)) {
    pushAge(ages, toYears(Number(match[1]), match[2] || 'ans'));
  }
  for (const match of allMatches(RE_HYPHEN, src)) {
    const lo = Math.min(Number(match[1]), Number(match[2]));
    const hi = Math.max(Number(match[1]), Number(match[2]));
    // « 0-99 ans » = tous âges. Une borne haute ouverte et un plancher
    // très bas n'est pas un spectacle jeune public.
    if (hi >= 90 && lo <= 3) toutPublic = true;
    else pushAge(ages, lo);
  }
  for (const match of allMatches(RE_MOINS, src)) {
    pushAge(ages, Number(match[1]));
  }
  for (const match of allMatches(RE_PLUS, src)) {
    pushAge(ages, Number(match[1]));
  }

  if (ages.length > 0) return publicCibleForMinAge(Math.min(...ages));
  if (RE_LABEL.test(src)) return JEUNE;
  if (toutPublic) return TOUT;
  return '';
}

/**
 * Séance d'abord, sinon le texte de l'événement.
 * Une mention sur la séance gagne sur un texte de saison plus large.
 */
export function publicCibleFromDescriptions(
  descriptionItem: string | null | undefined,
  eventDescription: string | null | undefined,
): string {
  return (
    extractPublicCibleFromDescription(descriptionItem) ||
    extractPublicCibleFromDescription(eventDescription)
  );
}

/**
 * Fill-empty sur une seule chaîne. Valeur existante renvoyée telle quelle
 * (trim), jamais remplacée.
 */
export function fillEmptyPublicCible(
  existing: string | null | undefined,
  description: string | null | undefined,
): string {
  const current = (existing ?? '').trim();
  if (current) return current;
  return extractPublicCibleFromDescription(description);
}

export function isVivantProgrammeRow(row: {
  form?: string | null;
  film_id?: string | null;
}): boolean {
  if ((row.film_id || '').trim()) return false;
  const form = (row.form || '').trim().toLowerCase();
  if (form === 'cine' || form === 'cinema' || form === 'cinéma') return false;
  return true;
}

export type PublicCibleSourceRow = {
  form?: string | null;
  film_id?: string | null;
  public_cible?: string | null;
  /** public_cible de l'événement parent, s'il est déjà posé. */
  event_public_cible?: string | null;
  description_item?: string | null;
  event_description?: string | null;
};

/**
 * Valeur à écrire sur la ligne programme, ou null pour ne pas toucher la cellule.
 * Ne remplit pas le ciné / AlloCiné (film_id). N'écrase pas une cellule pleine.
 * N'écrase pas non plus un public_cible parent différent : la séance le lit
 * déjà, et la ligne programme est prioritaire.
 */
export function nextProgrammePublicCible(
  row: PublicCibleSourceRow,
): string | null {
  if (!isVivantProgrammeRow(row)) return null;
  if ((row.public_cible ?? '').trim()) return null;
  const extracted = publicCibleFromDescriptions(
    row.description_item,
    row.event_description,
  );
  if (!extracted) return null;
  const parent = (row.event_public_cible ?? '').trim();
  if (parent && parent !== extracted) return null;
  return extracted;
}

export type AgeMentionFillStats = {
  mentions: number;
  filled: number;
  percent: number;
};

/** Mention d'âge = un motif reconnu. Rempli = programme ou événement parent. */
export function vivantAgeMentionStats(
  rows: readonly PublicCibleSourceRow[],
): AgeMentionFillStats {
  let mentions = 0;
  let filled = 0;
  for (const row of rows) {
    if (!isVivantProgrammeRow(row)) continue;
    if (
      !publicCibleFromDescriptions(row.description_item, row.event_description)
    ) {
      continue;
    }
    mentions += 1;
    const resolved =
      (row.public_cible ?? '').trim() || (row.event_public_cible ?? '').trim();
    if (resolved) filled += 1;
  }
  const percent = mentions === 0 ? 100 : (filled / mentions) * 100;
  return { mentions, filled, percent };
}

export type VivantRemnantInput = {
  event_id: string;
  titre: string;
  lieu: string;
  date: string;
  form?: string | null;
  film_id?: string | null;
  /** public_cible résolu (programme, sinon événement). */
  public_cible?: string | null;
};

export type VivantRemnantRow = {
  event_id: string;
  titre: string;
  lieu: string;
  nb_seances_a_venir: string;
};

/**
 * Événements vivant dont au moins une séance à venir n'a toujours pas
 * de public_cible. `nb_seances_a_venir` compte ces séances manquantes.
 */
export function remnantVivantSansPublicCible(
  rows: readonly VivantRemnantInput[],
  today: string,
): VivantRemnantRow[] {
  const horizon = (today || '').slice(0, 10);
  const grouped = new Map<
    string,
    { titre: string; lieu: string; missing: number }
  >();
  for (const row of rows) {
    if (!isVivantProgrammeRow(row)) continue;
    const date = (row.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < horizon) continue;
    if ((row.public_cible ?? '').trim()) continue;
    const id = (row.event_id || '').trim();
    if (!id) continue;
    const current = grouped.get(id);
    if (!current) {
      grouped.set(id, {
        titre: (row.titre || '').trim(),
        lieu: (row.lieu || '').trim(),
        missing: 1,
      });
      continue;
    }
    current.missing += 1;
    if (!current.titre && row.titre) current.titre = row.titre.trim();
    if (!current.lieu && row.lieu) current.lieu = row.lieu.trim();
  }
  return [...grouped.entries()]
    .map(([event_id, info]) => ({
      event_id,
      titre: info.titre,
      lieu: info.lieu,
      nb_seances_a_venir: String(info.missing),
    }))
    .sort((a, b) => {
      const diff = Number(b.nb_seances_a_venir) - Number(a.nb_seances_a_venir);
      if (diff !== 0) return diff;
      return a.event_id.localeCompare(b.event_id);
    });
}
