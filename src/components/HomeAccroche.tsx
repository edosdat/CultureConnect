import { HOME_ACCROCHE_H1, HOME_ACCROCHE_H2 } from '@/lib/displayHome';

/** S2 — H1 locked; H2 Manager default (swap if Eloi locks). Visible under teaser. */
export default function HomeAccroche() {
  return (
    <div data-testid="home-accroche" className="mb-3 px-0 pt-0.5">
      <h1 className="font-display text-[20px] font-semibold leading-[1.25] text-culture-ink sm:text-2xl">
        {HOME_ACCROCHE_H1}
      </h1>
      <p
        data-testid="home-accroche-h2"
        className="mt-1 text-[13px] leading-snug text-culture-muted"
      >
        {HOME_ACCROCHE_H2}
      </p>
    </div>
  );
}
