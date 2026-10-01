import type { Metadata } from 'next';
import Link from 'next/link';
import { AUTH_ERROR_RETRY_HREF, authErrorCopy } from '@/lib/authErrorCopy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connexion — CultureConnect',
  robots: { index: false, follow: false },
};

export default async function AuthErreurPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const copy = authErrorCopy(params.error);

  return (
    <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.15em] text-culture-terracotta">
        CultureConnect
      </p>
      <h1
        className="mt-2 font-display text-3xl text-culture-ink"
        data-auth-error={copy.code}
      >
        {copy.title}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-culture-ink">{copy.body}</p>
      <p className="mt-6 text-sm">
        <Link
          href={AUTH_ERROR_RETRY_HREF}
          className="text-culture-terracotta underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
        >
          Réessayer
        </Link>
      </p>
    </main>
  );
}
