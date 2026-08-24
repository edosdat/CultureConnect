/**
 * Filter out scrape junk / cancelled / non-events before they appear in the UI.
 */

const EXCLUDED_STATUTS = new Set([
  'ferme',
  'annulé',
  'annule',
  'cancel',
]);

/** Case-insensitive substrings / phrases that mark a titre as non-publishable junk. */
const JUNK_TITRE_PATTERNS = [
  'scrape',
  'non scrapable',
  'cookie',
  'hub cookies',
  'hub centresculturels',
  'aucune date',
  'pas de spectacle',
  'pas de prog',
  'pas de programmation',
  'hors saison',
  'hors fenêtre',
  'instagram only',
  'non scrapable auto',
];

export function isPublishableEvent(ev: {
  titre: string;
  statut: string;
  categorie: string;
  description_courte?: string;
}): boolean {
  const statut = (ev.statut || '').trim().toLowerCase();
  if (statut && EXCLUDED_STATUTS.has(statut)) return false;

  const titre = (ev.titre || '').toLowerCase();
  for (const pattern of JUNK_TITRE_PATTERNS) {
    if (titre.includes(pattern.toLowerCase())) return false;
  }

  return true;
}

/** Same junk checks applied to a programme nom_item when parent evenement is null. */
export function isPublishableProgrammeName(nom: string): boolean {
  const titre = (nom || '').toLowerCase();
  for (const pattern of JUNK_TITRE_PATTERNS) {
    if (titre.includes(pattern.toLowerCase())) return false;
  }
  return true;
}
