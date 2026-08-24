/** Map UI category labels to Tailwind bg token classes. */
const CAT: Record<string, string> = {
  Musique: 'bg-culture-cat-musique',
  'Théâtre & danse': 'bg-culture-cat-theatre',
  Festival: 'bg-culture-cat-festival',
  Cinéma: 'bg-culture-cat-cinema',
  'Expo & patrimoine': 'bg-culture-cat-expo',
  'Enfants / familles': 'bg-culture-cat-famille',
};

const CAT_GRADIENT: Record<string, string> = {
  Musique: 'from-culture-cat-musique/80 to-culture-cat-musique/40',
  'Théâtre & danse': 'from-culture-cat-theatre/80 to-culture-cat-theatre/40',
  Festival: 'from-culture-cat-festival/80 to-culture-cat-festival/40',
  Cinéma: 'from-culture-cat-cinema/80 to-culture-cat-cinema/40',
  'Expo & patrimoine': 'from-culture-cat-expo/80 to-culture-cat-expo/40',
  'Enfants / familles': 'from-culture-cat-famille/80 to-culture-cat-famille/40',
};

export function catBg(label: string): string {
  return CAT[label] ?? 'bg-culture-muted';
}

export function catGradient(label: string): string {
  return CAT_GRADIENT[label] ?? 'from-culture-muted/70 to-culture-sand';
}
