'use client';

import type { ReactNode } from 'react';

import type { DayItem } from '@/lib/types';
import SeanceCard from './SeanceCard';

type Props = {
  items: DayItem[];
  showDate?: boolean;
  onSelectItem: (key: string) => void;
  onSelectVenue?: (lieuId: string) => void;
  empty: ReactNode;
};

/** Soft-collapse: same event_id on same day → one card +N créneaux. */
function densify(items: DayItem[]): { item: DayItem; extraSlots: number }[] {
  const groups = new Map<string, DayItem[]>();
  const order: string[] = [];
  for (const item of items) {
    let groupKey = item.key;
    if (item.kind === 'programme' && item.programme.event_id) {
      // Same event + day + title only (avoid merging distinct festival acts)
      groupKey = `p:${item.dayIso}:${item.programme.event_id}:${item.programme.nom_item}`;
    }
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      order.push(groupKey);
    }
    groups.get(groupKey)!.push(item);
  }
  return order.map((k) => {
    const g = groups.get(k)!;
    return { item: g[0], extraSlots: g.length - 1 };
  });
}

export default function SeanceGrid({
  items,
  showDate = false,
  onSelectItem,
  onSelectVenue,
  empty,
}: Props) {
  if (items.length === 0) {
    return <div className="py-10">{empty}</div>;
  }

  const rows = densify(items);

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(({ item, extraSlots }) => (
        <li key={item.key} className="min-w-0">
          <SeanceCard
            item={item}
            showDate={showDate}
            onSelect={onSelectItem}
            onSelectVenue={onSelectVenue}
            extraSlots={extraSlots}
          />
        </li>
      ))}
    </ul>
  );
}
