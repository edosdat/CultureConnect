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

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.key} className="min-w-0">
          <SeanceCard
            item={item}
            showDate={showDate}
            onSelect={onSelectItem}
            onSelectVenue={onSelectVenue}
          />
        </li>
      ))}
    </ul>
  );
}
