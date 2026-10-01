import type { Metadata } from 'next';
import Link from 'next/link';
import { MAIL_IDEAS_LABEL } from '@/lib/mailConsent';
import { unsubscribeByMailToken, type MailUnsubStatus } from '@/lib/mailDigestRecipients';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Digeste — CultureConnect',
  robots: { index: false, follow: false },
};

function copyFor(status: MailUnsubStatus): { title: string; body: string } {
  if (status === 'ok') {
    return {
      title: 'Tu ne recevras plus le digeste.',
      body: `Pour le recevoir à nouveau, coche « ${MAIL_IDEAS_LABEL} » dans Mes goûts, ou sur la page Confidentialité.`,
    };
  }
  if (status === 'error') {
    return {
      title: 'Le désabonnement n’a pas été enregistré.',
      body: `Réessaie dans un instant. Sinon, depuis ton compte, ouvre Confidentialité.`,
    };
  }
  return {
    title: 'Ce lien ne marche pas.',
    body: 'Ouvre le lien du dernier mail. Le désabonnement ne demande pas de connexion Google.',
  };
}

export default async function MailUnsubPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const params = await searchParams;
  const status = await unsubscribeByMailToken(params.t);
  const copy = copyFor(status);
  return (
    <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.15em] text-culture-terracotta">
        CultureConnect
      </p>
      <h1
        className="mt-2 font-display text-3xl text-culture-ink"
        data-unsub-status={status}
      >
        {copy.title}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-culture-ink">{copy.body}</p>
      <p className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link
          href="/confidentialite"
          className="text-culture-terracotta underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
        >
          Confidentialité
        </Link>
        <Link
          href="/"
          className="text-culture-terracotta underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-culture-terracotta"
        >
          Retour à l’agenda
        </Link>
      </p>
    </main>
  );
}
