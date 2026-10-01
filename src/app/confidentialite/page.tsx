import type { Metadata } from 'next';
import Link from 'next/link';
import DeleteAccountButton from './DeleteAccountButton';
import MailIdeasCheckbox from '@/components/MailIdeasCheckbox';

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
          <span className="font-medium">Quoi.</span> Ton e-mail Google, ton{' '}
          <span className="font-medium">prénom</span> et ta photo (affichage),
          ton <span className="font-medium">champ libre</span> (phrase de
          goûts), tes chips, et ton{' '}
          <span className="font-medium">historique de clics</span> (ouverture
          de carte, réserve, favori, partage…) pour les suggestions
          «&nbsp;Pour toi&nbsp;».
        </p>
        <p>On affiche ton prénom et ta photo, on ne les met pas en base.</p>
        <p>
          <span className="font-medium">Pourquoi.</span> Personnaliser les
          recommandations «&nbsp;Pour toi&nbsp;».
        </p>
        <p>
          <span className="font-medium">Éditeur.</span> L’éditeur consulte des
          agrégats de goûts et un export interne limité pour ajuster
          «&nbsp;Pour toi&nbsp;».
        </p>
        <p>
          <span className="font-medium">Mails.</span> Jusqu&apos;au 1er
          décembre 2026, le digeste (3 sorties, pas plus d&apos;un mail par
          semaine) part aux comptes Google qui ont un e-mail, même sans la
          case « Envoie-moi 3 idées par mail ». Tu l&apos;arrêtes en un clic,
          lien dans chaque mail, sans te reconnecter. À partir du 1er décembre
          2026, seuls les comptes qui ont coché la case le reçoivent. La case
          sert aussi à le recevoir à nouveau après un désabonnement.
        </p>
        <div className="rounded-2xl border border-culture-line bg-white px-4 py-3">
          <MailIdeasCheckbox className="flex items-start gap-2 text-sm leading-snug text-culture-ink" />
        </div>
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
          <span className="font-medium">Avis.</span> Le bouton «&nbsp;Un avis&nbsp;?&nbsp;»
          envoie ce texte, seul, à OpenAI (États-Unis) pour une réponse courte.
          Une image jointe reste chez Neon (Paris), les mêmes 90&nbsp;jours.
          Elle n’est pas envoyée à OpenAI.
          On le garde chez Neon (Paris), 90&nbsp;jours. Compte connecté&nbsp;:
          une empreinte du compte, pas l’e-mail en clair, et pas le cookie
          visiteur. Sans compte&nbsp;: le cookie{' '}
          <span className="font-medium">cc_vid</span> s’il existe déjà. Jamais
          les deux sur la même ligne. Transfert hors UE&nbsp;: contrat de
          sous-traitance (DPA) et clauses contractuelles types (SCC), des
          garanties adaptées. Ce texte ne sert pas à entraîner un modèle.
          Base&nbsp;: intérêt légitime, la même que le registre, pour lire les
          retours et rédiger la réponse. Ce n’est pas un consentement séparé&nbsp;:
          envoyer lance le traitement. Tu peux t’y opposer en n’envoyant pas,
          ou en écrivant au contact juste après. Compte connecté&nbsp;:
          «&nbsp;Supprimer mon compte&nbsp;» retire les avis liés à cette
          empreinte. Sans compte&nbsp;: pas de bouton. L’effacement avant
          90&nbsp;jours se fait seulement en écrivant à ce contact. Sinon le
          texte part au bout de 90&nbsp;jours.
        </p>
        <p>
          <span className="font-medium">Tes droits.</span> Accès, rectification,
          opposition, suppression (bouton «&nbsp;Supprimer mon compte&nbsp;»
          sur cette page). Contact :{' '}
          <a
            href="mailto:edosdat@gmail.com"
            className="text-culture-terracotta underline-offset-2 hover:underline"
          >
            edosdat@gmail.com
          </a>
          .
        </p>

        <section
          aria-labelledby="opposition-title"
          className="rounded-2xl border border-culture-line bg-culture-cream/60 px-4 py-3"
        >
          <h2
            id="opposition-title"
            className="font-display text-base text-culture-ink"
          >
            Droit d&apos;opposition (article 21)
          </h2>
          <p className="mt-2">
            Tu peux t&apos;opposer à tout moment au traitement de tes goûts et
            clics pour la personnalisation «&nbsp;Pour toi&nbsp;», y compris
            lorsque la base est l&apos;intérêt légitime. Sur cet appareil :
            choisis «&nbsp;Refuser tout&nbsp;» dans le bandeau cookies (ou
            écris-nous). Compte connecté : «&nbsp;Supprimer mon compte&nbsp;»
            efface la ligne en base. On ne te demandera pas de justifier ton
            opposition pour ce profilage lié à CultureConnect.
          </p>
        </section>

        <p>
          <span className="font-medium">Autour de moi.</span> On utilise ta
          position le temps du tri.
        </p>
        <p>On ne la garde pas.</p>
        <p>
          <span className="font-medium">Cookies.</span> Cookies distincts,
          jamais joints. Le traceur de goûts n&apos;est posé qu&apos;après
          «&nbsp;Accepter tout&nbsp;». Jusqu&apos;au 1er décembre 2026, 00:00
          (heure de Paris), le bandeau de choix n&apos;est pas affiché. On
          n&apos;enregistre pas un accord à ta place.
        </p>
        <p>
          <span className="font-medium">cc_signals_v1</span> : 14&nbsp;j (≤&nbsp;13
          mois, non renouvelable automatiquement), goûts sur cet appareil —
          phrase, chips, historique de clics. Base : ton consentement.
        </p>
        <p>
          <span className="font-medium">cc_signals_consent</span> : ~6&nbsp;mois,
          mémorise ton choix Accepter / Refuser.
        </p>
        <p>
          <span className="font-medium">cc_vid</span> : 14&nbsp;j (données
          d&apos;audience ≤&nbsp;25&nbsp;mois), id anonyme visiteurs/retours. Pas
          goûts, pas email. First-party, on ne revend pas.
        </p>
        <p>
          <span className="font-medium">cc_vid</span> est posé au premier
          signal, pas au chargement. HttpOnly, SameSite=Lax, Secure. On ne le
          relie jamais à un compte Google, ni aux goûts en base. Seule
          exception&nbsp;: un avis sans compte peut le garder, seul,
          90&nbsp;jours.
        </p>

        <p>
          <span className="font-medium">Journal d&apos;impressions</span> : une
          ligne par liste vue (Top&nbsp;3, sections) avec les positions des
          cartes — finalité mesure catalogue (taux d&apos;ouverture, items
          jamais ouverts). Même consentement que le traceur goûts
          («&nbsp;Accepter tout&nbsp;»). Stockage serveur TTL&nbsp;21&nbsp;j ;
          pas d&apos;e-mail, pas Neon, pas de goûts. Les indicateurs admin sont
          des approximations (ouvertures signalées ÷ slots rendus).
        </p>
        <p>
          <span className="font-medium">Durées (synthèse).</span> Traceur goûts
          ≤&nbsp;13&nbsp;mois non renouvelable (ici 14&nbsp;j) ; audience
          ≤&nbsp;25&nbsp;mois (ici 14&nbsp;j) ; choix de consentement
          ~6&nbsp;mois ; compte / goûts Neon : 24&nbsp;mois après la dernière
          activité.
        </p>
        <p>
          <span className="font-medium">Partage.</span> Si tu tapes Envie ou
          J’y vais, sur un lien ou sur la fiche, on garde ton prénom avec cette
          réponse. Sur un lien, les autres comptes qui ont aussi tapé Envie ou
          J’y vais sur ce même lien voient ce prénom. Ouvrir le lien ne suffit
          pas. Sur la fiche sans lien : des compteurs seuls, sans noms. On
          n’associe jamais <span className="font-medium">cc_vid</span> à un
          prénom ni à un e-mail.
        </p>
        <p>
          Base légale : intérêt légitime à proposer «&nbsp;Pour toi&nbsp;» côté
          compte, et ton consentement pour le cookie appareil{' '}
          <span className="font-medium">cc_signals_v1</span>. Conservation
          24&nbsp;mois après la dernière activité, puis suppression. Compte
          connecté : tu peux tout effacer via le bouton «&nbsp;Supprimer mon
          compte&nbsp;» ci-dessous.
        </p>
        <p>
          <span className="font-medium">Proposition.</span> Tu peux proposer un
          spectacle manquant. On garde le titre, le lieu, la date et le lien le
          temps de vérifier. Ça n’entre pas dans l’agenda tant qu’on n’a pas
          vérifié. Supprimer le compte retire aussi ces propositions.
        </p>

        <section aria-labelledby="registre-title" className="pt-2">
          <h2
            id="registre-title"
            className="font-display text-base text-culture-ink"
          >
            Registre des traitements
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-culture-line text-culture-muted">
                  <th className="py-2 pr-3 font-medium">Traitement</th>
                  <th className="py-2 pr-3 font-medium">Finalité</th>
                  <th className="py-2 pr-3 font-medium">Base</th>
                  <th className="py-2 font-medium">Durée</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-culture-line/70">
                  <td className="py-2 pr-3">Compte Google</td>
                  <td className="py-2 pr-3">
                    Connexion, affichage prénom / photo
                  </td>
                  <td className="py-2 pr-3">Exécution du service</td>
                  <td className="py-2">Session Auth.js (~30&nbsp;j)</td>
                </tr>
                <tr className="border-b border-culture-line/70">
                  <td className="py-2 pr-3">
                    Profil de goûts (phrase, chips, clics)
                  </td>
                  <td className="py-2 pr-3">
                    Personnalisation «&nbsp;Pour toi&nbsp;»
                  </td>
                  <td className="py-2 pr-3">
                    Consentement (cookie) / compte
                  </td>
                  <td className="py-2">
                    14&nbsp;j appareil ; 24&nbsp;mois compte
                  </td>
                </tr>
                <tr className="border-b border-culture-line/70">
                  <td className="py-2 pr-3">Mesure d&apos;audience (cc_vid)</td>
                  <td className="py-2 pr-3">
                    Visiteurs / retours anonymes, first-party
                  </td>
                  <td className="py-2 pr-3">
                    Intérêt légitime / exemption audience
                  </td>
                  <td className="py-2">14&nbsp;j (≤&nbsp;25&nbsp;mois)</td>
                </tr>
                <tr className="border-b border-culture-line/70">
                  <td className="py-2 pr-3">Journal d&apos;impressions (listes)</td>
                  <td className="py-2 pr-3">
                    Mesure catalogue : listes vues / positions (admin)
                  </td>
                  <td className="py-2 pr-3">Consentement (même porte P8)</td>
                  <td className="py-2">TTL&nbsp;21&nbsp;j serveur</td>
                </tr>
                <tr className="border-b border-culture-line/70">
                  <td className="py-2 pr-3">Avis et idées</td>
                  <td className="py-2 pr-3">
                    Lire les retours et rédiger la réponse courte
                  </td>
                  <td className="py-2 pr-3">Intérêt légitime</td>
                  <td className="py-2">90&nbsp;jours</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">Choix de consentement</td>
                  <td className="py-2 pr-3">
                    Mémoriser Accepter / Refuser le traceur goûts
                  </td>
                  <td className="py-2 pr-3">Obligation / preuve du choix</td>
                  <td className="py-2">~6&nbsp;mois</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <DeleteAccountButton />

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
