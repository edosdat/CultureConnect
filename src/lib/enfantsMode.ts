import {
  isAgeRestrictedSeance,
  matchesEnfantsChipContent,
  type EnfantsChipFields,
} from './categories';
import type { DayItem } from './types';

/**
 * Family-slot helpers kept for a future option *under* the Enfants chip.
 * Product LOCK 2026-10-01: the « Avec les enfants » séance-mode catalog is
 * removed. Do not re-wire `applyAvecEnfantsMode` as a second rail / request
 * flag. The sole path is the Enfants QUOI chip (`enfants_famille`) with
 * unitary densified cards.
 */

const FAMILY_WEEKDAYS = new Set([0, 3, 6]); // dimanche, mercredi, samedi

export type AvecEnfantsCreneau = 'matin' | 'apres-midi' | 'soir' | 'sans-heure';

/** Séance row first, parent event only when the row is empty (same as data.ts). */
export function seancePublicCible(item: DayItem): string {
  if (item.kind === 'programme') {
    const row = (item.programme.public_cible || '').trim();
    if (row) return row;
    return (item.evenement?.public_cible || '').trim();
  }
  return (item.evenement.public_cible || '').trim();
}

function enfantsChipFieldsOf(item: DayItem): EnfantsChipFields {
  const publicCible = seancePublicCible(item);
  if (item.kind === 'programme') {
    return {
      categorie: item.evenement?.categorie ?? '',
      genre: item.programme.genre || item.evenement?.genre || '',
      tags: item.evenement?.tags || '',
      publicCible,
    };
  }
  return {
    categorie: item.evenement.categorie ?? '',
    genre: item.evenement.genre || '',
    tags: item.evenement.tags || '',
    publicCible,
  };
}

function storedForm(item: DayItem): string {
  if (item.kind === 'programme') {
    return (item.programme.form || item.evenement?.form || '').trim().toLowerCase();
  }
  return (item.evenement.form || '').trim().toLowerCase();
}

/** Clock on the séance row (`HH:MM`), else the parent event. Empty if unreadable. */
export function seanceClockHHMM(item: DayItem): string {
  const raw =
    item.kind === 'programme'
      ? item.programme.heure_debut || item.evenement?.heure_debut || ''
      : item.evenement.heure_debut || '';
  const match = raw.trim().match(/^(\d{1,2})[:hH](\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Civil weekday of a YYYY-MM-DD (0 = Sunday). Independent of the process TZ. */
export function isoWeekday(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt.getUTCDay();
}

/**
 * Matin before 14:00, après-midi until 18:00, then soir.
 * Both daytime créneaux sort before soir.
 */
export function avecEnfantsCreneau(item: DayItem): AvecEnfantsCreneau {
  const clock = seanceClockHHMM(item);
  if (!clock) return 'sans-heure';
  if (clock < '14:00') return 'matin';
  if (clock < '18:00') return 'apres-midi';
  return 'soir';
}

function creneauRank(item: DayItem): number {
  switch (avecEnfantsCreneau(item)) {
    case 'matin':
      return 0;
    case 'apres-midi':
      return 1;
    case 'soir':
      return 2;
    default:
      return 3;
  }
}

function normalizedPublic(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * `tout_public` on mercredi, samedi or dimanche, strictly before 18:00.
 * A missing clock does not qualify.
 */
export function isFamilyToutPublicSlot(item: DayItem, publicCible?: string): boolean {
  const pc = normalizedPublic(publicCible ?? seancePublicCible(item));
  if (pc !== 'tout_public') return false;
  const day = (item.dayIso || '').trim();
  const weekday = isoWeekday(day);
  if (weekday == null || !FAMILY_WEEKDAYS.has(weekday)) return false;
  const clock = seanceClockHHMM(item);
  return Boolean(clock) && clock < '18:00';
}

/**
 * One séance. An œuvre can keep one screening and lose three others.
 * Exclusion of `isAgeRestrictedSeance` is absolute.
 */
export function seanceMatchesAvecEnfantsMode(item: DayItem): boolean {
  const publicCible = seancePublicCible(item);
  if (isAgeRestrictedSeance(publicCible)) return false;
  if (matchesEnfantsChipContent(enfantsChipFieldsOf(item))) return true;
  if (storedForm(item) === 'enfants') return true;
  if (normalizedPublic(publicCible) === 'jeune_public') return true;
  if (isFamilyToutPublicSlot(item, publicCible)) return true;
  return false;
}

/** Soonest date, then matin / après-midi before soir. Stable on `key`. */
export function compareAvecEnfantsSeances(a: DayItem, b: DayItem): number {
  const da = (a.dayIso || '').trim();
  const db = (b.dayIso || '').trim();
  if (da !== db) return da < db ? -1 : 1;
  const ra = creneauRank(a);
  const rb = creneauRank(b);
  if (ra !== rb) return ra - rb;
  const ha = seanceClockHHMM(a);
  const hb = seanceClockHHMM(b);
  if (ha !== hb) return ha < hb ? -1 : 1;
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  return 0;
}

export function applyAvecEnfantsMode<T extends DayItem>(items: readonly T[]): T[] {
  const kept = items.filter(seanceMatchesAvecEnfantsMode);
  kept.sort(compareAvecEnfantsSeances);
  return kept;
}
