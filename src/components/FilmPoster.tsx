'use client';

import { useState } from 'react';
import type { DayItem } from '@/lib/types';
import VisualFallback from './VisualFallback';

type Props = {
  src: string;
  item?: DayItem;
  className?: string;
};

/** 2:3 frame. Portrait: cover + top. Landscape stills: contain — never stretched into 2:3. */
export default function FilmPoster({ src, item, className = '' }: Props) {
  const [landscape, setLandscape] = useState(false);
  return (
    <div
      className={
        'relative aspect-[2/3] overflow-hidden bg-culture-sand ' + className
      }
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          onLoad={(e) => {
            const el = e.currentTarget;
            setLandscape(
              el.naturalWidth > 0 &&
                el.naturalHeight > 0 &&
                el.naturalWidth > el.naturalHeight,
            );
          }}
          className={
            'absolute inset-0 h-full w-full ' +
            (landscape
              ? 'object-contain object-center'
              : 'object-cover object-top')
          }
        />
      ) : item ? (
        <div className="absolute inset-0">
          <VisualFallback item={item} />
        </div>
      ) : null}
    </div>
  );
}
