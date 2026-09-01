'use client';

import { NEAR_ME_CHIP_LABEL } from '@/lib/nearMe';

type Props = {
  active: boolean;
  pending?: boolean;
  onToggle: () => void;
};

export default function NearMeChip({
  active,
  pending = false,
  onToggle,
}: Props) {
  return (
    <button
      type="button"
      data-near-me=""
      onClick={onToggle}
      aria-pressed={active}
      aria-busy={pending || undefined}
      className={
        'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ' +
        (active
          ? 'border-culture-terracotta bg-culture-terracotta text-white shadow-sm'
          : 'border-culture-line bg-culture-surface text-culture-ink hover:border-culture-terracotta/50')
      }
    >
      {pending ? '…' : NEAR_ME_CHIP_LABEL}
    </button>
  );
}
