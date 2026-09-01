'use client';

import type { DayItem } from '@/lib/types';
import { vivantComplementLead } from '@/lib/vivantComplementCopy';
import { itemHeure, itemTitle } from '@/lib/displayHome';

type Props = {
  film: DayItem;
  items: DayItem[];
  onSelect?: (key: string) => void;
};

/** Compact living-arts lines under a cinema hero. Not posters, not a CTA. */
export default function VivantComplementLinks({
  film,
  items,
  onSelect,
}: Props) {
  if (items.length === 0 || !onSelect) return null;
  return (
    <ul className="space-y-0.5" data-testid="vivant-complements">
      {items.map((it) => {
        const lead = vivantComplementLead(film, it);
        const title = itemTitle(it);
        const heure = itemHeure(it);
        return (
          <li key={it.key}>
            <button
              type="button"
              onClick={() => onSelect(it.key)}
              className="block w-full truncate text-left text-xs leading-snug text-culture-ink hover:text-culture-terracotta"
            >
              <span className="text-culture-muted">{lead}</span>
              <span> · {title}</span>
              {heure ? <span className="text-culture-muted"> · {heure}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
