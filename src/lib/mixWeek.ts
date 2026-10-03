/**
 * Week plans for /mix. Built from the same séance set as
 * GET /api/agenda?scope=semaine (no page cap, moods kept).
 * Home list slim stays tagless — this shape is only for mix=1.
 */

import type { DayItem, GenreLegend } from './types';
import { itemImageUrl, itemHeure, itemTitle } from './displayHome';
import { formatLieuAffiche, labelCategorie } from './labels';
import { visibleWorkKey } from './densify';
import { isCinemaDayItem, isMusiqueDayItem } from './nouveautesCine';
import { itemInheritsParentMoods } from './reco';
import { seanceDateIso } from './timeScope';
import { planMoodList, type MixBucket } from './mixFaders';

export type MixPlanWire = {
  key: string;
  title: string;
  categorie: string;
  dayIso: string;
  heure: string;
  lieu: string;
  image: string;
  moods: string[];
  confiance: string;
  bucket: MixBucket;
};

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] as const;

export function mixJour(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return JOURS[weekday] ?? '';
}

export function mixMeta(plan: Pick<MixPlanWire, 'categorie' | 'dayIso' | 'heure' | 'lieu'>): string {
  const when = [mixJour(plan.dayIso), plan.heure].filter(Boolean).join(' ');
  return [plan.categorie, when, plan.lieu].filter(Boolean).join(' · ');
}

function categoryWord(item: DayItem, legend: readonly GenreLegend[]): string {
  const genre =
    item.kind === 'programme'
      ? item.programme.genre || item.evenement?.genre || ''
      : item.evenement.genre || '';
  const slug = genre.split(/[|,]/)[0]?.trim().toLowerCase() || '';
  if (slug) {
    const hit = legend.find((row) => row.slug === slug);
    if (hit?.label_fr) return hit.label_fr;
  }
  const categorie =
    item.kind === 'programme'
      ? item.evenement?.categorie || ''
      : item.evenement.categorie;
  const labeled = labelCategorie(categorie);
  if (labeled) return labeled;
  if (isCinemaDayItem(item)) return 'Cinéma';
  if (isMusiqueDayItem(item)) return 'Musique';
  return 'Vivant';
}

function bucketOf(item: DayItem): MixBucket {
  if (isCinemaDayItem(item)) return 'cine';
  if (isMusiqueDayItem(item)) return 'musique';
  return 'vivant';
}

function moodSource(item: DayItem): {
  rowMoods: string;
  rowConfiance: string;
  parentMoods: string;
  parentConfiance: string;
} {
  if (item.kind === 'programme') {
    return {
      rowMoods: item.programme.moods || '',
      rowConfiance: item.programme.mood_confiance || '',
      parentMoods: item.evenement?.moods || '',
      parentConfiance: item.evenement?.mood_confiance || '',
    };
  }
  return {
    rowMoods: item.evenement.moods || '',
    rowConfiance: item.evenement.mood_confiance || '',
    parentMoods: '',
    parentConfiance: '',
  };
}

function whenKey(item: DayItem): string {
  const day = seanceDateIso(item) || item.dayIso || '9999-99-99';
  const heure = itemHeure(item) || '99:99';
  return `${day}T${heure}\t${item.key}`;
}

/**
 * One card per visible work (same key as the home densify), the soonest
 * séance. Otherwise a film with a dozen screenings fills the top 10.
 * Plans with no v1 taste mood are left out.
 */
export function toMixPlans(
  items: readonly DayItem[],
  legend: readonly GenreLegend[] = [],
): MixPlanWire[] {
  const ordered = items.slice().sort((a, b) => whenKey(a).localeCompare(whenKey(b)));
  const seen = new Set<string>();
  const out: MixPlanWire[] = [];
  for (const item of ordered) {
    const work = visibleWorkKey(item);
    if (seen.has(work)) continue;
    const src = moodSource(item);
    const inherit = itemInheritsParentMoods(item);
    const moods = planMoodList({
      rowMoods: src.rowMoods,
      parentMoods: src.parentMoods,
      inheritParent: inherit,
    });
    if (moods.length === 0) continue;
    seen.add(work);
    const rowTaste = planMoodList({
      rowMoods: src.rowMoods,
      inheritParent: false,
    });
    out.push({
      key: item.key,
      title: itemTitle(item),
      categorie: categoryWord(item, legend),
      dayIso: seanceDateIso(item) || item.dayIso || '',
      heure: itemHeure(item),
      lieu: formatLieuAffiche(item.lieu),
      image: itemImageUrl(item),
      moods,
      confiance: rowTaste.length > 0 ? src.rowConfiance : src.parentConfiance,
      bucket: bucketOf(item),
    });
  }
  return out;
}
