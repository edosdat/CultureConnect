/**
 * Time-scope helpers for CultureConnect home (Europe/Paris local dates).
 */

export type TimeScopeId = 'aujourdhui' | 'soir' | 'weekend' | 'semaine' | 'date';

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
  return hour >= 17 ? 'soir' : 'aujourdhui';
}

export function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + delta);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function daysBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  while (cur <= endIso) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
    // Allow up to ~3 months (search “all upcoming” is capped at +90 days).
    if (out.length > 100) break;
  }
  return out;
}

/**
 * Today → max date present in loaded data, capped at +capDays (default 90).
 * Used when the search query is non-empty so users can find a band/film without knowing the date.
 */
export function upcomingRange(
  todayIso: string,
  dataMaxIso: string,
  capDays = 90,
): DateRange {
  const capIso = addDaysIso(todayIso, capDays);
  let end = dataMaxIso && dataMaxIso >= todayIso ? dataMaxIso : todayIso;
  if (end > capIso) end = capIso;
  if (end < todayIso) end = todayIso;
  return {
    startIso: todayIso,
    endIso: end,
    days: daysBetween(todayIso, end),
  };
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


/** All YYYY-MM-DD days in a calendar month (month 1–12). */
export function daysInMonth(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(
      `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
  }
  return out;
}

/** Seance calendar date (programme.date, else dayIso). */
export function seanceDateIso(item: {
  dayIso?: string;
  programme?: { date?: string };
}): string {
  const fromProg = (item.programme?.date || '').trim();
  if (fromProg) return fromProg;
  return (item.dayIso || '').trim();
}

/** True when date >= todayIso (Paris YYYY-MM-DD). Missing date is hidden. */
export function isNotBeforeToday(dateIso: string, todayIso: string): boolean {
  const d = (dateIso || '').trim();
  return Boolean(d) && d >= todayIso;
}

/** Display filter: drop seances whose date is strictly before today (Paris). */
export function hideSeancesBeforeToday<
  T extends { dayIso?: string; programme?: { date?: string } },
>(items: T[], todayIso: string): T[] {
  return items.filter((item) => isNotBeforeToday(seanceDateIso(item), todayIso));
}

export function resolveScopeRange(
  scope: TimeScopeId,
  selectedDateIso: string | null,
  now = new Date(),
  /** When scope is `date` and no day is selected, list the displayed calendar month. */
  calendarMonth?: { year: number; month: number },
): DateRange {
  const { iso, weekday } = parisParts(now);
  // Aujourd'hui + Ce soir share today; Ce soir also filters heure >= 19:00 in the app.
  if (scope === 'aujourdhui' || scope === 'soir') {
    return { startIso: iso, endIso: iso, days: [iso] };
  }
  if (scope === 'weekend') {
    return weekendRange(iso, weekday);
  }
  if (scope === 'semaine') {
    return weekRange(iso, weekday);
  }
  // date: one day if selected, else whole displayed month
  if (selectedDateIso) {
    return {
      startIso: selectedDateIso,
      endIso: selectedDateIso,
      days: [selectedDateIso],
    };
  }
  if (calendarMonth) {
    const days = daysInMonth(calendarMonth.year, calendarMonth.month).filter(
      (d) => d >= iso,
    );
    if (days.length === 0) {
      return { startIso: iso, endIso: iso, days: [] };
    }
    return {
      startIso: days[0]!,
      endIso: days[days.length - 1]!,
      days,
    };
  }
  return { startIso: iso, endIso: iso, days: [iso] };
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
  if (scope === 'aujourdhui') return "aujourd'hui";
  if (scope === 'soir') return 'ce soir';
  if (scope === 'semaine') {
    if (range.startIso === range.endIso) return formatDayShort(range.startIso);
    return `${formatDayShort(range.startIso)} – ${formatDayShort(range.endIso)}`;
  }
  if (scope === 'date') {
    if (range.startIso === range.endIso) return formatDayShort(range.startIso);
    const [y, m] = range.startIso.split('-').map(Number);
    return `${MONTH_SHORT_FR[(m ?? 1) - 1]} ${y}`;
  }
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
  { id: 'aujourdhui', label: "Aujourd'hui" },
  { id: 'soir', label: 'Ce soir' },
  { id: 'weekend', label: 'Ce WE' },
  { id: 'semaine', label: 'Cette semaine' },
  { id: 'date', label: 'Date…' },
];