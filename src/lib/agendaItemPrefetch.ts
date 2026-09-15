/**
 * Client cache for `GET /api/agenda?id=` — inbox thumbs + cloche → fiche
 * first paint. Does not block sheet open or navigation.
 */
import { itemImageUrl, itemTitle } from '@/lib/displayHome';
import { formatLieuAffiche } from '@/lib/labels';
import { formatActivityDateShort } from '@/lib/shareActivity';
import type { DayItem } from '@/lib/types';

export type AgendaItemMeta = {
  title: string;
  where: string;
  image: string;
};

const items = new Map<string, DayItem>();
const inflight = new Map<string, Promise<DayItem | null>>();

export function peekPrefetchedAgendaItem(itemKey: string): DayItem | null {
  return items.get(itemKey) ?? null;
}

export function agendaItemMeta(item: DayItem): AgendaItemMeta {
  const lieu = formatLieuAffiche(item.lieu);
  const date = formatActivityDateShort(item.dayIso);
  return {
    title: itemTitle(item),
    where: [lieu, date].filter(Boolean).join(' · '),
    image: itemImageUrl(item),
  };
}

export function prefetchAgendaItem(itemKey: string): Promise<DayItem | null> {
  if (!itemKey) return Promise.resolve(null);
  const hit = items.get(itemKey);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(itemKey);
  if (pending) return pending;
  const request = fetch(`/api/agenda?id=${encodeURIComponent(itemKey)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { item?: DayItem } | null) => {
      if (!data?.item) return null;
      items.set(itemKey, data.item);
      return data.item;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(itemKey);
    });
  inflight.set(itemKey, request);
  return request;
}

export function forgetPrefetchedAgendaItemsForTests(): void {
  items.clear();
  inflight.clear();
}
