'use client';

import { MONTH_NAMES_FR, WEEKDAY_NAMES_FR } from '@/lib/labels';

type Props = {
  year: number;
  month: number; // 1-12
  selectedDay: string | null; // YYYY-MM-DD
  counts: Map<string, number>;
  onSelectDay: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function MonthCalendar({
  year,
  month,
  selectedDay,
  counts,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: Props) {
  const first = new Date(year, month - 1, 1);
  // Monday-first: JS getDay() Sun=0 .. Sat=6 -> Mon=0 .. Sun=6
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="min-w-0 overflow-x-hidden rounded-2xl border border-culture-line bg-culture-surface p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrevMonth}
          className="rounded-full border border-culture-line px-3 py-1.5 text-sm text-culture-ink hover:bg-culture-cream"
          aria-label="Mois précédent"
        >
          ←
        </button>
        <h2 className="font-display text-lg text-culture-ink sm:text-xl">
          {MONTH_NAMES_FR[month - 1]} {year}
        </h2>
        <button
          type="button"
          onClick={onNextMonth}
          className="rounded-full border border-culture-line px-3 py-1.5 text-sm text-culture-ink hover:bg-culture-cream"
          aria-label="Mois suivant"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-culture-muted sm:gap-1.5 sm:text-xs">
        {WEEKDAY_NAMES_FR.map((d) => (
          <div key={d} className="py-0.5">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`e-${idx}`} className="h-11 sm:h-12" />;
          }
          const iso = toIso(year, month, day);
          const count = counts.get(iso) ?? 0;
          const selected = selectedDay === iso;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDay(iso)}
              className={
                'relative flex h-11 min-h-[44px] flex-col items-center justify-center rounded-lg border text-sm transition sm:h-12 sm:rounded-xl ' +
                (selected
                  ? 'border-culture-terracotta bg-culture-terracotta text-white shadow'
                  : count > 0
                    ? 'border-culture-line bg-culture-cream text-culture-ink hover:border-culture-terracotta/60'
                    : 'border-transparent text-culture-muted hover:bg-culture-cream/60')
              }
            >
              <span className="font-medium leading-none">{day}</span>
              {count > 0 && (
                <span
                  className={
                    'mt-0.5 text-[10px] leading-none ' +
                    (selected ? 'text-white/90' : 'text-culture-terracotta')
                  }
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
