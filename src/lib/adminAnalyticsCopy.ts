/**
 * Admin analytics — French labels + one-line glossaries (copy only).
 * Aggregations stay in adminAnalytics / adminAnalyticsLoad.
 */

export const SECTION_COPY = {
  trafic: {
    title: 'Trafic',
    intro: 'Invités (cookie) — pas les comptes Google.',
  },
  funnel: { title: 'Funnel agenda' },
  partage: { title: 'Partage' },
  compte: {
    title: 'Compte',
    intro:
      'Comptes Google (Neon). Les visiteurs invités (cookie) ne sont pas joints à ces comptes.',
  },
  mix: { title: 'Mix' },
  activite: { title: 'Activité visiteurs' },
  goutsComptes: {
    title: 'Goûts comptes',
    intro:
      'Préférences renseignées par les comptes (Mes goûts) — pas les tags du catalogue.',
  },
  comptesTable: {
    title: 'Comptes',
    intro:
      'Une ligne par compte. Hash e-mail seulement. Tri par hash / nombre de goûts / date. Top tags = comptes, ≠ catalogue.',
  },
  tokensTable: {
    title: 'Liens de partage',
    intro:
      'Liens créés (identifiant tronqué à l’écran). Hash du compte qui a partagé — jamais l’e-mail en clair.',
  },
  rsvpsTable: {
    title: 'Réponses Envie / J’y vais',
    intro:
      'Réponses sur les liens de partage. Hash store seulement — aucun prénom.',
  },
  visitsTable: {
    title: 'Lectures des liens',
    intro:
      'Agrégat des ouvertures (compteur Neon). Pas de liste visiteur par visiteur, pas d’identifiant anonyme.',
  },
  tagsCatalogue: {
    title: 'Tags catalogue',
    intro:
      'Tags posés sur les événements du catalogue — popularité de couverture, ≠ ce que les gens aiment.',
  },
  impressions: {
    title: 'Impressions (P2)',
    intro:
      'Admin only — jamais sur le site public. Canal `cc:imp:*` (pas le cookie goûts). Un non-clic est un signal faible ; hors scoring profil pour l’instant.',
  },
} as const;

export type KpiCopy = {
  title: string;
  glossary: string;
  hint?: string;
};

export const KPI_COPY: Record<string, KpiCopy> = {
  '1': {
    title: 'Visiteurs distincts (7 jours)',
    glossary:
      'Visiteurs différents ayant consulté le site sur 7 jours (détail par jour Paris ci-dessous). 0 un jour = personne ce jour-là, ou nav privée / multi-device — chiffre minorant.',
  },
  '2': {
    title: 'Visiteurs de retour (invités)',
    glossary:
      'Visiteurs sans compte (cookie) vus au moins 2 jours Paris distincts sur 7. Minorant. Ce n’est pas les comptes Google connectés.',
  },
  '3': {
    title: 'Fiches ouvertes',
    glossary:
      'Nombre de fois où une fiche événement ou film a été ouverte. 0 est normal s’il n’y a pas encore eu de consultation de fiche.',
  },
  '4': {
    title: 'Clics Réserver (hors site)',
    glossary:
      'Clics sur Réserver qui quittent le site vers la billetterie. 0 est normal : on peut consulter sans réserver.',
  },
  '5': {
    title: 'Liens de partage créés',
    glossary:
      'Nouveaux liens de partage d’une sortie, sur 7 jours. 0 est normal si personne n’a encore partagé.',
  },
  '6': {
    title: 'Lectures d’un lien de partage',
    glossary:
      'Moyenne et médiane des ouvertures par lien. 0 est normal si les liens n’ont pas encore été ouverts.',
  },
  '7': {
    title: 'Réponses Envie et J’y vais',
    glossary:
      'Personnes qui ont dit Envie ou J’y vais sur un partage. 0 est normal si les partages n’ont pas encore de réponses.',
  },
  '8': {
    title: 'Personnes qui ont partagé',
    glossary:
      'Comptes distincts ayant créé un lien de partage sur 7 jours. 0 est normal s’il n’y a pas eu de partage cette semaine.',
  },
  '9': {
    title: 'Comptes Google',
    glossary:
      'Total des comptes Google distincts enregistrés dans Neon depuis le début. 0 = vraiment aucun compte, pas un compteur qui démarre plus tard. Si Neon ne répond pas, la carte affiche —.',
  },
  '10': {
    title: 'Actions des visiteurs non connectés',
    glossary:
      'Volume d’actions (ouvrir une fiche, cliquer, etc.) des visiteurs sans compte, sur 7 jours. 0 est normal s’il n’y a pas encore d’activité, ou si le suivi est incomplet (minorant).',
  },
  '11': {
    title: 'Part ciné / théâtre / musique',
    glossary:
      'Parmi les fiches ouvertes, répartition par catégorie. 0 partout est normal s’il n’y a aucune ouverture de fiche.',
  },
  '12': {
    title: 'Comptes avec / sans goûts',
    glossary:
      'Comptes qui ont renseigné Mes goûts vs ceux qui n’ont rien choisi. 0 « avec goûts » est normal tant que les comptes n’ont pas encore rempli leurs préférences.',
  },
  '13': {
    title: 'Nombre de goûts par compte',
    glossary:
      'Combien de goûts (ambiances + genres) chaque compte a cochés. Le seau « 0 » est normal : compte créé sans préférences.',
  },
  '14': {
    title: 'Couverture tags du catalogue',
    glossary:
      'Part des événements du catalogue qui portent au moins un tag utile (ambiances / genres). 0 % est normal seulement si rien n’est encore tagué dans le catalogue — ce n’est pas un score de goûts.',
  },
  '15': {
    title: 'Top tags catalogue Toulouse',
    glossary:
      'Tags les plus fréquents sur les événements Toulouse du catalogue (popularité de couverture). Ce n’est pas ce que les gens aiment — ≠ goûts des comptes. 0 / liste vide est normal s’il n’y a pas encore de tags utiles à Toulouse.',
  },
  '16': {
    title: 'Actions visiteurs, par type',
    glossary:
      'Détail des actions des visiteurs non connectés (ouvrir une fiche, Réserver, etc.). 0 est normal s’il n’y a pas encore d’activité (minorant).',
  },
  '17': {
    title: 'Comptes prêts pour le matching',
    glossary:
      'Comptes avec au moins 5 goûts (ambiances + genres). 0 est normal tant que peu de comptes ont assez de préférences.',
  },
  '18': {
    title: 'Export CSV des profils goûts',
    glossary:
      'Téléchargement interne de tous les comptes avec goûts (e-mail masqué, pas de liste nominative). 0 profil est normal s’il n’y a pas encore de goûts enregistrés.',
  },
  '19': {
    title: 'Actifs 7 jours',
    glossary:
      'Comptes Google avec au moins une action Neon sur les 7 jours calendaires de Paris : enregistrement des goûts ou des signaux du compte, création d’un lien de partage, ou réponse Envie / J’y vais. Il n’y a pas de date de dernière connexion, donc un simple login n’est pas compté. Les ouvertures de lien ne sont pas rattachées à un compte. Même horloge que Comptes de retour, y compris les horodatages des signaux récents (plafond 40). 0 = aucun compte dans ce cas. Si Neon ne répond pas, la carte affiche —.',
  },
  '21': {
    title: 'Comptes de retour',
    glossary:
      'Comptes Google avec une action Neon sur au moins 2 jours Paris distincts dans la fenêtre 7 jours (goûts / signaux, partage, Envie / J’y vais). Login seul non compté. Proxy / minorant (pas d’historique de connexion en base ; signaux récents plafonnés). Différent des visiteurs invités. 0 = aucun compte dans ce cas. Neon indisponible → —.',
  },
  '20': {
    title: 'Connectés et non connectés',
    glossary:
      'Sur 7 jours Paris, deux populations indépendantes additionnées seulement comme base d’affichage : non connectés = visiteurs distincts sans compte (le même chiffre que les visiteurs distincts), connectés = comptes actifs 7 jours. Ce ne sont pas les mêmes personnes rapprochées. Base = non connectés + connectés. 0 et 0 donnent 0 / 0 (0 %). Si Neon ne répond pas, les pourcentages ne s’affichent pas.',
  },
  'p2-form': {
    title: 'Ouvertures ÷ impressions, par forme',
    glossary:
      'Parmi les propositions affichées (Top 3 / sections), part qui mène à une ouverture de fiche, par forme (ciné / théâtre / musique). 0 % est normal tant que le journal d’impressions est vide.',
  },
  'p2-action': {
    title: 'Actions ÷ ouvertures, par forme',
    glossary:
      'Parmi les fiches ouvertes, part qui convertit (agenda, ICS, réserver, favori, billetterie, partage). Mesure si la fiche convertit.',
  },
  'p2-pos': {
    title: 'Taux d’ouverture par position (1–5)',
    glossary:
      'Le rang est le premier facteur de confusion. Si le rang 5 n’ouvre presque jamais, le slot sert peu.',
  },
  'p2-zero': {
    title: 'Items >100 impressions, 0 ouverture',
    glossary:
      'Catalogue à corriger (visuel, titre, horaire). Jamais affiché côté public — un compteur de vues ferait paraître le vivant déserté.',
  },
};

/** Compte vs invité — shown under the Compte cards. Never a vid↔email join. */
export const COMPTE_VS_INVITE_GLOSSARY = [
  { term: 'Compte Google', def: 'Identité Neon (account_tastes).' },
  { term: 'Invité', def: 'Cookie cc_vid + KV ; jamais joint à un e-mail.' },
  { term: 'Actifs 7 jours', def: 'Compte avec ≥1 jour d’action Neon.' },
  { term: 'Comptes de retour', def: 'Compte avec ≥2 jours d’action Neon.' },
  {
    term: 'Visiteurs de retour (invités)',
    def: 'Cookie avec ≥2 jours.',
  },
] as const;

/** Display labels for guest action kinds — data keys unchanged. */
export const SIGNAL_KIND_LABELS: Record<string, string> = {
  open_card: 'Ouverture de fiche',
  outbound_click: 'Clic Réserver',
  reserve: 'Réserver (sur place)',
  agenda_add: 'Ajout à l’agenda',
  ics: 'Export calendrier',
  favorite: 'Favori',
  unfavorite: 'Retrait favori',
  not_interested: 'Pas pour moi',
  share: 'Partage',
  open_shared: 'Ouverture d’un lien partagé',
  chip_time: 'Filtre horaire',
  chip_cat: 'Filtre catégorie',
  chip_genre: 'Filtre genre',
  search: 'Recherche',
  tastes_text: 'Texte Mes goûts',
};

export function signalKindLabel(kind: string): string {
  return SIGNAL_KIND_LABELS[kind] || kind;
}
