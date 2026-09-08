const TEXT = 'Connecte-toi pour tes suggestions';
const CLASS =
  'block min-h-5 text-left text-[14px] font-medium leading-5 text-culture-terracotta hover:underline';

/**
 * Guest line inside Top 3. Always painted on first paint / fallback so the
 * cards do not drop ~32px when session resolves to unauthenticated.
 */
export default function Top3GuestCta({
  onClick,
}: {
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <p data-top3-guest-cta="" className={CLASS} aria-hidden>
        {TEXT}
      </p>
    );
  }
  return (
    <button type="button" data-top3-guest-cta="" onClick={onClick} className={CLASS}>
      {TEXT}
    </button>
  );
}
