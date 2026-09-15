'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthButtons from './AuthButtons';
import TastesOverlayHost from './TastesOverlayHost';

const LINKS = [
  { href: '/', label: 'Agenda' },
  { href: '/artistes', label: 'Artistes' },
] as const;

export default function SiteNav() {
  const pathname = usePathname() || '/';
  const onArtistes = pathname.startsWith('/artistes');
  const onHome = pathname === '/' || pathname === '';

  function isActive(href: string): boolean {
    if (href === '/artistes') return onArtistes;
    if (href === '/') return onHome;
    return false;
  }

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="relative z-30 overflow-visible border-b border-culture-line bg-white"
      >
        <div className="mx-auto flex max-w-7xl min-w-0 items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-6 sm:py-3">
          <Link
            href="/"
            className="mr-auto shrink-0 font-display text-[13px] font-bold text-culture-terracotta hover:text-culture-clay sm:mr-3 sm:text-lg sm:font-normal"
          >
            CultureConnect
          </Link>
          <div className="flex min-w-0 shrink-0 flex-nowrap items-center gap-2 sm:flex-1 sm:gap-1">
            {LINKS.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'shrink-0 rounded-full px-1.5 py-1 text-[11px] transition sm:px-3 sm:py-1.5 sm:text-sm ' +
                    (active
                      ? 'bg-culture-terracotta text-white shadow-sm'
                      : 'text-culture-muted hover:bg-culture-cream hover:text-culture-ink')
                  }
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <div className="relative z-[80] ml-1 shrink-0 overflow-visible">
            <AuthButtons />
          </div>
        </div>
      </nav>
      {/* Home host lives in CultureConnectApp (stays mounted when the menu closes). */}
      {onHome ? null : <TastesOverlayHost />}
    </>
  );
}
