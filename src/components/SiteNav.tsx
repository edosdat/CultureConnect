'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthButtons from './AuthButtons';

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
    <nav
      aria-label="Navigation principale"
      className="border-b border-culture-line/80 bg-culture-cream/80 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl min-w-0 items-center gap-1 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="mr-3 shrink-0 font-display text-lg text-culture-ink hover:text-culture-terracotta"
        >
          CultureConnect
        </Link>
        <div className="flex min-w-0 flex-nowrap gap-1 overflow-x-auto">
          {LINKS.map(({ href, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={
                  'shrink-0 rounded-full px-3 py-1.5 text-sm transition ' +
                  (active
                    ? 'bg-culture-terracotta text-white shadow-sm'
                    : 'text-culture-muted hover:bg-white hover:text-culture-ink')
                }
              >
                {label}
              </Link>
            );
          })}
        </div>
        <AuthButtons />
      </div>
    </nav>
  );
}
