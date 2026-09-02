'use client';

import type { DayItem } from '@/lib/types';
import VisualFallback from './VisualFallback';

type Props = {
  src: string;
  item?: DayItem;
  className?: string;
  /** YouTube-style blurred full-bleed. Cinema fiche / film-card hero only. */
  blurBackdrop?: boolean;
};

/**
 * Compact landscape cine hero (16:7 / 16:9, height-capped).
 * Cinema: same affiche twice — blurred cover behind a sharp contain poster.
 * Theatre/music: contain only (letterbox). Never crop the foreground.
 */
export default function FilmPoster({
  src,
  item,
  className = '',
  blurBackdrop = false,
}: Props) {
  return (
    <div
      data-cine-hero="1"
      className={
        'cine-hero-frame ' +
        (blurBackdrop ? 'cine-hero-frame--blur ' : '') +
        className
      }
    >
      {src ? (
        <>
          {blurBackdrop ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cine-hero-blur" src={src} alt="" aria-hidden />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cine-hero-poster" src={src} alt="" />
        </>
      ) : item ? (
        <div className="absolute inset-0">
          <VisualFallback item={item} />
        </div>
      ) : null}
    </div>
  );
}
