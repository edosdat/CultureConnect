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
 * Same affiche twice: blurred full-bleed cover behind a sharp
 * object-contain portrait. Never crop the foreground. No analysis.
 */
export default function FilmPoster({ src, item, className = '' }: Props) {
  return (
    <div
      data-cine-hero="1"
      className={'cine-hero-frame ' + className}
    >
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="cine-hero-blur"
            src={src}
            alt=""
            aria-hidden
          />
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
