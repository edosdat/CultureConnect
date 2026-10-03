import Link from 'next/link';

/**
 * Secondary control beside the home search. Cream outline, never a solid pink fill.
 * The words stay visible at phone width; the search field narrows instead.
 */
export default function MixHomeLink() {
  return (
    <Link
      href="/mix"
      aria-label="Mon mix"
      className="mt-[-4px] inline-flex h-12 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-solid border-planc-creme/55 bg-transparent px-3.5 text-[15px] font-bold text-planc-creme hover:border-planc-creme focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-planc-rose"
      style={{ borderWidth: '1.5px' }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-planc-rose"
      >
        <path
          d="M3 1.5v13M8 1.5v13M13 1.5v13"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <rect x="1.4" y="3.6" width="3.2" height="2.5" rx="0.6" fill="currentColor" />
        <rect x="6.4" y="9" width="3.2" height="2.5" rx="0.6" fill="currentColor" />
        <rect x="11.4" y="6" width="3.2" height="2.5" rx="0.6" fill="currentColor" />
      </svg>
      <span>Mon mix</span>
    </Link>
  );
}
