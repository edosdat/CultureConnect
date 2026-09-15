/**
 * Server-only event date for activity inbox filter.
 * Keep this off the client graph (`agendaQuery` is `server-only`).
 */
import { queryAgendaItemDateIso } from '@/lib/agendaQuery';

/** Programme/event civil day for an activity `itemKey`. Empty → drop. */
export function activityEventDateIso(itemKey: string): string {
  return queryAgendaItemDateIso(itemKey);
}
