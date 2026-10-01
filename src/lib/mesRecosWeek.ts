/**
 * Plan C — « Mes recos de la semaine » week gate (Europe/Paris, Mon→Sun).
 *
 * Week key format (locked): ISO week `YYYY-Www` derived from the Paris
 * calendar date (e.g. `2026-W40`). Device-local localStorage only — not
 * `cc_signals_v1`. Another browser may show a 2nd popup in the same week.
 */
import { addDaysIso, parisParts } from '@/lib/timeScope';

export const MES_RECOS_WEEK_STORAGE_KEY = 'cc_mes_recos_week_v1';

export type MesRecosWeekRecord = {
  shown: true;
  weekKey: string;
  closedAt?: string;
};

/** Monday YYYY-MM-DD of the Paris calendar week containing `now`. */
export function parisWeekMondayIso(now = new Date()): string {
  const { iso, weekday } = parisParts(now);
  // parisParts weekday: 0=Sun .. 6=Sat → days since Monday
  const daysFromMon = weekday === 0 ? 6 : weekday - 1;
  return addDaysIso(iso, -daysFromMon);
}

/**
 * ISO week key for Europe/Paris: `YYYY-Www`.
 * Uses the Thursday of the Paris week (ISO rule) so year boundaries are correct.
 */
export function parisIsoWeekKey(now = new Date()): string {
  const monday = parisWeekMondayIso(now);
  const [y, m, d] = monday.split('-').map(Number);
  // Thursday of this week decides the ISO week-year
  const thursday = new Date(Date.UTC(y, m - 1, d + 3));
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1=Mon … 7=Sun
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(4 - jan4Day + 1);
  const weekNo =
    Math.round(
      (thursday.getTime() - week1Monday.getTime()) / 86_400_000 / 7,
    ) + 1;
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function parseMesRecosWeekRecord(raw: unknown): MesRecosWeekRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.shown !== true) return null;
  if (typeof obj.weekKey !== 'string' || !/^\d{4}-W\d{2}$/.test(obj.weekKey)) {
    return null;
  }
  const out: MesRecosWeekRecord = { shown: true, weekKey: obj.weekKey };
  if (typeof obj.closedAt === 'string' && obj.closedAt) {
    out.closedAt = obj.closedAt;
  }
  return out;
}

export function readMesRecosWeekRecord(): MesRecosWeekRecord | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(MES_RECOS_WEEK_STORAGE_KEY);
    if (!raw) return null;
    return parseMesRecosWeekRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** True when the auto-popup already ran (or was closed) for this Paris week. */
export function mesRecosWeekAlreadyShown(now = new Date()): boolean {
  const rec = readMesRecosWeekRecord();
  if (!rec) return false;
  return rec.weekKey === parisIsoWeekKey(now);
}

/**
 * Mark the Paris week as consumed. Idempotent for the same weekKey.
 * Manual reopen via « Mes recos » must NOT call this again to re-gate —
 * calling again with the same key is harmless.
 */
export function markMesRecosWeekShown(
  now = new Date(),
  opts?: { closedAt?: string },
): MesRecosWeekRecord {
  const weekKey = parisIsoWeekKey(now);
  const record: MesRecosWeekRecord = {
    shown: true,
    weekKey,
    closedAt: opts?.closedAt ?? new Date().toISOString(),
  };
  if (canUseStorage()) {
    try {
      localStorage.setItem(MES_RECOS_WEEK_STORAGE_KEY, JSON.stringify(record));
    } catch {
      /* quota / private mode */
    }
  }
  return record;
}

export type MesRecosCopyState = 'warm' | 'cold' | 'empty';

export function mesRecosSubtitle(state: MesRecosCopyState): string {
  if (state === 'empty') {
    return 'Plus d’idée pour l’instant — parcours l’agenda';
  }
  if (state === 'cold') {
    return 'On affine avec tes prochains clics';
  }
  return 'D’après tes goûts';
}

export const MES_RECOS_SHEET_TITLE = 'Mes recos de la semaine';
export const MES_RECOS_CTA = 'Voir l’agenda';
