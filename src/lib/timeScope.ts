/**
 * Time-scope helpers for CultureConnect home (Europe/Paris local dates).
 */

export type TimeScopeId = 'soir' | 'weekend' | 'semaine' | 'date';

export type DateRange = {
  startIso: string;
  endIso: string;
  /** Inclusive list of YYYY-MM-DD in the range */
  days: string[];
};

const PARIS = 'Europe/Paris';

/** Current calendar date + hour in Europe/Paris. */
export function parisParts(now = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number; // 0=Sun .. 6=Sat (same as Date.getDay)
  iso: string;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const wd = get('weekday'); // Mon, Tue, ...
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = map[wd] ?? 0;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, hour, weekday, iso };
}

export function defaultTimeScope(now = new Date()): TimeScopeId {
  const { hour } = parisParts(now);
  return hour >= 17 ? 'soir' : 'weekend';
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + delta);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function daysBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  while (cur <= endIso) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
    if (out.length > 60) break;
  }
  return out;
}

/**
 * Weekend range:
 * - Mon–Thu → upcoming Sat–Sun
 * - Fri → Fri–Sun
 * - Sat → Sat–Sun
 * - Sun → Sun only
 */
export function weekendRange(todayIso: string, weekday: number): DateRange {
  if (weekday === 0) {
    // Sunday
    return { startIso: todayIso, endIso: todayIso, days: [todayIso] };
  }
  if (weekday === 5) {
    // Friday → Fri–Sun
    const end = addDaysIso(todayIso, 2);
    return { startIso: todayIso, endIso: end, days: daysBetween(todayIso, end) };
  }
  if (weekday === 6) {
    // Saturday → Sat–Sun
    const end = addDaysIso(todayIso, 1);
    return { startIso: todayIso, endIso: end, days: daysBetween(todayIso, end) };
  }
  // Mon–Thu → upcoming Sat–Sun
  const daysUntilSat = 6 - weekday;
  const sat = addDaysIso(todayIso, daysUntilSat);
  const sun = addDaysIso(sat, 1);
  return { startIso: sat, endIso: sun, days: [sat, sun] };
}

/** Today through next Sunday (inclusive). If today is Sunday, just today. */
export function weekRange(todayIso: string, weekday: number): DateRange {
  const daysUntilSun = weekday === 0 ? 0 : 7 - weekday;
  const end = addDaysIso(todayIso, daysUntilSun);
  return { startIso: todayIso, endIso: end, days: daysBetween(todayIso, end) };
}

export function resolveScopeRange(
  scope: TimeScopeId,
  selectedDateIso: string | null,
  now = new Date(),
): DateRange {
  const { iso, weekday } = parisParts(now);
  if (scope === 'soir') {
    return { startIso: iso, endIso: iso, days: [iso] };
  }
  if (scope === 'weekend') {
    return weekendRange(iso, weekday);
  }
  if (scope === 'semaine') {
    return weekRange(iso, weekday);
  }
  // date
  const day = selectedDateIso || iso;
  return { startIso: day, endIso: day, days: [day] };
}

const MONTH_SHORT_FR = [
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
];

function formatDayShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_SHORT_FR[(m ?? 1) - 1]}`;
}

/** Human context fragment e.g. "week-end 29–30 août" / "ce soir" / "le 24 août" */
export function scopeContextLabel(
  scope: TimeScopeId,
  range: DateRange,
): string {
  if (scope === 'soir') return 'ce soir';
  if (scope === 'semaine') {
    if (range.startIso === range.endIso) return formatDayShort(range.startIso);
    return `${formatDayShort(range.startIso)} – ${formatDayShort(range.endIso)}`;
  }
  if (scope === 'date') return formatDayShort(range.startIso);
  // weekend
  if (range.startIso === range.endIso) {
    return `week-end ${formatDayShort(range.startIso)}`;
  }
  const [, m1, d1] = range.startIso.split('-').map(Number);
  const [, m2, d2] = range.endIso.split('-').map(Number);
  if (m1 === m2) {
    return `week-end ${d1}–${d2} ${MONTH_SHORT_FR[(m1 ?? 1) - 1]}`;
  }
  return `week-end ${formatDayShort(range.startIso)} – ${formatDayShort(range.endIso)}`;
}

export const TIME_SCOPE_CHIPS: ReadonlyArray<{
  id: TimeScopeId;
  label: string;
}> = [
  { id: 'soir', label: 'Ce soir' },
  { id: 'weekend', label: 'Ce week-end' },
  { id: 'semaine', label: 'Cette semaine' },
  { id: 'date', label: 'Date…' },
];
