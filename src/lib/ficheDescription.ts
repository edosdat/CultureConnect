import type { DayItem } from './types';

/**
 * Slim list cards omit `description_longue` and clip courte/item to 1–2
 * sentences (`clipListPitch`). Fiches must not flash that truncated pitch.
 */
export function isSlimFichePayload(item: DayItem): boolean {
  const ev = item.evenement;
  if (!ev) return false;
  return ev.description_longue === undefined;
}

function firstFilled(...parts: Array<string | undefined | null>): string {
  for (const part of parts) {
    const t = (part || '').trim();
    if (t) return t;
  }
  return '';
}

/**
 * Full synopsis/pitch for an event fiche.
 * Prefers description_longue, then programme.description_item, then courte.
 * Empty → '' (caller hides the block). Never clips, never invents.
 */
export function ficheDescriptionOf(item: DayItem): string {
  if (isSlimFichePayload(item)) return '';
  if (item.kind === 'programme') {
    const ev = item.evenement;
    return firstFilled(
      ev?.description_longue,
      item.programme.description_item,
      ev?.description_courte,
    );
  }
  return firstFilled(
    item.evenement.description_longue,
    item.evenement.description_courte,
  );
}
