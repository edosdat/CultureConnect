/** Category pastilles / barre via CSS vars (--cc-cat-*) in globals.css.
 *  One hue per cat. Unknown labels use --cc-cat-autre.
 */

const CAT_KEY: Record<string, string> = {
  Musique: 'musique',
  'Théâtre & danse': 'theatre',
  Festival: 'festival',
  Cinéma: 'cinema',
  'Expo & patrimoine': 'expo',
  'Enfants / familles': 'famille',
};

function catKey(label: string): string {
  return CAT_KEY[label] ?? 'autre';
}

/** Solid pastille: white text on category color. */
export function catBg(label: string): string {
  return `cc-cat-bg-${catKey(label)}`;
}

/** Compact banner / accent gradient from CSS vars. */
export function catGradient(label: string): string {
  return `cc-cat-grad-${catKey(label)}`;
}

/** CSS custom property name for inline styles (e.g. left accent bar). */
export function catCssVar(label: string): string {
  return `--cc-cat-${catKey(label)}`;
}
