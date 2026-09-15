/**
 * Server-only event date for activity inbox filter.
 * Keep this off the client graph (`agendaQuery` is `server-only`).
 */
import { queryAgendaDetail } from '@/lib/agendaQuery';
import { seanceDateIso } from '@/lib/timeScope';

/** Programme/event civil day for an activity `itemKey`. Empty → drop. */
export function activityEventDateIso(itemKey: string): string {
  const item = queryAgendaDetail(itemKey)?.item;
  if (!item) return '';
  return seanceDateIso(item);
}
