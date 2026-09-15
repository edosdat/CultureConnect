import {
  HOME_PACK_MORE_ELLIPSIS,
  HOME_SECTION_TITLE_CLASS,
  HOME_SECTION_TITLE_RULE_CLASS,
  homeSectionAccentStyle,
} from '@/lib/displayHome';

type Props = {
  id: 'cine' | 'theatre';
  title: string;
  accentVar: string;
  /** Poster-shaped shells in the thumb strip (380 shows ~2 + ⋯). */
  thumbs?: number;
};

/** In-place cine / théâtre rail while cards hydrate. Photo frame + blur text. */
export default function PackRailSkeleton({
  id,
  title,
  accentVar,
  thumbs = 2,
}: Props) {
  return (
    <section
      id={id}
      data-pack-skeleton={id}
      aria-busy="true"
      aria-label={`Chargement ${title}`}
      className="scroll-mt-16 space-y-3"
    >
      <h2 className={HOME_SECTION_TITLE_CLASS}>
        <span
          className={HOME_SECTION_TITLE_RULE_CLASS}
          style={homeSectionAccentStyle(accentVar)}
        >
          {title}
        </span>
      </h2>
      <div className="space-y-3">
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: thumbs }, (_, i) => (
            <div
              key={i}
              className="aspect-[2/3] w-[7.5rem] shrink-0 animate-pulse rounded-lg bg-culture-sand/80 sm:w-[8.5rem]"
            />
          ))}
          <div
            className="flex aspect-[2/3] w-[7.5rem] shrink-0 items-center justify-center text-2xl font-light tracking-[0.2em] text-culture-muted sm:w-[8.5rem]"
            aria-hidden
          >
            {HOME_PACK_MORE_ELLIPSIS}
          </div>
        </div>
        <div className="overflow-hidden rounded-card-lg border border-culture-line bg-culture-surface shadow-card">
          <div className="cine-hero-frame animate-pulse bg-culture-sand/80" />
          <div className="space-y-2 p-3 md:p-4" aria-hidden>
            <div className="h-5 w-4/5 rounded bg-culture-sand/80 blur-[0.5px]" />
            <div className="h-3 w-2/3 rounded bg-culture-sand/60 blur-[0.5px]" />
            <div className="h-3 w-1/2 rounded bg-culture-sand/50 blur-[0.5px]" />
          </div>
        </div>
      </div>
    </section>
  );
}
