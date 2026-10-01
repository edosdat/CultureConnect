/** Visual priority: selected fill wins over today outline. */
export function calendarDayTone(
  iso: string,
  selectedDay: string | null,
  todayIso: string,
): 'selected' | 'today' | 'default' {
  if (selectedDay === iso) return 'selected';
  if (iso === todayIso) return 'today';
  return 'default';
}
