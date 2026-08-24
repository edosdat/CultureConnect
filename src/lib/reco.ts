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
  'j\'aime',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, ' ');
}

/** Extract meaningful tokens (≥2 chars, not stopwords). */
export function tokenizeTastes(tastes: string): string[] {
  const raw = normalize(tastes).split(/[^a-z0-9]+/i).filter(Boolean);
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

function itemBlob(item: DayItem): string {
  const parts: string[] = [];
  if (item.kind === 'programme') {
    parts.push(item.programme.nom_item);
    if (item.programme.genre) parts.push(item.programme.genre);
    if (item.programme.type_item) parts.push(item.programme.type_item);
    if (item.programme.notes) parts.push(item.programme.notes);
    if (item.programme.description_item)
      parts.push(item.programme.description_item);
    if (item.evenement?.titre) parts.push(item.evenement.titre);
    if (item.evenement?.categorie) parts.push(item.evenement.categorie);
    if (item.evenement?.genre) parts.push(item.evenement.genre);
    if (item.evenement?.description_courte)
      parts.push(item.evenement.description_courte);
    if (item.evenement?.description_longue)
      parts.push(item.evenement.description_longue);
    if (item.evenement?.tags) parts.push(item.evenement.tags);
    if (item.evenement?.casting) parts.push(item.evenement.casting);
  } else {
    parts.push(item.evenement.titre);
    if (item.evenement.categorie) parts.push(item.evenement.categorie);
    if (item.evenement.genre) parts.push(item.evenement.genre);
    if (item.evenement.description_courte)
      parts.push(item.evenement.description_courte);
    if (item.evenement.description_longue)
      parts.push(item.evenement.description_longue);
    if (item.evenement.tags) parts.push(item.evenement.tags);
    if (item.evenement.casting) parts.push(item.evenement.casting);
  }
  if (item.lieu?.nom) parts.push(item.lieu.nom);
  if (item.lieu?.commune) parts.push(item.lieu.commune);
  if (item.lieu?.type) parts.push(item.lieu.type);
  return normalize(parts.join(' '));
}

/** Weight: titre/name hits count more than description. */
function scoreItem(item: DayItem, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const blob = itemBlob(item);
  if (!blob) return 0;

  const title =
    item.kind === 'programme'
      ? normalize(
          [
            item.programme.nom_item,
            item.evenement?.titre ?? '',
            item.evenement?.categorie ?? '',
            item.programme.genre,
            item.evenement?.genre ?? '',
          ].join(' '),
        )
      : normalize(
          [
            item.evenement.titre,
            item.evenement.categorie,
            item.evenement.genre,
          ].join(' '),
        );

  const lieuBlob = normalize(
    [item.lieu?.nom ?? '', item.lieu?.commune ?? '', item.lieu?.type ?? ''].join(
      ' ',
    ),
  );

  let score = 0;
  for (const tok of tokens) {
    if (title.includes(tok)) score += 4;
    else if (lieuBlob.includes(tok)) score += 2;
    else if (blob.includes(tok)) score += 1;
  }
  return score;
}

export type ScoredDayItem = {
  item: DayItem;
  score: number;
};

/**
 * Score DayItems against free-text tastes; return top N with score > 0.
 */
export function recommendForTastes(
  items: DayItem[],
  tastes: string,
  topN = 10,
): ScoredDayItem[] {
  const trimmed = tastes.trim();
  if (!trimmed || items.length === 0) return [];

  const tokens = tokenizeTastes(trimmed);
  if (tokens.length === 0) return [];

  const scored: ScoredDayItem[] = [];
  for (const item of items) {
    const score = scoreItem(item, tokens);
    if (score > 0) scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.dayIso.localeCompare(b.item.dayIso);
  });

  return scored.slice(0, Math.max(1, Math.min(topN, 12)));
}
