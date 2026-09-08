import type { DayItem } from './types';

function filled(raw?: string | null): string {
  return (raw || '').trim();
}

/**
 * Fiche copy for programme rows: piece pitch first (description_item),
 * then event description_longue, then description_courte.
 * Festival multi-show events share one evenement blurb; each programme
 * row should show its own ARTO/item pitch when that field is filled.
 * Fallback events: longue, then courte.
 * Hide the block only when every field is empty. Never invent.
 */
/**
 * Carousel hero: do not swap the short list pitch for `/api/agenda`
 * longue after first paint — that grows the fiche and jumps the page.
 * Keep the text already shown for this work. Empty → incoming is fine.
 */
export function pickStableCarouselDescription(opts: {
  workKey: string;
  paintedKey: string | null;
  paintedText: string;
  incomingText: string;
}): { workKey: string; text: string } {
  if (opts.paintedKey === opts.workKey && opts.paintedText) {
    return { workKey: opts.workKey, text: opts.paintedText };
  }
  return { workKey: opts.workKey, text: opts.incomingText };
}

export function ficheDescriptionOf(item: DayItem): string {
  if (item.kind === 'programme') {
    const ev = item.evenement;
    return (
      filled(item.programme.description_item) ||
      filled(ev?.description_longue) ||
      filled(ev?.description_courte)
    );
  }
  const ev = item.evenement;
  return filled(ev.description_longue) || filled(ev.description_courte);
}
