import type { DayItem } from './types';

function filled(raw?: string | null): string {
  return (raw || '').trim();
}

/**
 * Fiche copy: prefer the long synopsis/pitch when it exists.
 * Long = description_longue, then programme.description_item.
 * Short (description_courte) only if no long field is filled.
 * Hide the block only when every field is empty. Never invent.
 */
export function ficheDescriptionOf(item: DayItem): string {
  if (item.kind === 'programme') {
    const ev = item.evenement;
    const long = filled(ev?.description_longue) || filled(item.programme.description_item);
    if (long) return long;
    return filled(ev?.description_courte);
  }
  const ev = item.evenement;
  return filled(ev.description_longue) || filled(ev.description_courte);
}
