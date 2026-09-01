'use client';

import type { DayItem } from '@/lib/types';
import VisualFallback from './VisualFallback';

type Props = {
  src: string;
  item?: DayItem;
  className?: string;
};

/**
 * Compact landscape cine hero (16:7 / 16:9, height-capped).
 * Full affiche via object-contain — letterbox OK. Never crop.
 */
export default function FilmPoster({ src, item, className = '' }: Props) {
  return (
    <div
      data-cine-hero="1"
      className={'cine-hero-frame ' + className}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" />
      ) : item ? (
        <div className="absolute inset-0">
          <VisualFallback item={item} />
        </div>
      ) : null}
    </div>
  );
}
