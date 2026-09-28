/**
 * Public agenda section badge.
 * Counts créneaux (date + heure + lieu / séance line) in the filtered
 * inventory. Does not densify to unique films and does not drop Top 3.
 * Wording: `{N} {séance(s)|sortie(s)} {date-chip suffix}`.
 */

import { dedupeNonCinemaSameLieuHoraire, densifyGroupKey } from './densify';
import {
  homePackOfItem,
  isCinemaDayItem,
  isEnfantsChipItem,
  isEnfantsDayItem,
  isExpoDayItem,
  isMusiqueDayItem,
  isTheatreDayItem,
} from './nouveautesCine';
import { seanceClockHHMM, seanceDateIso, type TimeScopeId } from './timeScope';
import type { DayItem } from './types';

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

export type SectionBadgeUnit = 'seance' | 'sortie';

export type SectionSlotTotals = {
  cineSlotTotal: number;
  theatreSlotTotal: number;
  musiqueSlotTotal: number;
  enfantsSlotTotal: number;
  expoSlotTotal: number;
  autresSlotTotal: number;
};

function lieuIdOf(item: DayItem): string {
  const fromLieu = (item.lieu?.lieu_id || '').trim();
  if (fromLieu) return fromLieu;
  if (item.kind === 'programme') return (item.programme.lieu_id || '').trim();
  return (item.evenement.lieu_id || '').trim();
}

function sceneOf(item: DayItem): string {
  if (item.kind !== 'programme') return '';
  return (item.programme.scene_salle || '').trim().toLowerCase();
}

function langueOf(item: DayItem): string {
  if (item.kind === 'programme') {
    return (item.programme.langue || item.evenement?.langue || '')
      .trim()
      .toLowerCase();
  }
  return (item.evenement.langue || '').trim().toLowerCase();
}

/**
 * One créneau. CSV clones of the same work + day + clock + lieu + room +
 * version collapse. Two films at the same clock stay two séances. A show on
 * three dates stays three sorties.
 */
export function sectionSlotKey(item: DayItem): string {
  return [
    densifyGroupKey(item),
    seanceDateIso(item),
    seanceClockHHMM(item),
    lieuIdOf(item),
    sceneOf(item),
    langueOf(item),
  ].join('|');
}

/** Slot count for one section pool. Not `densify().length`. */
export function countSectionSlots(items: readonly DayItem[]): number {
  const seen = new Set<string>();
  for (const item of dedupeNonCinemaSameLieuHoraire(items)) {
    seen.add(sectionSlotKey(item));
  }
  return seen.size;
}

/**
 * Full filtered inventory, split the same way as the public packs.
 * Top 3 is a client subset of this pool — it is not removed here.
 */
export function sectionSlotTotals(
  items: readonly DayItem[],
  opts?: { enfantsChip?: boolean },
): SectionSlotTotals {
  const enfantsPred = opts?.enfantsChip ? isEnfantsChipItem : isEnfantsDayItem;
  return {
    cineSlotTotal: countSectionSlots(items.filter(isCinemaDayItem)),
    theatreSlotTotal: countSectionSlots(items.filter(isTheatreDayItem)),
    musiqueSlotTotal: countSectionSlots(items.filter(isMusiqueDayItem)),
    enfantsSlotTotal: countSectionSlots(items.filter(enfantsPred)),
    expoSlotTotal: countSectionSlots(items.filter(isExpoDayItem)),
    autresSlotTotal: countSectionSlots(
      items.filter((item) => !homePackOfItem(item)),
    ),
  };
}

export function sectionBadgeUnitWord(
  unit: SectionBadgeUnit,
  count: number,
): string {
  if (unit === 'seance') return count <= 1 ? 'séance' : 'séances';
  return count <= 1 ? 'sortie' : 'sorties';
}

/** « le 28 septembre » — day without a leading zero or an ordinal. */
export function formatLeJourMois(iso: string | null | undefined): string | null {
  const raw = (iso || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `le ${day} ${MONTHS_FR[month - 1]}`;
}

/**
 * Date chip → suffix. City and category stay on their own chips.
 * A calendar month with no picked day (month arrows) is « en {mois} ».
 */
export function sectionBadgeSuffix(
  scope: TimeScopeId,
  dayIso?: string | null,
  monthIso?: string | null,
): string {
  if (scope === 'aujourdhui') return 'aujourd\u2019hui';
  if (scope === 'soir') return 'ce soir';
  if (scope === 'weekend') return 'ce week-end';
  if (scope === 'semaine') return 'cette semaine';
  if (scope === 'date') {
    const day = formatLeJourMois(dayIso);
    if (day) return day;
    const month = formatLeJourMois(monthIso);
    if (month) {
      const name = month.replace(/^le \d+ /, '');
      if (name) return `en ${name}`;
    }
  }
  return 'à venir';
}

/**
 * Identity of the filter that produced a slot total.
 * The badge stays hidden while this does not match the chips on screen,
 * so a new date suffix never reuses the previous count.
 */
export function sectionSlotQueryKey(parts: {
  scope: string;
  day?: string | null;
  year?: number;
  month?: number;
  commune?: string | null;
  lieuId?: string | null;
  categories?: readonly string[];
  genres?: readonly string[];
  title?: string | null;
  phrase?: string | null;
}): string {
  return [
    parts.scope,
    parts.day ?? '',
    parts.scope === 'date' ? `${parts.year ?? ''}-${parts.month ?? ''}` : '',
    parts.commune ?? '',
    parts.lieuId ?? '',
    (parts.categories ?? []).join(','),
    (parts.genres ?? []).join(','),
    (parts.title ?? '').trim(),
    parts.phrase ?? '',
  ].join('|');
}

/** `{N} {unité} {suffixe}`, or null when there is nothing to announce. */
export function formatSectionBadge(opts: {
  count: number;
  unit: SectionBadgeUnit;
  scope: TimeScopeId;
  dayIso?: string | null;
  monthIso?: string | null;
}): string | null {
  if (!Number.isFinite(opts.count) || opts.count <= 0) return null;
  const n = Math.floor(opts.count);
  if (n <= 0) return null;
  const unit = sectionBadgeUnitWord(opts.unit, n);
  const suffix = sectionBadgeSuffix(opts.scope, opts.dayIso, opts.monthIso);
  return `${n} ${unit} ${suffix}`;
}
