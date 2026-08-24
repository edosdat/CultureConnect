/** Category pastilles / gradients via CSS vars (--cc-cat-*) in globals.css.
 *  Avoid nested Tailwind opacity modifiers on culture-cat colors (often near-white).
 */

const CAT_KEY: Record<string, string> = {
  Musique: 'musique',
  'Théâtre & danse': 'theatre',
  Festival: 'festival',
  Cinéma: 'cinema',
  'Expo & patrimoine': 'expo',
  'Enfants / familles': 'famille',
};

/** Solid pastille: white text on category color (AA). */
export function catBg(label: string): string {
  const key = CAT_KEY[label];
  return key ? `cc-cat-bg-${key}` : 'bg-culture-muted';
}

/** Compact banner / accent gradient from CSS vars. */
export function catGradient(label: string): string {
  const key = CAT_KEY[label];
  return key ? `cc-cat-grad-${key}` : 'cc-cat-grad-muted';
}

/** CSS custom property name for inline styles (e.g. left accent bar). */
export function catCssVar(label: string): string | null {
  const key = CAT_KEY[label];
  return key ? `--cc-cat-${key}` : null;
}
