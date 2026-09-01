/**
 * Living-arts complements on a cinema hero / fiche.
 * Same-day only if it does not overlap the screening. Other days: mood/theme.
 * Mix 2 théâtre + 1 musique or 2 musique + 1 théâtre. Zero films.
 */

import { filterItemsByCommune } from './commune';
import { isCinemaDayItem, isVivantDayItem } from './nouveautesCine';
import { CINE_VIVANT_NEIGHBORS, slotFormOfItem } from './reco';
import { seanceDateIso } from './timeScope';
import type { DayItem } from './types';
import {
  endsBeforeScreening,
  itemIntervalMinutes,
  overlapsScreening,
  startsAfterScreening,
} from './vivantComplementCopy';

export type VivantArtsForm = 'theatre' | 'musique';

export {
  endsBeforeScreening,
  itemIntervalMinutes,
  overlapsScreening,
  startsAfterScreening,
  vivantComplementLead,
  weekdayLongFr,
} from './vivantComplementCopy';

const MAX_BLOCK = 3;
const OTHER_DAY_SLOTS = 2;

function splitTags(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[|,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function vivantArtsForm(item: DayItem): VivantArtsForm | null {
  if (isCinemaDayItem(item)) return null;
  const slot = slotFormOfItem(item);
  if (slot === 'theatre') return 'theatre';
  if (slot === 'concert') return 'musique';
  return null;
}

function eventKeyOf(item: DayItem): string {
  if (item.kind === 'programme') {
    return (
      item.programme.event_id ||
      item.programme.programme_id ||
      item.key
    );
  }
  return item.evenement.event_id || item.key;
}

function itemTagSet(item: DayItem): Set<string> {
  const ev = item.evenement ?? null;
  const prog = item.kind === 'programme' ? item.programme : null;
  const raw = [
    ...splitTags(prog?.moods),
    ...splitTags(ev?.moods),
    ...splitTags(prog?.themes),
    ...splitTags(ev?.themes),
    ...splitTags(prog?.genres_mood),
    ...splitTags(ev?.genres_mood),
    ...splitTags(prog?.genre),
    ...splitTags(ev?.genre),
  ];
  return new Set(raw);
}

export function themeMoodScore(film: DayItem, vivant: DayItem): number {
  const filmTags = itemTagSet(film);
  const vivantTags = itemTagSet(vivant);
  let score = 0;
  for (const t of vivantTags) {
    if (filmTags.has(t)) score += 4;
  }
  for (const t of filmTags) {
    const neighbors = CINE_VIVANT_NEIGHBORS[t];
    if (!neighbors) continue;
    if (neighbors.some((n) => vivantTags.has(n))) score += 3;
  }
  return score;
}

function isWeekendIso(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return false;
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6;
}

function formCounts(items: DayItem[]): { theatre: number; musique: number } {
  let theatre = 0;
  let musique = 0;
  for (const item of items) {
    const f = vivantArtsForm(item);
    if (f === 'theatre') theatre += 1;
    else if (f === 'musique') musique += 1;
  }
  return { theatre, musique };
}

function wouldKeepMix(
  picked: DayItem[],
  next: DayItem,
  targetTotal: number,
): boolean {
  const forms = [...picked, next];
  const { theatre, musique } = formCounts(forms);
  if (theatre >= 3 || musique >= 3) return false;
  const remaining = targetTotal - forms.length;
  if (remaining === 0 && targetTotal >= 2 && (theatre === 0 || musique === 0)) {
    return false;
  }
  return true;
}

function pickNonOverlappingSameDay(
  candidates: DayItem[],
  film: DayItem,
): DayItem | null {
  if (!itemIntervalMinutes(film)) return null;
  const after: DayItem[] = [];
  const before: DayItem[] = [];
  for (const item of candidates) {
    if (overlapsScreening(film, item)) continue;
    if (startsAfterScreening(film, item)) after.push(item);
    else if (endsBeforeScreening(film, item)) before.push(item);
  }
  after.sort((a, b) => {
    const sa = itemIntervalMinutes(a)?.start ?? 0;
    const sb = itemIntervalMinutes(b)?.start ?? 0;
    if (sa !== sb) return sa - sb;
    return a.key.localeCompare(b.key);
  });
  before.sort((a, b) => {
    const ea = itemIntervalMinutes(a)?.end ?? 0;
    const eb = itemIntervalMinutes(b)?.end ?? 0;
    if (ea !== eb) return eb - ea;
    return a.key.localeCompare(b.key);
  });
  return after[0] ?? before[0] ?? null;
}

function compareOtherDay(film: DayItem, a: DayItem, b: DayItem): number {
  const sa = themeMoodScore(film, a);
  const sb = themeMoodScore(film, b);
  if (sb !== sa) return sb - sa;
  const wa = isWeekendIso(seanceDateIso(a) || a.dayIso) ? 1 : 0;
  const wb = isWeekendIso(seanceDateIso(b) || b.dayIso) ? 1 : 0;
  if (wb !== wa) return wb - wa;
  const da = (seanceDateIso(a) || a.dayIso).localeCompare(
    seanceDateIso(b) || b.dayIso,
  );
  if (da !== 0) return da;
  return a.key.localeCompare(b.key);
}

function pickOtherDays(
  candidates: DayItem[],
  film: DayItem,
  already: DayItem[],
  need: number,
): DayItem[] {
  if (need <= 0) return [];
  const targetTotal = already.length + need;
  const ranked = [...candidates].sort((a, b) => compareOtherDay(film, a, b));
  const used = new Set(already.map(eventKeyOf));
  const out: DayItem[] = [];

  const tryPick = (strictMix: boolean, requireTheme: boolean) => {
    for (const item of ranked) {
      if (out.length >= need) break;
      const k = eventKeyOf(item);
      if (used.has(k)) continue;
      if (requireTheme && themeMoodScore(film, item) <= 0) continue;
      if (strictMix && !wouldKeepMix([...already, ...out], item, targetTotal)) {
        continue;
      }
      used.add(k);
      out.push(item);
    }
  };

  tryPick(true, true);
  if (out.length < need) tryPick(true, false);
  if (out.length < need) tryPick(false, false);
  return out;
}

export type FilmVivantComplementOpts = {
  /** Exact commune. Empty / null → Toulouse (not métropole). */
  commune?: string | null;
  limit?: number;
};

/**
 * Up to 3 living-arts items for a cinema screening.
 * Slot 1: same day, no overlap (skip if nothing fits).
 * Slots 2–3: another day, theme/mood, 2+1 théâtre/musique mix.
 */
export function pickFilmVivantComplements(
  pool: DayItem[],
  film: DayItem,
  opts: FilmVivantComplementOpts = {},
): DayItem[] {
  const commune = (opts.commune || '').trim() || 'Toulouse';
  const limit = Math.min(MAX_BLOCK, Math.max(1, opts.limit ?? MAX_BLOCK));
  const filmDay = seanceDateIso(film) || film.dayIso;
  const local = filterItemsByCommune(pool, commune);
  const living: DayItem[] = [];
  const seen = new Set<string>();
  for (const item of local) {
    if (item.key === film.key) continue;
    if (isCinemaDayItem(item)) continue;
    if (!isVivantDayItem(item)) continue;
    if (!vivantArtsForm(item)) continue;
    const k = eventKeyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    living.push(item);
  }

  const sameDay = living.filter(
    (item) => (seanceDateIso(item) || item.dayIso) === filmDay,
  );
  const slot1 = pickNonOverlappingSameDay(sameDay, film);
  const picked: DayItem[] = slot1 ? [slot1] : [];

  const other = living.filter((item) => {
    if (picked.some((p) => eventKeyOf(p) === eventKeyOf(item))) return false;
    return (seanceDateIso(item) || item.dayIso) !== filmDay;
  });
  const otherNeed = Math.min(OTHER_DAY_SLOTS, Math.max(0, limit - picked.length));
  picked.push(...pickOtherDays(other, film, picked, otherNeed));
  return picked.slice(0, limit);
}
