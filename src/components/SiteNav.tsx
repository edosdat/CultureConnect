'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Accueil' },
  { href: '/', label: 'Événements' },
  { href: '/artistes', label: 'Artistes' },
] as const;

export default function SiteNav() {
  const pathname = usePathname() || '/';
  const onArtistes = pathname.startsWith('/artistes');
  const onHome = pathname === '/' || pathname === '';

  function isActive(label: string): boolean {
    if (label === 'Artistes') return onArtistes;
    // Accueil + Événements both point at the calendar home
    if (label === 'Événements' || label === 'Accueil') return onHome;
    return false;
  }

  return (
    <nav
      aria-label="Navigation principale"
      className="border-b border-culture-sand/80 bg-culture-cream/80 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="mr-3 font-display text-lg text-culture-ink hover:text-culture-terracotta"
        >
          CultureConnect
        </Link>
        <div className="flex flex-wrap gap-1">
          {LINKS.map(({ href, label }) => {
            const active = isActive(label);
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={
                  'rounded-full px-3 py-1.5 text-sm transition ' +
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
      </div>
    </nav>
  );
}
