import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Confidentialité — CultureConnect',
  description:
    'Qui traite tes données, pourquoi, où, et comment les supprimer.',
};

export default function ConfidentialitePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-medium uppercase tracking-[0.15em] text-culture-terracotta">
        CultureConnect
      </p>
      <h1 className="mt-1 font-display text-3xl text-culture-ink">
        Confidentialité
      </h1>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-culture-ink">
        <p>
          <span className="font-medium">Qui.</span> CultureConnect est édité
          par Eloi DOSDAT.
        </p>
        <p>
          <span className="font-medium">Quoi.</span> Ton e-mail Google, et tes
          goûts (chips / phrases) pour les suggestions.
        </p>
        <p>On affiche ton prénom et ta photo, on ne les met pas en base.</p>
        <p>
          <span className="font-medium">Pourquoi.</span> Personnaliser les
          recommandations «&nbsp;Pour toi&nbsp;».
        </p>
        <p>
          <span className="font-medium">Où.</span> Vercel (hébergement), Neon
          (base), Google (connexion).
        </p>
        <p>
          <span className="font-medium">Qui voit tes données.</span> Vercel
          (site), Neon à Paris (goûts), Google (connexion). Google et le CDN
          Vercel peuvent être hors UE. Si ta phrase ne correspond à aucun mot
          du dico, on envoie ce texte seul à OpenAI (États-Unis) pour la
          taguer. Le dico passe d’abord. Pas l’email, pas tes chips, pas tes
          clics.
        </p>
        <p>
          <span className="font-medium">Tes droits.</span> Accès, rectification,
          opposition, suppression (menu compte → Supprimer mon compte). Contact
          :{' '}
          <a
            href="mailto:edosdat@gmail.com"
            className="text-culture-terracotta underline-offset-2 hover:underline"
          >
            edosdat@gmail.com
          </a>
          .
        </p>
        <p>
          Base légale : intérêt légitime à proposer «&nbsp;Pour toi&nbsp;», et
          ton action quand tu indiques tes goûts. Conservation 24 mois après
          la dernière activité, puis suppression. Cookie visiteur : 14 jours.
          Compte connecté : tu peux tout effacer via «&nbsp;Supprimer mon
          compte&nbsp;».
        </p>
      </div>

      <p className="mt-8 text-sm text-culture-muted">
        <Link
          href="/"
          className="text-culture-terracotta underline-offset-2 hover:underline"
        >
          Retour à l&apos;agenda
        </Link>
      </p>
    </main>
  );
}
