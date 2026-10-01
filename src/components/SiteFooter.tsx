import { Suspense } from 'react';
import Link from 'next/link';
import TasteCookieNotice from './TasteCookieNotice';
import SignalsConsentBanner from './SignalsConsentBanner';
import DigestTestIntro from './DigestTestIntro';

export default function SiteFooter() {
  return (
    <>
      <footer className="mx-auto max-w-7xl px-4 py-3 text-center text-xs text-culture-muted sm:px-6">
        <TasteCookieNotice />
        <p>
          <Link
            href="/confidentialite"
            className="underline-offset-2 hover:text-culture-ink hover:underline"
          >
            Confidentialité
          </Link>
        </p>
      </footer>
      <SignalsConsentBanner />
      <Suspense fallback={null}>
        <DigestTestIntro />
      </Suspense>
    </>
  );
}
