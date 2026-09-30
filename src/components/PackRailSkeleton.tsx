import { HOME_PACK_MORE_ELLIPSIS } from '@/lib/displayHome';

type Props = {
  id: 'cine' | 'theatre';
  title: string;
  /** 2-up shells on 380 (mock B). */
  thumbs?: number;
  showMore?: boolean;
};

/** List shell only. Image bytes never open or clear this rail. */
export default function PackRailSkeleton({
  id,
  title,
  thumbs = 2,
  showMore = true,
}: Props) {
  const cine = id === 'cine';
  return (
    <section
      id={id}
      data-pack-skeleton={id}
      aria-busy="true"
      aria-label={`Chargement ${title}`}
      className="scroll-mt-16"
    >
      <p
        className={
          'mb-1.5 text-[11px] font-bold uppercase tracking-[0.04em] ' +
          (cine ? 'text-[color:var(--cat-cine)]' : 'text-[color:var(--cat-theatre)]')
        }
      >
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: thumbs }, (_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-[10px] border border-culture-line bg-white"
          >
            <div
              className={
                'cc-s1-ph ' + (cine ? 'cc-s1-ph-cine' : 'cc-s1-ph-theatre')
              }
            />
            <div className="p-2" aria-hidden>
              <div className={'cc-s1-skel ' + (i === 0 ? 'w-4/5' : 'w-4/5')} />
              <div className={'cc-s1-skel mb-0 ' + (i === 0 ? 'w-3/5' : 'w-2/5')} />
            </div>
          </div>
        ))}
      </div>
      {showMore ? (
        <p
          className="more py-2.5 text-center text-lg tracking-[0.15em] text-culture-muted"
          aria-hidden
        >
          {HOME_PACK_MORE_ELLIPSIS}
        </p>
      ) : null}
    </section>
  );
}

/** Idle pack: the list generation finished (or never started) with no rows. */
export function PackRailEmpty({
  id,
  title,
}: {
  id: 'cine' | 'theatre';
  title: string;
}) {
  const cine = id === 'cine';
  return (
    <section
      id={id}
      data-pack-empty={id}
      aria-label={`Aucun résultat — ${title}`}
      className="scroll-mt-16"
    >
      <p
        className={
          'mb-1.5 text-[11px] font-bold uppercase tracking-[0.04em] ' +
          (cine ? 'text-[color:var(--cat-cine)]' : 'text-[color:var(--cat-theatre)]')
        }
      >
        {title}
      </p>
      <p className="rounded-[10px] border border-dashed border-culture-line bg-culture-surface px-4 py-6 text-center text-sm text-culture-muted">
        Rien pour ce filtre
      </p>
    </section>
  );
}
