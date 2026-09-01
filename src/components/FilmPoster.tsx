'use client';

import type { DayItem } from '@/lib/types';
import VisualFallback from './VisualFallback';

type Props = {
  src: string;
  item?: DayItem;
  className?: string;
};

/**
 * Compact landscape cine hero (16:7 mobile / 16:9 md+).
 * Full affiche via object-contain — letterbox OK. Never crop.
 */
export default function FilmPoster({ src, item, className = '' }: Props) {
  return (
    <div
      className={
        'relative aspect-[16/7] w-full overflow-hidden bg-culture-sand md:aspect-[16/9] ' +
        className
      }
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : item ? (
        <div className="absolute inset-0">
          <VisualFallback item={item} />
        </div>
      ) : null}
    </div>
  );
}
