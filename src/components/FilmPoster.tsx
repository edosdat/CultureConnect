'use client';

import type { DayItem } from '@/lib/types';
import VisualFallback from './VisualFallback';

type Props = {
  src: string;
  item?: DayItem;
  className?: string;
  /** YouTube iPhone-style same-image blur. Ciné hero/fiche only. */
  blurLetterbox?: boolean;
};

/**
 * Compact landscape cine hero (16:7 / 16:9, height-capped).
 * Full affiche via object-contain — letterbox OK. Never crop.
 */
export default function FilmPoster({
  src,
  item,
  className = '',
  blurLetterbox = true,
}: Props) {
  const blur = Boolean(blurLetterbox && src);
  return (
    <div
      data-cine-hero="1"
      className={
        'cine-hero-frame ' + (blur ? 'cine-hero-frame--blur ' : '') + className
      }
    >
      {src ? (
        <>
          {blur ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={'letterbox-' + src}
              className="cine-hero-letterbox"
              src={src}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={src} className="cine-hero-poster" src={src} alt="" />
        </>
      ) : item ? (
        <div className="absolute inset-0">
          <VisualFallback item={item} />
        </div>
      ) : null}
    </div>
  );
}
