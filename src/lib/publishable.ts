/**
 * Filter out scrape junk / cancelled / non-events before they appear in the UI.
 */

const EXCLUDED_STATUTS = new Set(
  ['ferme', 'annulé', 'annule', 'cancel'].map((s) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  ),
);

/**
 * Case-insensitive substrings that mark text as non-publishable junk.
 * Matching uses normalizeForMatch (NFD accent strip), so "hors fenêtre" ≡ "hors fenetre".
 */
const JUNK_TEXT_PATTERNS = [
  'scrape',
  'scrape http',
  'non scrapable',
  'non scrapable auto',
  'cookie',
  'cookie wall',
  'cookies requis',
  'hub cookies',
  'hub centresculturels',
  'aucune date',
  'aucune date dans',
  'pas de date',
  'pas de spectacle',
  'pas de prog',
  'pas de programmation',
  'hors saison',
  'hors fenetre',
  '(fenetre)',
  'public date',
  'instagram only',
  'prog utile hors',
  'evacuation',
  'conflit',
].map((p) =>
  p
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''),
);

/** Lowercase + NFD accent strip for robust junk matching (fenêtre → fenetre). */
export function normalizeForMatch(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** True if any junk pattern appears in the normalized haystack. */
export function textLooksLikeScrapeJunk(text: string): boolean {
  const hay = normalizeForMatch(text);
  if (!hay.trim()) return false;
  for (const pattern of JUNK_TEXT_PATTERNS) {
    if (hay.includes(pattern)) return true;
  }
  return false;
}

function hasJunkInFields(...fields: Array<string | undefined | null>): boolean {
  for (const field of fields) {
    if (field && textLooksLikeScrapeJunk(field)) return true;
  }
  return false;
}


/** Cinema "à l'affiche / période" room cards — not real films or séances. */
export function isCinemaPeriodAggregate(ev: {
  titre?: string;
  categorie?: string;
}): boolean {
  const cat = normalizeForMatch(ev.categorie || '');
  if (cat !== 'cinema') return false;
  const titre = normalizeForMatch(ev.titre || '');
  if (!titre) return false;
  const hasAffiche =
    titre.includes("a l'affiche") || titre.includes('a l affiche');
  const hasPeriode = titre.includes('periode');
  const filmsAffiche = titre.includes('films a l');
  return (hasAffiche && hasPeriode) || (filmsAffiche && hasPeriode);
}

export function isPublishableEvent(ev: {
  titre: string;
  statut: string;
  categorie: string;
  description_courte?: string;
  notes?: string;
  publication?: string;
}): boolean {
  const statut = normalizeForMatch(ev.statut || '').trim();
  if (statut && EXCLUDED_STATUTS.has(statut)) return false;

  if (normalizeForMatch(ev.publication || '').trim() === 'masque') return false;

  if (isCinemaPeriodAggregate(ev)) return false;

  if (hasJunkInFields(ev.titre, ev.description_courte, ev.notes)) {
    return false;
  }

  return true;
}

/** Same junk checks applied to a programme nom_item (and optional notes). */
export function isPublishableProgrammeName(
  nom: string,
  extra?: { notes?: string; description?: string },
): boolean {
  if (hasJunkInFields(nom, extra?.notes, extra?.description)) return false;
  return true;
}
