'use client';

import type { DayItem } from '@/lib/types';
import {
  catCssVarOfKey,
  catKeyOfItem,
  catLabelOfItem,
  type CatTokenKey,
} from '@/lib/categoryColor';

type Props = {
  item?: DayItem;
  catKey?: CatTokenKey;
  label?: string;
  className?: string;
};

/** Solid category pastille — white on LOCK cat color. */
export default function CategoryBadge({
  item,
  catKey,
  label,
  className = '',
}: Props) {
  const key = catKey ?? (item ? catKeyOfItem(item) : undefined);
  if (!key && !label) return null;
  const resolved = key ?? 'cine';
  const text = label || (item ? catLabelOfItem(item) : '');
  if (!text) return null;
  return (
    <span
      data-cat-badge={resolved}
      className={
        'inline-flex w-fit max-w-full whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white ' +
        className
      }
      style={{ backgroundColor: `var(${catCssVarOfKey(resolved)})` }}
    >
      {text}
    </span>
  );
}
