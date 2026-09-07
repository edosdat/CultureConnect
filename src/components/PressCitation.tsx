import type { PressCitation as PressCitationData } from '@/lib/pressCitation';

type Props = {
  citation: PressCitationData | null;
};

/**
 * One short press quote + source + optional Télérama badge.
 * Renders nothing when the catalogue has no citation.
 */
export default function PressCitation({ citation }: Props) {
  if (!citation) return null;
  const source = citation.source;
  const href = citation.url;
  return (
    <aside
      data-testid="press-citation"
      className="min-w-0 max-w-full"
    >
      <p className="font-display text-base italic leading-snug text-culture-ink break-words">
        {citation.quote}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {href && source ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-culture-terracotta hover:underline"
          >
            {source}
          </a>
        ) : source ? (
          <span className="text-culture-muted">{source}</span>
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-culture-terracotta hover:underline"
          >
            Lire l’article
          </a>
        ) : null}
        {citation.rating ? (
          <span
            className="rounded-full bg-white px-2 py-0.5 text-xs tracking-wide text-culture-cat-theatre"
            aria-label={`Note presse ${citation.rating}`}
          >
            {citation.rating}
          </span>
        ) : null}
      </p>
    </aside>
  );
}
