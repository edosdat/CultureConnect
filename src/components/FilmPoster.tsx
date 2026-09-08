'use client';

import { useEffect, useState } from 'react';
import type { DayItem } from '@/lib/types';
import VisualFallback from './VisualFallback';

type Props = {
  src: string;
  item?: DayItem;
  className?: string;
  /** YouTube-style blurred full-bleed behind a sharp contain poster. All packs. */
  blurBackdrop?: boolean;
};

/**
 * Compact landscape pack hero (16:7 / 16:9, height-capped).
 * Same image twice — blurred cover behind a sharp contain poster.
 * Used by cine, theatre, musique, enfants, expo. Never crop the foreground.
 */
export default function FilmPoster({
  src,
  item,
  className = '',
  blurBackdrop = true,
}: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const showPhoto = Boolean(src.trim()) && !failed;
  const fallback = item ? (
    <div className="absolute inset-0">
      <VisualFallback item={item} />
    </div>
  ) : null;

  return (
    <div
      data-cine-hero="1"
      className={
        'cine-hero-frame ' +
        (blurBackdrop ? 'cine-hero-frame--blur ' : '') +
        className
      }
    >
      {showPhoto ? (
        <>
          {blurBackdrop ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="cine-hero-blur"
              src={src}
              alt=""
              aria-hidden
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="cine-hero-poster"
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        fallback
      )}
    </div>
  );
}
