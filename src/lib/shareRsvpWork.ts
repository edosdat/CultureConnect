import { queryAgendaDetail } from '@/lib/agendaQuery';
import { normalizeDeepLinkId } from '@/lib/deepLink';
import { workIdOf } from '@/lib/reco';

/** Stable mother-stats key: film / event work, else the itemKey. */
export function workIdForItemKey(itemKey: string): string {
  const key = normalizeDeepLinkId(itemKey) || itemKey.trim();
  if (!key) return '';
  const item = queryAgendaDetail(key)?.item;
  return item ? workIdOf(item) : key;
}
