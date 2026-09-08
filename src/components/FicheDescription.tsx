import type { DayItem } from '@/lib/types';
import { ficheDescriptionOf } from '@/lib/ficheDescription';

/** Programme: description_item, then longue, then courte. Hidden only if empty. */
export default function FicheDescription({ item }: { item: DayItem }) {
  const text = ficheDescriptionOf(item);
  if (!text) return null;
  return (
    <section data-testid="fiche-description" className="mt-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
        Description
      </h3>
      <p
        className={
          'mt-2 whitespace-pre-wrap break-words text-base leading-relaxed ' +
          'text-culture-ink line-clamp-none overflow-visible text-clip'
        }
      >
        {text}
      </p>
    </section>
  );
}
