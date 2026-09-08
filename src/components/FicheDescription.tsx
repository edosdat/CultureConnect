import type { DayItem } from '@/lib/types';
import { ficheDescriptionView } from '@/lib/ficheDescription';

/** Programme: description_item, then longue, then courte. Hidden only if empty. */
export default function FicheDescription({
  item,
  pending = false,
}: {
  item: DayItem;
  /** Hold list pitch until /api/agenda detail settles (one paint). */
  pending?: boolean;
}) {
  const view = ficheDescriptionView(item, { pending });
  if (view.kind === 'empty') return null;
  if (view.kind === 'pending') {
    return (
      <section
        data-testid="fiche-description"
        data-pending=""
        aria-busy="true"
        className="mt-3 min-h-[6.5rem]"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-culture-muted">
          Description
        </h3>
        <div className="mt-2 space-y-2" aria-hidden>
          <div className="h-4 w-full animate-pulse rounded bg-culture-sand" />
          <div className="h-4 w-[92%] animate-pulse rounded bg-culture-sand" />
          <div className="h-4 w-[80%] animate-pulse rounded bg-culture-sand" />
        </div>
      </section>
    );
  }
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
        {view.text}
      </p>
    </section>
  );
}
