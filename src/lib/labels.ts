import type { Lieu } from './types';

import { MAIN_CATEGORY_LABELS, mainFromCategorie } from './categories';
import { EXTRA_GENRE_CHIP_LABELS } from './genreChipMatch';

export const CATEGORIE_LABELS: Record<string, string> = {
  atelier: 'Atelier',
  autre: 'Autre',
  cirque: 'Cirque',
  cinema: 'Cinéma',
  cinematheque: 'Cinémathèque',
  cinema_plein_air: 'Cinéma plein air',
  concert: 'Concert',
  conference: 'Conférence',
  danse: 'Danse',
  enfants_famille: 'Enfants / familles',
  expo_patrimoine: 'Expo & patrimoine',
  expo_spectacle: 'Expo / spectacle',
  exposition: 'Exposition',
  lecture: 'Lecture',
  festival: 'Festival',
  festival_cinema: 'Festival cinéma',
  festival_estival: 'Festival estival',
  festival_multi: 'Festival multi',
  festival_musique: 'Festival musique',
  festival_theatre: 'Festival théâtre',
  humour: 'Humour',
  guinguette: 'Guinguette',
  musique: 'Musique',
  opera: 'Opéra',
  salon: 'Salon',
  soirée: 'Soirée',
  soiree: 'Soirée',
  theatre: 'Théâtre',
  theatre_danse: 'Théâtre & danse',
  visite: 'Visite',
};

function humanizeSlug(s: string): string {
  if (!s) return '';
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function labelCategorie(categorie: string): string {
  if (!categorie) return '';
  const key = categorie.trim();
  const direct = CATEGORIE_LABELS[key] ?? CATEGORIE_LABELS[key.toLowerCase()];
  if (direct) return direct;
  const main = mainFromCategorie(key);
  if (main) return MAIN_CATEGORY_LABELS[main];
  return humanizeSlug(key);
}

export const MONTH_NAMES_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export const WEEKDAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function formatDateFr(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function formatHeure(h: string): string {
  if (!h) return '';
  return h.slice(0, 5);
}

export function formatPrix(event: { prix: string; gratuit: string }): string {
  if (event.gratuit?.toLowerCase() === 'oui') return 'Gratuit';
  if (event.prix) return event.prix;
  return 'Tarif non indiqué';
}

/** Prefer item price; fall back to parent event price/gratuit. */
export function formatItemPrix(
  prixItem: string | undefined,
  event?: { prix: string; gratuit: string } | null,
): string {
  if (prixItem) {
    if (prixItem.toLowerCase() === 'gratuit') return 'Gratuit';
    return prixItem;
  }
  if (event) return formatPrix(event);
  return 'Tarif non indiqué';
}

export function formatDateRange(debut: string, fin: string): string {
  if (!debut) return '';
  if (!fin || fin === debut) return formatDateFr(debut);
  return `${formatDateFr(debut)} → ${formatDateFr(fin)}`;
}

export function labelTypeItem(type: string): string {
  if (!type) return '';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Humanize a genre slug when not in legend (replace _ with space, capitalize). */
export function humanizeGenreSlug(slug: string): string {
  const extra = EXTRA_GENRE_CHIP_LABELS[slug.trim().toLowerCase()];
  if (extra) return extra;
  return humanizeSlug(slug);
}

/** Prefer label_affiche, else « Commune — Nom », else nom. */
export function formatLieuAffiche(
  lieu: Pick<Lieu, 'nom' | 'commune' | 'label_affiche'> | null | undefined,
): string {
  if (!lieu) return '';
  if (lieu.label_affiche) return lieu.label_affiche;
  const joined = [lieu.commune, lieu.nom].filter(Boolean).join(' — ');
  return joined || lieu.nom || '';
}
