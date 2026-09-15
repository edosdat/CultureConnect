import type { DayItem } from '@/lib/types';
import { ficheCastLine, ficheDescriptionView } from '@/lib/ficheDescription';

/** Parked under DESCRIPTION. Hidden when the catalogue has no casting. */
export function FicheCast({ item }: { item: DayItem }) {
  const line = ficheCastLine(item);
  if (!line) return null;
  const names = line.replace(/^Avec :\s*/, '');
  return (
    <p data-testid="fiche-cast" className="mt-2 text-sm text-culture-muted">
      <strong className="font-medium text-culture-ink">Avec :</strong> {names}
    </p>
  );
}

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
