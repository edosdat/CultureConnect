'use client';

import { useFavorites } from './FavoritesProvider';

type Props = {
  itemKey: string;
  className?: string;
};

export default function FavoriteButton({ itemKey, className = '' }: Props) {
  const { has, toggle } = useFavorites();
  const on = has(itemKey);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle(itemKey);
      }}
      aria-pressed={on}
      aria-label={on ? 'Retirer des à voir' : 'Ajouter aux à voir'}
      title={on ? 'Retirer des à voir' : 'À voir'}
      className={
        'inline-flex h-10 w-10 items-center justify-center rounded-full border border-culture-line bg-culture-surface text-culture-terracotta hover:bg-culture-soft ' +
        className
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
        />
      </svg>
    </button>
  );
}
