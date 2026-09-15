'use client';

import type { ReactNode } from 'react';
import type { DayItem } from '@/lib/types';
import FilmPoster from './FilmPoster';

type Props = {
  item: DayItem;
  imageSrc: string;
  children: ReactNode;
  priority?: boolean;
  bodyClassName?: string;
  className?: string;
};

/**
 * Cine fiche chrome: stack on ~380, ~1/4 image | ~3/4 text from 900px.
 * Live-ref FAIL: full-bleed landscape hero that pushes DESCRIPTION under the fold.
 */
export default function CineFicheFrame({
  item,
  imageSrc,
  children,
  priority = false,
  bodyClassName = '',
  className = '',
}: Props) {
  return (
    <div
      data-testid="cine-fiche-split"
      className={
        'cine-fiche-split flex flex-col min-[900px]:grid min-[900px]:grid-cols-[1fr_3fr] ' +
        className
      }
    >
      <div className="cine-fiche-visual min-[900px]:min-h-[20rem]">
        <FilmPoster
          src={imageSrc}
          item={item}
          blurBackdrop
          priority={priority}
        />
      </div>
      <div className={'cine-fiche-body min-w-0 break-words ' + bodyClassName}>
        {children}
      </div>
    </div>
  );
}
